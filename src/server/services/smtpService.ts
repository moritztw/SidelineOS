import nodemailer from 'nodemailer';
import type { SmtpKonfiguration } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { entschluesseleGeheimnis, verschluesseleGeheimnis } from '../security.ts';

const SETTING_KEY_SMTP = 'smtp';

interface StoredSmtpSetting {
  host: string;
  port: number;
  absender: string;
  benutzer: string;
  passwortEncrypted: string;
  tlsAktiv: boolean;
}

export interface VollSmtpKonfiguration {
  host: string;
  port: number;
  absender: string;
  benutzer: string;
  passwort: string;
  tlsAktiv: boolean;
}

export interface SmtpUpdatePayload {
  host: string;
  port: number;
  absender: string;
  benutzer: string;
  passwort?: string;
  clearPasswort?: boolean;
  tlsAktiv: boolean;
}

export interface SmtpTransportAdapter {
  verify(): Promise<unknown>;
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }>;
}

export type SmtpTransportFactory = (konfig: VollSmtpKonfiguration) => SmtpTransportAdapter;

function defaultTransportFactory(konfig: VollSmtpKonfiguration): SmtpTransportAdapter {
  const secureDirect = konfig.port === 465;
  return nodemailer.createTransport({
    host: konfig.host,
    port: konfig.port,
    secure: secureDirect,
    requireTLS: !secureDirect && konfig.tlsAktiv,
    ...(konfig.benutzer
      ? {
          auth: {
            user: konfig.benutzer,
            pass: konfig.passwort,
          },
        }
      : {}),
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  }) as unknown as SmtpTransportAdapter;
}

export function istSmtpKonfiguriert(konfig: Pick<VollSmtpKonfiguration, 'host' | 'port' | 'absender'>): boolean {
  const host = konfig.host.trim();
  return Boolean(
    host &&
      host !== 'smtp.example.org' &&
      konfig.port > 0 &&
      konfig.port <= 65535 &&
      konfig.absender.trim()
  );
}

export class SmtpService {
  private readonly transportFactory: SmtpTransportFactory;

  constructor(
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig,
    optionen: { transportFactory?: SmtpTransportFactory } = {}
  ) {
    this.transportFactory = optionen.transportFactory ?? defaultTransportFactory;
  }

  async holeEffektiveKonfig(): Promise<VollSmtpKonfiguration> {
    const gespeichert = await this.repo.holeSystemSetting<StoredSmtpSetting>(SETTING_KEY_SMTP);
    if (!gespeichert) {
      return { ...this.config.smtp };
    }

    const entschluesselt = gespeichert.passwortEncrypted
      ? entschluesseleGeheimnis(gespeichert.passwortEncrypted, this.config.sessionSecret)
      : '';

    return {
      host: gespeichert.host ?? this.config.smtp.host,
      port:
        Number(gespeichert.port) > 0 && Number(gespeichert.port) <= 65535
          ? Number(gespeichert.port)
          : this.config.smtp.port,
      absender: gespeichert.absender ?? this.config.smtp.absender,
      benutzer: gespeichert.benutzer ?? this.config.smtp.benutzer,
      passwort: entschluesselt || this.config.smtp.passwort,
      tlsAktiv:
        typeof gespeichert.tlsAktiv === 'boolean'
          ? gespeichert.tlsAktiv
          : this.config.smtp.tlsAktiv,
    };
  }

  async holeMaskierteKonfig(): Promise<SmtpKonfiguration> {
    const voll = await this.holeEffektiveKonfig();
    return {
      host: voll.host,
      port: voll.port,
      absender: voll.absender,
      benutzer: voll.benutzer,
      tlsAktiv: voll.tlsAktiv,
      hatPasswort: Boolean(voll.passwort),
      konfiguriert: istSmtpKonfiguriert(voll),
    };
  }

  async speichereKonfig(input: SmtpUpdatePayload): Promise<SmtpKonfiguration> {
    const host = input.host.trim();
    const port = Number(input.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('SMTP-Port muss zwischen 1 und 65535 liegen.');
    }
    const absender =
      input.absender.trim() || `${this.config.brandName} <noreply@sidelineos.local>`;
    const benutzer = input.benutzer.trim();

    const aktuell = await this.holeEffektiveKonfig();
    let naechstesPasswort = aktuell.passwort;
    if (input.clearPasswort) {
      naechstesPasswort = '';
    } else if (typeof input.passwort === 'string' && input.passwort.trim().length > 0) {
      naechstesPasswort = input.passwort.trim();
    }

    const zuSpeichern: StoredSmtpSetting = {
      host,
      port,
      absender,
      benutzer,
      passwortEncrypted: naechstesPasswort
        ? verschluesseleGeheimnis(naechstesPasswort, this.config.sessionSecret)
        : '',
      tlsAktiv: Boolean(input.tlsAktiv),
    };

    await this.repo.speichereSystemSetting(SETTING_KEY_SMTP, zuSpeichern);
    return this.holeMaskierteKonfig();
  }

  async testeVerbindung(
    override?: Partial<SmtpUpdatePayload>,
    testEmpfaenger?: string
  ): Promise<{ ok: boolean; nachricht: string }> {
    const basis = await this.holeEffektiveKonfig();
    const kandidat: VollSmtpKonfiguration = {
      host: typeof override?.host === 'string' ? override.host.trim() : basis.host,
      port:
        typeof override?.port === 'number' && Number.isInteger(override.port)
          ? override.port
          : basis.port,
      absender:
        typeof override?.absender === 'string' && override.absender.trim()
          ? override.absender.trim()
          : basis.absender,
      benutzer:
        typeof override?.benutzer === 'string' ? override.benutzer.trim() : basis.benutzer,
      passwort:
        typeof override?.passwort === 'string' && override.passwort.trim()
          ? override.passwort.trim()
          : basis.passwort,
      tlsAktiv:
        typeof override?.tlsAktiv === 'boolean' ? override.tlsAktiv : basis.tlsAktiv,
    };

    if (!istSmtpKonfiguriert(kandidat)) {
      return {
        ok: false,
        nachricht: 'SMTP-Host, Port (1–65535) und Absender müssen gültig gesetzt sein.',
      };
    }

    try {
      const transport = this.transportFactory(kandidat);
      await transport.verify();

      const ziel = testEmpfaenger?.trim();
      if (ziel && ziel.includes('@')) {
        await transport.sendMail({
          from: kandidat.absender,
          to: ziel,
          subject: `${this.config.brandName} · SMTP-Verbindungstest`,
          text: `Der SMTP-Versand deiner ${this.config.brandName}-Instanz (${kandidat.host}:${kandidat.port}) funktioniert.`,
        });
        return {
          ok: true,
          nachricht: `SMTP-Verbindung OK und Test-E-Mail an ${ziel} gesendet.`,
        };
      }

      return {
        ok: true,
        nachricht: `SMTP-Verbindung zu ${kandidat.host}:${kandidat.port} erfolgreich verifiziert.`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unbekannter SMTP-Fehler';
      return {
        ok: false,
        nachricht: `SMTP-Prüfung fehlgeschlagen: ${detail}`,
      };
    }
  }

  async sendeEinladungsMail(params: {
    empfaenger: string;
    teamName: string;
    rolleLabel: string;
    einladungsPfad: string;
    gueltigBis: string;
  }): Promise<{
    gesendet: boolean;
    modus: 'SMTP' | 'OFFLINE_FALLBACK';
    hinweis: string;
    messageId?: string;
  }> {
    const konfig = await this.holeEffektiveKonfig();
    if (!istSmtpKonfiguriert(konfig)) {
      return {
        gesendet: false,
        modus: 'OFFLINE_FALLBACK',
        hinweis:
          'Kein aktiver SMTP-Server konfiguriert — Einladung gespeichert, Link bitte manuell kopieren.',
      };
    }

    const basisUrl = this.config.appUrl.replace(/\/+$/, '');
    const einladungsUrl = `${basisUrl}${params.einladungsPfad}`;

    try {
      const transport = this.transportFactory(konfig);
      const info = await transport.sendMail({
        from: konfig.absender,
        to: params.empfaenger,
        subject: `${this.config.brandName} Einladung · ${params.teamName}`,
        text: [
          `Du wurdest als ${params.rolleLabel} zum Team "${params.teamName}" in ${this.config.brandName} eingeladen.`,
          '',
          `Einladungslink öffnen: ${einladungsUrl}`,
          `Gültig bis: ${params.gueltigBis}`,
        ].join('\n'),
      });
      return {
        gesendet: true,
        modus: 'SMTP',
        messageId: info.messageId,
        hinweis: `Einladungs-E-Mail wurde über SMTP an ${params.empfaenger} versendet.`,
      };
    } catch {
      return {
        gesendet: false,
        modus: 'OFFLINE_FALLBACK',
        hinweis:
          'SMTP-Server derzeit nicht erreichbar — Einladung angelegt, Link bitte manuell weitergeben.',
      };
    }
  }

  async sendeTextMail(params: {
    empfaenger: string;
    betreff: string;
    text: string;
  }): Promise<{ gesendet: boolean; messageId?: string; fehler?: string }> {
    const konfig = await this.holeEffektiveKonfig();
    if (!istSmtpKonfiguriert(konfig)) {
      return { gesendet: false, fehler: 'SMTP ist nicht konfiguriert.' };
    }
    try {
      const transport = this.transportFactory(konfig);
      const info = await transport.sendMail({
        from: konfig.absender,
        to: params.empfaenger,
        subject: params.betreff,
        text: params.text,
      });
      return { gesendet: true, messageId: info.messageId };
    } catch (err) {
      return {
        gesendet: false,
        fehler: err instanceof Error ? err.message : 'SMTP-Versand fehlgeschlagen.',
      };
    }
  }
}

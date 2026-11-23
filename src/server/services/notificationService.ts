import type {
  NotificationChannelErgebnis,
  NotificationDispatchErgebnis,
  NotificationDispatchEvent,
  NotificationEmpfaengerInfo,
  NotificationPayload,
  NotificationPrioritaet,
  PluginNotificationChannelInfo,
} from '../../sdk/plugin.ts';
import type { BenutzerKonto, TeamKontext } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import type {
  NotificationDispatcherBridge,
  PluginBackendHost,
} from '../plugins/backendHost.ts';
import type { SmtpService } from './smtpService.ts';

function normalisierePrioritaet(raw: unknown): NotificationPrioritaet {
  if (raw === 'warning' || raw === 'urgent') return raw;
  return 'info';
}

function validiereLinkPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const bereinigt = raw.trim();
  if (!bereinigt) return undefined;
  if (!bereinigt.startsWith('/') || bereinigt.startsWith('//')) {
    throw new Error('linkPath muss ein relativer App-Pfad sein (beginnend mit "/").');
  }
  return bereinigt.slice(0, 500);
}

/**
 * Zentraler Core-Notification-Dispatcher:
 * Stellt In-App + SMTP bereit und delegiert Zustellwege dynamisch an geladene Channel-Plugins.
 */
export class NotificationService implements NotificationDispatcherBridge {
  constructor(
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig,
    private readonly pluginHost: PluginBackendHost,
    private readonly smtpService?: SmtpService
  ) {}

  async listeKanaeleFuerTeam(teamId?: string): Promise<PluginNotificationChannelInfo[]> {
    const smtpKonfig = this.smtpService ? await this.smtpService.holeMaskierteKonfig() : null;
    const kanaele: PluginNotificationChannelInfo[] = [
      {
        id: 'in-app',
        label: 'In-App (Core)',
        description: 'Speichert Benachrichtigungen im Core-Posteingang.',
        providerPluginId: 'core',
        aktiv: true,
      },
      {
        id: 'smtp',
        label: 'E-Mail (SMTP)',
        description: 'Versendet Benachrichtigungen über den konfigurierten Core-SMTP-Server.',
        providerPluginId: 'core',
        aktiv: Boolean(smtpKonfig?.konfiguriert),
      },
    ];

    const channelPlugins = this.pluginHost.listeNotificationChannelPlugins();
    for (const plugin of channelPlugins) {
      const status = await this.repo.findePluginStatus(plugin.manifest.id);
      if (!status?.enabledGlobally) continue;
      const teamAktiv = teamId
        ? await this.repo.istTeamModulAktiv(teamId, plugin.manifest.id)
        : true;
      for (const ch of plugin.notificationChannels ?? []) {
        kanaele.push({
          id: ch.id,
          label: ch.label,
          ...(ch.description ? { description: ch.description } : {}),
          providerPluginId: plugin.manifest.id,
          aktiv: teamAktiv,
        });
      }
    }

    return kanaele;
  }

  async dispatchFuerPlugin(params: {
    sourcePluginId: string;
    team: TeamKontext;
    payload: NotificationPayload;
  }): Promise<NotificationDispatchErgebnis> {
    return this.dispatch({
      sourcePluginId: params.sourcePluginId,
      team: params.team,
      payload: params.payload,
    });
  }

  async dispatch(params: {
    sourcePluginId: string;
    team?: TeamKontext;
    payload: NotificationPayload;
  }): Promise<NotificationDispatchErgebnis> {
    const title = typeof params.payload.title === 'string' ? params.payload.title.trim() : '';
    const message = typeof params.payload.message === 'string' ? params.payload.message.trim() : '';
    const eventType =
      typeof params.payload.eventType === 'string' && params.payload.eventType.trim()
        ? params.payload.eventType.trim()
        : 'general';

    if (!title || title.length > 200) {
      throw new Error('Notification-Titel fehlt oder überschreitet 200 Zeichen.');
    }
    if (!message || message.length > 4000) {
      throw new Error('Notification-Nachricht fehlt oder überschreitet 4000 Zeichen.');
    }
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(eventType)) {
      throw new Error('Ungültiger eventType für Notification.');
    }

    const linkPath = validiereLinkPath(params.payload.linkPath);
    const priority = normalisierePrioritaet(params.payload.priority);
    const metadata =
      params.payload.metadata &&
      typeof params.payload.metadata === 'object' &&
      !Array.isArray(params.payload.metadata)
        ? params.payload.metadata
        : {};

    const zielBenutzer = await this.loeseEmpfaengerAuf(
      params.team?.id,
      params.payload.recipientUserUuids
    );

    const empfaengerInfos: NotificationEmpfaengerInfo[] = zielBenutzer.map((u) => ({
      uuid: u.uuid,
      vollerName: u.vollerName,
      benutzername: u.benutzername,
      preferredLocale: u.preferredLocale ?? this.config.defaultLocale,
    }));

    const requestedChannels = Array.isArray(params.payload.channels)
      ? params.payload.channels
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim())
      : null;

    const hatExpliziteKanaele = Boolean(requestedChannels && requestedChannels.length > 0);
    const sollKanal = (channelId: string, nurExplizit = false): boolean => {
      if (hatExpliziteKanaele) {
        return requestedChannels!.includes(channelId);
      }
      return !nurExplizit;
    };

    const notificationIds: string[] = [];
    const channelResults: NotificationChannelErgebnis[] = [];

    // 1. Core Standard-Kanal: In-App
    if (sollKanal('in-app', false)) {
      for (const user of zielBenutzer) {
        const gespeichert = await this.repo.erstelleNotification({
          userUuid: user.uuid,
          teamId: params.team?.id,
          sourcePluginId: params.sourcePluginId,
          eventType,
          title,
          message,
          linkPath,
          priority,
          metadata,
        });
        notificationIds.push(gespeichert.id);
      }
      channelResults.push({
        channelId: 'in-app',
        providerPluginId: 'core',
        status: 'sent',
        delivered: notificationIds.length,
      });
    }

    // 2. Core SMTP-Kanal (nur wenn explizit über channels: ['smtp'] angefordert)
    if (sollKanal('smtp', true)) {
      if (!this.smtpService) {
        channelResults.push({
          channelId: 'smtp',
          providerPluginId: 'core',
          status: 'skipped',
          delivered: 0,
          error: 'SMTP-Service ist nicht initialisiert.',
        });
      } else {
        const konfig = await this.smtpService.holeMaskierteKonfig();
        if (!konfig.konfiguriert) {
          channelResults.push({
            channelId: 'smtp',
            providerPluginId: 'core',
            status: 'skipped',
            delivered: 0,
            error: 'SMTP ist auf dieser Instanz nicht konfiguriert.',
          });
        } else {
          let zugestellt = 0;
          let letzterFehler: string | undefined;
          const basisUrl = this.config.appUrl.replace(/\/+$/, '');
          const linkZeile = linkPath ? `\n\nLink: ${basisUrl}${linkPath}` : '';
          for (const user of zielBenutzer) {
            if (!user.email) continue;
            const res = await this.smtpService.sendeTextMail({
              empfaenger: user.email,
              betreff: `${this.config.brandName} · ${title}`,
              text: `${message}${linkZeile}`,
            });
            if (res.gesendet) {
              zugestellt += 1;
            } else if (res.fehler) {
              letzterFehler = res.fehler;
            }
          }
          channelResults.push({
            channelId: 'smtp',
            providerPluginId: 'core',
            status: zugestellt > 0 || zielBenutzer.length === 0 ? 'sent' : 'failed',
            delivered: zugestellt,
            ...(letzterFehler && zugestellt === 0 ? { error: letzterFehler } : {}),
          });
        }
      }
    }

    // 3. Dynamisch nachgelieferte Notification-Channel-Plugins
    const dispatchEvent: NotificationDispatchEvent = {
      eventType,
      title,
      message,
      ...(linkPath ? { linkPath } : {}),
      priority,
      sourcePluginId: params.sourcePluginId,
      ...(params.team ? { teamId: params.team.id, teamName: params.team.name } : {}),
      recipients: empfaengerInfos,
      metadata,
      createdAt: new Date().toISOString(),
    };

    const channelPlugins = this.pluginHost.listeNotificationChannelPlugins();
    for (const plugin of channelPlugins) {
      const status = await this.repo.findePluginStatus(plugin.manifest.id);
      if (!status?.enabledGlobally) continue;
      if (params.team) {
        const teamAktiv = await this.repo.istTeamModulAktiv(params.team.id, plugin.manifest.id);
        if (!teamAktiv) continue;
      }

      for (const channel of plugin.notificationChannels ?? []) {
        if (!sollKanal(channel.id, false)) continue;
        try {
          const ergebnis = await plugin.deliverNotification!(dispatchEvent, {
            pluginId: plugin.manifest.id,
            manifest: plugin.manifest,
            channelId: channel.id,
            db: this.pluginHost.erstelleDbScope(plugin.manifest.id),
            ...(params.team ? { team: params.team } : {}),
          });
          channelResults.push({
            channelId: channel.id,
            providerPluginId: plugin.manifest.id,
            status: ergebnis.error ? 'failed' : 'sent',
            delivered: Math.max(0, Number(ergebnis.delivered) || 0),
            ...(ergebnis.error ? { error: ergebnis.error } : {}),
          });
        } catch (err) {
          channelResults.push({
            channelId: channel.id,
            providerPluginId: plugin.manifest.id,
            status: 'failed',
            delivered: 0,
            error: err instanceof Error ? err.message : 'Channel-Plugin-Fehler.',
          });
        }
      }
    }

    return {
      notificationIds,
      recipientCount: zielBenutzer.length,
      channelResults,
    };
  }

  private async loeseEmpfaengerAuf(
    teamId: string | undefined,
    requestedUuids?: string[]
  ): Promise<BenutzerKonto[]> {
    const angefordert = Array.isArray(requestedUuids)
      ? new Set(requestedUuids.filter((u): u is string => typeof u === 'string' && u.trim().length > 0))
      : null;

    const alleBenutzer = await this.repo.listeBenutzer();

    if (teamId) {
      const mitgliedschaften = await this.repo.listeMitgliedschaften(teamId);
      const aktiveTeamUser = new Set(
        mitgliedschaften.filter((m) => m.status === 'AKTIV').map((m) => m.userUuid)
      );
      return alleBenutzer.filter(
        (u) => aktiveTeamUser.has(u.uuid) && (!angefordert || angefordert.has(u.uuid))
      );
    }

    if (angefordert && angefordert.size > 0) {
      return alleBenutzer.filter((u) => angefordert.has(u.uuid));
    }
    return alleBenutzer;
  }
}

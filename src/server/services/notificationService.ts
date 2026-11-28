import type {
  NotificationChannelErgebnis,
  NotificationDispatchErgebnis,
  NotificationDispatchEvent,
  NotificationEmpfaengerInfo,
  NotificationPayload,
  NotificationPrioritaet,
  PluginNotificationChannelInfo,
} from '../../sdk/plugin.ts';
import type { BenutzerKonto } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import type {
  NotificationDispatcherBridge,
  PluginBackendHost,
} from '../plugins/backendHost.ts';

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
 * Schlanker Core-Notification-Dispatcher (v0.2.0):
 * - In-App-Posteingang im Core.
 * - Alle externen Kanäle (inkl. SMTP via `SidelineOS-channel-smtp`) laufen einheitlich
 *   über `notifications:channel`-Plugins ohne Core-Sonderwege.
 */
export class NotificationService implements NotificationDispatcherBridge {
  constructor(
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig,
    private readonly pluginHost: PluginBackendHost
  ) {}

  async listeKanaele(kontext?: { clubId?: string; teamId?: string }): Promise<PluginNotificationChannelInfo[]> {
    const kanaele: PluginNotificationChannelInfo[] = [
      {
        id: 'in-app',
        label: 'In-App (Core)',
        description: 'Speichert Benachrichtigungen im Core-Posteingang.',
        providerPluginId: 'core',
        aktiv: true,
      },
    ];

    for (const plugin of this.pluginHost.listeNotificationChannelPlugins()) {
      const status = await this.repo.findePlugin(plugin.manifest.id);
      if (!status?.enabledGlobally) continue;
      let scopeAktiv = true;
      if (kontext?.teamId && plugin.manifest.navigation.scopes.includes('team')) {
        scopeAktiv = await this.repo.istScopeModulAktiv('team', kontext.teamId, plugin.manifest.id);
      } else if (kontext?.clubId && plugin.manifest.navigation.scopes.includes('club')) {
        scopeAktiv = await this.repo.istScopeModulAktiv('club', kontext.clubId, plugin.manifest.id);
      }
      for (const ch of plugin.notificationChannels ?? []) {
        kanaele.push({
          id: ch.id,
          label: ch.label,
          ...(ch.description ? { description: ch.description } : {}),
          providerPluginId: plugin.manifest.id,
          aktiv: scopeAktiv,
        });
      }
    }

    return kanaele;
  }

  async dispatch(params: {
    sourcePluginId: string;
    clubId?: string;
    teamId?: string;
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
      params.clubId,
      params.teamId,
      params.payload.recipientUserUuids
    );

    const empfaengerInfos: NotificationEmpfaengerInfo[] = zielBenutzer.map((u) => ({
      uuid: u.uuid,
      vollerName: u.vollerName,
      benutzername: u.benutzername,
      email: u.email,
      preferredLocale: u.preferredLocale ?? this.config.defaultLocale,
    }));

    const requested = Array.isArray(params.payload.channels)
      ? params.payload.channels
          .filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
          .map((c) => c.trim())
      : null;

    const hatExplizit = Boolean(requested && requested.length > 0);
    const sollKanal = (channelId: string, explicitOnly = false): boolean => {
      if (hatExplizit) return requested!.includes(channelId);
      return !explicitOnly;
    };

    const notificationIds: string[] = [];
    const channelResults: NotificationChannelErgebnis[] = [];

    // 1. Core In-App-Posteingang
    if (sollKanal('in-app', false)) {
      for (const user of zielBenutzer) {
        const gespeichert = await this.repo.erstelleNotification({
          userUuid: user.uuid,
          clubId: params.clubId,
          teamId: params.teamId,
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

    // 2. Externe Channel-Plugins (z. B. SidelineOS-channel-smtp, Push, Webhook)
    const dispatchEvent: NotificationDispatchEvent = {
      eventType,
      title,
      message,
      ...(linkPath ? { linkPath } : {}),
      priority,
      sourcePluginId: params.sourcePluginId,
      ...(params.clubId ? { clubId: params.clubId } : {}),
      ...(params.teamId ? { teamId: params.teamId } : {}),
      recipients: empfaengerInfos,
      metadata,
      createdAt: new Date().toISOString(),
    };

    for (const plugin of this.pluginHost.listeNotificationChannelPlugins()) {
      const status = await this.repo.findePlugin(plugin.manifest.id);
      if (!status?.enabledGlobally) continue;

      for (const ch of plugin.notificationChannels ?? []) {
        if (!sollKanal(ch.id, Boolean(ch.explicitOnly))) continue;
        try {
          const ergebnis = await plugin.deliverNotification!(dispatchEvent, {
            pluginId: plugin.manifest.id,
            manifest: plugin.manifest,
            channelId: ch.id,
            db: this.pluginHost.erstelleDbScope(plugin.manifest.id),
          });
          channelResults.push({
            channelId: ch.id,
            providerPluginId: plugin.manifest.id,
            status: ergebnis.error ? 'failed' : 'sent',
            delivered: Math.max(0, Number(ergebnis.delivered) || 0),
            ...(ergebnis.error ? { error: ergebnis.error } : {}),
          });
        } catch (err) {
          channelResults.push({
            channelId: ch.id,
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
    clubId: string | undefined,
    teamId: string | undefined,
    requestedUuids?: string[]
  ): Promise<BenutzerKonto[]> {
    const angefordert = Array.isArray(requestedUuids)
      ? new Set(requestedUuids.filter((u): u is string => typeof u === 'string' && u.trim().length > 0))
      : null;

    if (teamId) {
      const mitglieder = await this.repo.listeTeamMitglieder(teamId);
      const aktive = mitglieder.filter((m) => m.status === 'ACTIVE').map((m) => m.user);
      return angefordert ? aktive.filter((u) => angefordert.has(u.uuid)) : aktive;
    }

    if (clubId) {
      const mitglieder = await this.repo.listeClubMitglieder(clubId);
      const aktive = mitglieder.filter((m) => m.status === 'ACTIVE').map((m) => m.user);
      return angefordert ? aktive.filter((u) => angefordert.has(u.uuid)) : aktive;
    }

    const alle = await this.repo.listeBenutzer();
    return angefordert && angefordert.size > 0
      ? alle.filter((u) => angefordert.has(u.uuid))
      : alle;
  }
}

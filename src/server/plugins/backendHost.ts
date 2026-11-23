import type {
  NotificationDispatchErgebnis,
  NotificationPayload,
  PluginBackendKontext,
  PluginDbScope,
  PluginNotificationChannelInfo,
  PluginPermission,
  SidelineBackendPlugin,
} from '../../sdk/plugin.ts';
import type { BenutzerKonto, PluginId, TeamKontext, TeamRolle } from '../../shared/types.ts';
import {
  erstellePluginDbScope,
  fuehrePluginMigrationAus,
  type CoreDatabaseClient,
} from '../db/client.ts';
import type { S3BrokerService } from '../services/s3Broker.ts';
import type { S3CleanupService } from '../services/s3CleanupService.ts';

export interface NotificationDispatcherBridge {
  dispatchFuerPlugin(params: {
    sourcePluginId: string;
    team: TeamKontext;
    payload: NotificationPayload;
  }): Promise<NotificationDispatchErgebnis>;
  listeKanaeleFuerTeam(teamId?: string): Promise<PluginNotificationChannelInfo[]>;
}

/**
 * Verwaltet registrierte Plugin-Backends und erzwingt isolierte Datenbank-, S3- und Notification-Scopes.
 */
export class PluginBackendHost {
  private readonly plugins = new Map<PluginId, SidelineBackendPlugin>();
  private notificationBridge?: NotificationDispatcherBridge;

  constructor(
    private readonly db: CoreDatabaseClient,
    private readonly s3Broker?: S3BrokerService,
    private readonly s3Cleanup?: S3CleanupService
  ) {}

  setzeNotificationBridge(bridge: NotificationDispatcherBridge): void {
    this.notificationBridge = bridge;
  }

  async registriereBackendPlugin(plugin: SidelineBackendPlugin): Promise<void> {
    const id = plugin.manifest.id;
    if (plugin.migrations && plugin.migrations.length > 0) {
      for (const migration of plugin.migrations) {
        await fuehrePluginMigrationAus(this.db, id, migration.name, migration.sql);
      }
    }
    this.plugins.set(id, plugin);
  }

  entferneBackendPlugin(pluginId: PluginId): boolean {
    return this.plugins.delete(pluginId);
  }

  holePlugin(pluginId: PluginId): SidelineBackendPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  listeRegistrierteIds(): PluginId[] {
    return Array.from(this.plugins.keys());
  }

  listeNotificationChannelPlugins(): SidelineBackendPlugin[] {
    return Array.from(this.plugins.values()).filter(
      (plugin) =>
        plugin.manifest.permissions.includes('notifications:channel') &&
        Array.isArray(plugin.notificationChannels) &&
        plugin.notificationChannels.length > 0 &&
        typeof plugin.deliverNotification === 'function'
    );
  }

  erstelleDbScope(pluginId: PluginId): PluginDbScope {
    const scope = erstellePluginDbScope(this.db, pluginId);
    return {
      schemaName: scope.schemaName,
      query: scope.query,
    };
  }

  erstelleKontext(params: {
    plugin: SidelineBackendPlugin;
    user: BenutzerKonto;
    team: TeamKontext;
    teamRolle: TeamRolle;
  }): PluginBackendKontext {
    const permissions = new Set<PluginPermission>(params.plugin.manifest.permissions);
    const s3 =
      this.s3Broker && permissions.has('s3:team-rw')
        ? this.s3Broker.erstellePluginScope(params.team.id, params.plugin.manifest)
        : undefined;
    const cleanupQueue =
      this.s3Cleanup && permissions.has('s3:cleanup-queue')
        ? this.s3Cleanup.erstellePluginScope(params.team.id, params.plugin.manifest)
        : undefined;
    const notifications =
      this.notificationBridge && permissions.has('notifications:send')
        ? {
            send: (payload: NotificationPayload) =>
              this.notificationBridge!.dispatchFuerPlugin({
                sourcePluginId: params.plugin.manifest.id,
                team: params.team,
                payload,
              }),
            listChannels: () => this.notificationBridge!.listeKanaeleFuerTeam(params.team.id),
          }
        : undefined;

    return {
      pluginId: params.plugin.manifest.id,
      manifest: params.plugin.manifest,
      db: this.erstelleDbScope(params.plugin.manifest.id),
      ...(s3 ? { s3 } : {}),
      ...(cleanupQueue ? { cleanupQueue } : {}),
      ...(notifications ? { notifications } : {}),
      user: params.user,
      locale: params.user.preferredLocale ?? 'de',
      team: params.team,
      teamRolle: params.teamRolle,
      hasPermission(permission: PluginPermission): boolean {
        return permissions.has(permission);
      },
    };
  }
}

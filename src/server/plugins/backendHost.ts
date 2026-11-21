import type {
  PluginBackendKontext,
  PluginDbScope,
  PluginPermission,
  SidelineBackendPlugin,
} from '../../sdk/plugin.ts';
import type { BenutzerKonto, PluginId, TeamKontext, TeamRolle } from '../../shared/types.ts';
import {
  erstellePluginDbScope,
  fuehrePluginMigrationAus,
  type CoreDatabaseClient,
} from '../db/client.ts';

/**
 * Verwaltet registrierte Plugin-Backends und erzwingt isolierte Datenbank-Scopes.
 */
export class PluginBackendHost {
  private readonly plugins = new Map<PluginId, SidelineBackendPlugin>();

  constructor(private readonly db: CoreDatabaseClient) {}

  async registriereBackendPlugin(plugin: SidelineBackendPlugin): Promise<void> {
    const id = plugin.manifest.id;
    if (plugin.migrations && plugin.migrations.length > 0) {
      for (const migration of plugin.migrations) {
        await fuehrePluginMigrationAus(this.db, id, migration.name, migration.sql);
      }
    }
    this.plugins.set(id, plugin);
  }

  holePlugin(pluginId: PluginId): SidelineBackendPlugin | undefined {
    return this.plugins.get(pluginId);
  }

  listeRegistrierteIds(): PluginId[] {
    return Array.from(this.plugins.keys());
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
    return {
      pluginId: params.plugin.manifest.id,
      manifest: params.plugin.manifest,
      db: this.erstelleDbScope(params.plugin.manifest.id),
      user: params.user,
      team: params.team,
      teamRolle: params.teamRolle,
      hasPermission(permission: PluginPermission): boolean {
        return permissions.has(permission);
      },
    };
  }
}

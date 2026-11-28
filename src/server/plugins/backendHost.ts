import type {
  NotificationDispatchErgebnis,
  NotificationPayload,
  PluginBackendKontext,
  PluginCoreAdminScope,
  PluginDbScope,
  PluginNotificationChannelInfo,
  PluginPermission,
  PrivilegiertePluginPermission,
  SidelineBackendPlugin,
} from '../../sdk/plugin.ts';
import type {
  BenutzerKonto,
  ClubKontext,
  ClubRolle,
  PluginId,
  TeamKontext,
  TeamRolle,
} from '../../shared/types.ts';
import {
  erstellePluginDbScope,
  fuehrePluginMigrationAus,
  type CoreDatabaseClient,
} from '../db/client.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import type { StorageBroker } from '../gateway/storageBroker.ts';
import type { MinimalArchiveInstaller } from '../runtime/archiveInstaller.ts';
import { hashPasswort } from '../security.ts';

export interface NotificationDispatcherBridge {
  dispatch(params: {
    sourcePluginId: string;
    clubId?: string;
    teamId?: string;
    payload: NotificationPayload;
  }): Promise<NotificationDispatchErgebnis>;
  listeKanaele(kontext?: { clubId?: string; teamId?: string }): Promise<PluginNotificationChannelInfo[]>;
}

/**
 * Verwaltet registrierte Plugin-Backends (SDK v2.0) und erzwingt isolierte DB-, Storage-,
 * Notification- und privilegierte Core-Admin-Scopes (ohne direkten SQL-Zugriff auf `core.*`).
 */
export class PluginBackendHost {
  private readonly plugins = new Map<PluginId, SidelineBackendPlugin>();
  private notificationBridge?: NotificationDispatcherBridge;
  private archiveInstaller?: MinimalArchiveInstaller;

  constructor(
    private readonly db: CoreDatabaseClient,
    private readonly repo: CoreRepository,
    private readonly storageBroker: StorageBroker
  ) {}

  setzeNotificationBridge(bridge: NotificationDispatcherBridge): void {
    this.notificationBridge = bridge;
  }

  setzeArchiveInstaller(installer: MinimalArchiveInstaller): void {
    this.archiveInstaller = installer;
  }

  async registriereBackendPlugin(
    plugin: SidelineBackendPlugin,
    approvedCapabilities: PrivilegiertePluginPermission[] = []
  ): Promise<void> {
    const id = plugin.manifest.id;
    if (plugin.migrations && plugin.migrations.length > 0) {
      for (const migration of plugin.migrations) {
        await fuehrePluginMigrationAus(this.db, id, migration.name, migration.sql);
      }
    }
    this.plugins.set(id, plugin);

    if (
      plugin.storageProvider &&
      plugin.manifest.permissions.includes('storage:provider') &&
      approvedCapabilities.includes('storage:provider')
    ) {
      this.storageBroker.registriereProvider(id, plugin.storageProvider);
    }
  }

  entferneBackendPlugin(pluginId: PluginId): boolean {
    this.storageBroker.entferneProviderFallsVon(pluginId);
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
    approvedCapabilities: PrivilegiertePluginPermission[];
    user: BenutzerKonto;
    club: ClubKontext | null;
    team: TeamKontext | null;
    clubRolle: ClubRolle | null;
    effektiveTeamRolle: TeamRolle | null;
    userGroups: string[];
  }): PluginBackendKontext {
    const permissions = new Set<PluginPermission>(params.plugin.manifest.permissions);
    const approved = new Set<PrivilegiertePluginPermission>(params.approvedCapabilities);

    const hasApproved = (cap: PrivilegiertePluginPermission): boolean =>
      permissions.has(cap) && approved.has(cap);

    const storage =
      params.club &&
      ((params.team && permissions.has('storage:team-rw')) || permissions.has('storage:club-rw'))
        ? this.storageBroker.erstellePluginScope({
            club: params.club,
            team: params.team,
            manifest: params.plugin.manifest,
          })
        : undefined;

    const notifications =
      this.notificationBridge && permissions.has('notifications:send')
        ? {
            send: (payload: NotificationPayload) =>
              this.notificationBridge!.dispatch({
                sourcePluginId: params.plugin.manifest.id,
                clubId: params.club?.id,
                teamId: params.team?.id,
                payload,
              }),
            listChannels: () =>
              this.notificationBridge!.listeKanaele({
                clubId: params.club?.id,
                teamId: params.team?.id,
              }),
          }
        : undefined;

    const coreAdmin = this.erstelleCoreAdminScope({
      user: params.user,
      club: params.club,
      clubRolle: params.clubRolle,
      effektiveTeamRolle: params.effektiveTeamRolle,
      hasApproved,
    });

    return {
      pluginId: params.plugin.manifest.id,
      manifest: params.plugin.manifest,
      db: this.erstelleDbScope(params.plugin.manifest.id),
      ...(storage ? { storage } : {}),
      ...(notifications ? { notifications } : {}),
      ...(Object.keys(coreAdmin).length > 0 ? { coreAdmin } : {}),
      user: params.user,
      locale: params.user.preferredLocale ?? 'de',
      club: params.club,
      team: params.team,
      isReadOnly: params.team?.status === 'ARCHIVED',
      clubRolle: params.clubRolle,
      effektiveTeamRolle: params.effektiveTeamRolle,
      userGroups: [...params.userGroups],
      hasPermission(permission: PluginPermission): boolean {
        return permissions.has(permission);
      },
      hasApprovedCapability: hasApproved,
    };
  }

  private erstelleCoreAdminScope(params: {
    user: BenutzerKonto;
    club: ClubKontext | null;
    clubRolle: ClubRolle | null;
    effektiveTeamRolle: TeamRolle | null;
    hasApproved: (cap: PrivilegiertePluginPermission) => boolean;
  }): PluginCoreAdminScope {
    const scope: PluginCoreAdminScope = {};
    const istSysadmin = params.user.istSysadmin;
    const istClubAdmin = params.clubRolle === 'CLUB_ADMIN';
    const istTeamAdmin = params.effektiveTeamRolle === 'TEAM_ADMIN';

    if (params.hasApproved('core:org-manage') && (istSysadmin || istClubAdmin || istTeamAdmin)) {
      scope.org = {
        listClubs: () =>
          istSysadmin
            ? this.repo.listeClubs()
            : params.club
              ? Promise.resolve([params.club])
              : Promise.resolve([]),
        createClub: (input) => {
          if (!istSysadmin) throw new Error('Nur Sysadmins dürfen neue Vereine anlegen.');
          return this.repo.erstelleClub(input);
        },
        updateClub: (clubId, patch) => {
          if (!istSysadmin && !(istClubAdmin && params.club?.id === clubId)) {
            throw new Error('Keine Berechtigung zur Bearbeitung dieses Vereins.');
          }
          return this.repo.aktualisiereClub(clubId, patch);
        },
        listTeams: (clubId, opt) => {
          if (!istSysadmin && params.club?.id !== clubId) {
            throw new Error('Kein Zugriff auf Teams eines fremden Vereins.');
          }
          return this.repo.listeTeamsNachClub(clubId, opt);
        },
        createTeam: (input) => {
          if (!istSysadmin && !(istClubAdmin && params.club?.id === input.clubId)) {
            throw new Error('Nur Vereinsadmins dürfen Teams anlegen.');
          }
          return this.repo.erstelleTeam(input);
        },
        updateTeam: async (teamId, patch) => {
          const team = await this.repo.findeTeamNachId(teamId);
          if (!team) return null;
          if (!istSysadmin && !(istClubAdmin && params.club?.id === team.clubId) && !istTeamAdmin) {
            throw new Error('Keine Berechtigung für dieses Team.');
          }
          return this.repo.aktualisiereTeam(teamId, patch);
        },
        setTeamStatus: async (teamId, status) => {
          const team = await this.repo.findeTeamNachId(teamId);
          if (!team) return null;
          if (!istSysadmin && !(istClubAdmin && params.club?.id === team.clubId)) {
            throw new Error('Nur Vereinsadmins dürfen Teams archivieren oder reaktivieren.');
          }
          return this.repo.setzeTeamStatus(teamId, status);
        },
        listClubMembers: (clubId) => {
          if (!istSysadmin && !(istClubAdmin && params.club?.id === clubId)) {
            throw new Error('Keine Berechtigung für die Vereins-Mitgliederliste.');
          }
          return this.repo.listeClubMitglieder(clubId);
        },
        upsertClubMembership: (input) => {
          if (!istSysadmin && !(istClubAdmin && params.club?.id === input.clubId)) {
            throw new Error('Nur Vereinsadmins dürfen Vereins-Mitgliedschaften ändern.');
          }
          return this.repo.speichereClubMitgliedschaft(input);
        },
        listTeamMembers: async (teamId) => {
          const team = await this.repo.findeTeamNachId(teamId);
          if (!team) return [];
          if (!istSysadmin && params.club?.id !== team.clubId) {
            throw new Error('Kein Zugriff auf dieses Team.');
          }
          return this.repo.listeTeamMitglieder(teamId);
        },
        upsertTeamMembership: async (input) => {
          const team = await this.repo.findeTeamNachId(input.teamId);
          if (!team) throw new Error('Team nicht gefunden.');
          if (!istSysadmin && params.club?.id !== team.clubId) {
            throw new Error('Kein Zugriff auf dieses Team.');
          }
          return this.repo.speichereTeamMitgliedschaft(input);
        },
        createInvitation: async (input) => {
          if (!istSysadmin && params.club?.id !== input.clubId) {
            throw new Error('Einladungen dürfen nur für den eigenen Verein erstellt werden.');
          }
          return this.repo.erstelleEinladung(input);
        },
        listInvitations: (clubId) => {
          if (!istSysadmin && params.club?.id !== clubId) {
            throw new Error('Kein Zugriff auf Einladungen dieses Vereins.');
          }
          return this.repo.listeEinladungenNachClub(clubId);
        },
        revokeInvitation: (invitationId) => this.repo.deaktiviereEinladung(invitationId),
      };
    }

    if (params.hasApproved('core:users-manage') && istSysadmin) {
      scope.users = {
        listUsers: () => this.repo.listeBenutzer(),
        findUser: async (uuid) => (await this.repo.findeBenutzerNachUuid(uuid))?.konto ?? null,
        createUser: (input) =>
          this.repo.erstelleBenutzer(
            {
              benutzername: input.benutzername,
              vollerName: input.vollerName,
              email: input.email,
              istSysadmin: input.istSysadmin,
              metadata: input.metadata,
            },
            hashPasswort(input.passwort)
          ),
        updateUser: (uuid, patch) => this.repo.aktualisiereBenutzer(uuid, patch),
      };
    }

    if (params.hasApproved('core:plugins-manage') && istSysadmin) {
      scope.plugins = {
        listInstalled: async () =>
          (await this.repo.listeInstalliertePlugins()).map((p) => ({
            pluginId: p.pluginId,
            version: p.version,
            enabledGlobally: p.enabledGlobally,
            approvedCapabilities: p.approvedCapabilities,
            manifest: p.manifest,
            lastError: p.lastError,
          })),
        setEnabledGlobally: async (pluginId, enabled) => {
          const upd = await this.repo.aktualisierePluginStatus(pluginId, { enabledGlobally: enabled });
          return Boolean(upd);
        },
        setScopeModuleEnabled: (scopeTyp, scopeId, pluginId, enabled) =>
          this.repo.setzeScopeModulAktiv(scopeTyp, scopeId, pluginId, enabled),
        listScopeModules: (scopeTyp, scopeId) =>
          this.repo.listeAktiveScopeModule(scopeTyp, scopeId),
        installArchiveBuffer: async (archiveBuffer, sourceLabel) => {
          if (!this.archiveInstaller) throw new Error('Archiv-Installer nicht initialisiert.');
          const res = await this.archiveInstaller.installiereAusBuffer({
            archiveBuffer: Buffer.from(archiveBuffer),
            sourceUrl: sourceLabel ?? null,
          });
          return { pluginId: res.pluginId, version: res.version };
        },
        installArchiveUrl: async (archiveUrl) => {
          if (!this.archiveInstaller) throw new Error('Archiv-Installer nicht initialisiert.');
          const res = await this.archiveInstaller.installiereAusUrl(archiveUrl);
          return { pluginId: res.pluginId, version: res.version };
        },
        uninstall: async (pluginId) => {
          if (!this.archiveInstaller) throw new Error('Archiv-Installer nicht initialisiert.');
          return this.archiveInstaller.deinstallierePlugin(pluginId);
        },
      };
    }

    // #21 & #24: Quota-API für Sysadmins sowie künftige Abrechnungs-/Billing-Plugins
    if (params.hasApproved('core:storage-quota-manage') && (istSysadmin || istClubAdmin)) {
      scope.storageQuota = {
        getClubStorage: async (clubId) => {
          if (!istSysadmin && params.club?.id !== clubId) {
            throw new Error('Kein Zugriff auf Speicherdaten eines fremden Vereins.');
          }
          return (await this.repo.findeClubNachId(clubId))?.speicher ?? null;
        },
        setClubQuota: (clubId, q) => {
          if (!istSysadmin) throw new Error('Nur Sysadmins/System-Plugins dürfen Quotas ändern.');
          return this.repo.setzeClubSpeicherQuota(clubId, q);
        },
        reconcileClubUsage: (clubId, exactUsedBytes) => {
          if (!istSysadmin) throw new Error('Nur Sysadmins/Storage-Provider dürfen den Verbrauch abgleichen.');
          return this.repo.setzeExaktenClubSpeicherVerbrauch(clubId, exactUsedBytes);
        },
      };
    }

    // #22: Multi-Node-Storage-Zuweisung für storage-s3
    if (params.hasApproved('core:storage-nodes-manage') && istSysadmin) {
      scope.storageNodes = {
        getClubNode: async (clubId) =>
          (await this.repo.findeClubNachId(clubId))?.speicher.nodeId ?? null,
        assignClubNode: (clubId, nodeId) => this.repo.setzeClubStorageNode(clubId, nodeId),
      };
    }

    return scope;
  }
}

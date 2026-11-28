import crypto from 'node:crypto';
import type {
  PluginManifest,
  PrivilegiertePluginPermission,
} from '../../sdk/plugin.ts';
import { istPrivilegierteCapability } from '../../sdk/plugin.ts';
import { normalisiereSprache } from '../../shared/i18n.ts';
import {
  berechneClubSpeicherStatus,
  ermittleEffektiveTeamRolle,
  type BenutzerKonto,
  type ClubKontext,
  type ClubMitgliedschaft,
  type ClubRolle,
  type ClubSpeicherStatus,
  type EffektiveTeamBerechtigung,
  type EinladungEintrag,
  type MitgliedschaftStatus,
  type NotificationEintrag,
  type NotificationPrioritaet,
  type PluginId,
  type ScopeTyp,
  type TeamKontext,
  type TeamMitgliedschaft,
  type TeamRolle,
  type TeamStatus,
} from '../../shared/types.ts';
import type { CoreDatabaseClient } from './client.ts';

export interface BenutzerMitHash {
  konto: BenutzerKonto;
  passwordHash: string;
}

export interface InstalliertesPluginDatensatz {
  pluginId: PluginId;
  version: string;
  previousVersion: string | null;
  manifest: PluginManifest;
  enabledGlobally: boolean;
  approvedCapabilities: PrivilegiertePluginPermission[];
  sourceUrl: string | null;
  sha256: string | null;
  installedAt: string;
  lastError: string | null;
}

function isoString(raw: unknown): string {
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === 'string') return raw;
  return new Date().toISOString();
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function parseStringArray(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((e): e is string => typeof e === 'string' && e.trim().length > 0);
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((e): e is string => typeof e === 'string' && e.trim().length > 0);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function mapUserRow(row: Record<string, unknown>): BenutzerMitHash {
  return {
    konto: {
      uuid: String(row.uuid),
      benutzername: String(row.username),
      vollerName: String(row.display_name),
      email: String(row.email),
      istSysadmin: Boolean(row.is_sysadmin),
      preferredLocale: normalisiereSprache(String(row.preferred_locale ?? 'de'), 'de'),
      ...(typeof row.preferred_theme === 'string' && row.preferred_theme
        ? { preferredTheme: row.preferred_theme }
        : {}),
      metadata: parseJsonObject(row.metadata),
      erstelltAm: isoString(row.created_at),
    },
    passwordHash: String(row.password_hash),
  };
}

function mapClubRow(row: Record<string, unknown>): ClubKontext {
  const quotaRaw = row.storage_quota_bytes;
  const quotaBytes =
    quotaRaw === null || quotaRaw === undefined ? null : Number(quotaRaw);
  const usedBytes = Number(row.storage_used_bytes ?? 0);
  const softLimitPercent = Number(row.storage_soft_limit_percent ?? 90);
  const nodeId = String(row.storage_node_id ?? 'default');

  return {
    id: String(row.id),
    slug: String(row.slug),
    name: String(row.name),
    speicher: berechneClubSpeicherStatus({
      nodeId,
      quotaBytes,
      usedBytes,
      softLimitPercent,
    }),
    metadata: parseJsonObject(row.metadata),
    erstelltAm: isoString(row.created_at),
  };
}

function mapTeamRow(row: Record<string, unknown>): TeamKontext {
  const status = row.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE';
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    slug: String(row.slug),
    name: String(row.name),
    status,
    akzentFarbe: String(row.accent_color ?? '#F59E0B'),
    metadata: parseJsonObject(row.metadata),
    erstelltAm: isoString(row.created_at),
  };
}

function mapClubMembershipRow(row: Record<string, unknown>): ClubMitgliedschaft {
  return {
    id: String(row.id),
    userUuid: String(row.user_uuid),
    clubId: String(row.club_id),
    rolle: row.role === 'CLUB_ADMIN' ? 'CLUB_ADMIN' : 'CLUB_MEMBER',
    status: (row.status as MitgliedschaftStatus) ?? 'ACTIVE',
    beigetretenAm: isoString(row.joined_at),
  };
}

function mapTeamMembershipRow(row: Record<string, unknown>): TeamMitgliedschaft {
  return {
    id: String(row.id),
    userUuid: String(row.user_uuid),
    teamId: String(row.team_id),
    rolle: (row.role as TeamRolle) ?? 'MEMBER',
    groups: parseStringArray(row.groups),
    status: (row.status as MitgliedschaftStatus) ?? 'ACTIVE',
    beigetretenAm: isoString(row.joined_at),
  };
}

function mapInvitationRow(row: Record<string, unknown>): EinladungEintrag {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    teamId: row.team_id ? String(row.team_id) : null,
    clubRolle: row.club_role === 'CLUB_ADMIN' ? 'CLUB_ADMIN' : 'CLUB_MEMBER',
    teamRolle: (row.team_role as TeamRolle) ?? 'MEMBER',
    groups: parseStringArray(row.groups),
    ...(typeof row.target_email === 'string' && row.target_email
      ? { zielEmail: row.target_email }
      : {}),
    bestaetigungErforderlich: Boolean(row.requires_approval),
    gueltigBis: isoString(row.expires_at),
    aktiv: Boolean(row.active),
    erstelltAm: isoString(row.created_at),
  };
}

function mapPluginRow(row: Record<string, unknown>): InstalliertesPluginDatensatz {
  const manifestRaw =
    typeof row.manifest_json === 'string'
      ? (JSON.parse(row.manifest_json) as PluginManifest)
      : (row.manifest_json as PluginManifest);

  const approved = parseStringArray(row.approved_capabilities).filter((c) =>
    istPrivilegierteCapability(c as PrivilegiertePluginPermission)
  ) as PrivilegiertePluginPermission[];

  return {
    pluginId: String(row.plugin_id),
    version: String(row.version),
    previousVersion: row.previous_version ? String(row.previous_version) : null,
    manifest: manifestRaw,
    enabledGlobally: Boolean(row.enabled_globally),
    approvedCapabilities: approved,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    sha256: row.sha256 ? String(row.sha256) : null,
    installedAt: isoString(row.installed_at),
    lastError: row.last_error ? String(row.last_error) : null,
  };
}

function mapNotificationRow(row: Record<string, unknown>): NotificationEintrag {
  return {
    id: String(row.id),
    userUuid: String(row.user_uuid),
    ...(row.club_id ? { clubId: String(row.club_id) } : {}),
    ...(row.team_id ? { teamId: String(row.team_id) } : {}),
    sourcePluginId: String(row.source_plugin_id ?? 'core'),
    eventType: String(row.event_type),
    title: String(row.title),
    message: String(row.message),
    ...(row.link_path ? { linkPath: String(row.link_path) } : {}),
    priority: (row.priority as NotificationPrioritaet) ?? 'info',
    metadata: parseJsonObject(row.metadata_json),
    ...(row.read_at ? { readAt: isoString(row.read_at) } : {}),
    createdAt: isoString(row.created_at),
  };
}

export function hashEinladungsToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Schlankes Micro-Kernel-Repository für das v0.2.0-Schema `core`.
 */
export class CoreRepository {
  constructor(private readonly db: CoreDatabaseClient) {}

  // ---- Benutzer & Sessions ----

  async zaehleBenutzer(): Promise<number> {
    const res = await this.db.query<{ anzahl: string | number }>(
      `SELECT COUNT(*)::int AS anzahl FROM core.users`
    );
    return Number(res.rows[0]?.anzahl ?? 0);
  }

  async listeBenutzer(): Promise<BenutzerKonto[]> {
    const res = await this.db.query(`SELECT * FROM core.users ORDER BY created_at ASC`);
    return res.rows.map((r) => mapUserRow(r).konto);
  }

  async findeBenutzerNachUuid(uuid: string): Promise<BenutzerMitHash | null> {
    const res = await this.db.query(`SELECT * FROM core.users WHERE uuid = $1 LIMIT 1`, [uuid]);
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  async findeBenutzerNachLogin(kennung: string): Promise<BenutzerMitHash | null> {
    const norm = kennung.trim().toLowerCase();
    const res = await this.db.query(
      `SELECT * FROM core.users WHERE LOWER(username) = $1 OR LOWER(email) = $1 LIMIT 1`,
      [norm]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  async erstelleBenutzer(
    input: {
      uuid?: string;
      benutzername: string;
      vollerName: string;
      email: string;
      istSysadmin?: boolean;
      preferredLocale?: string;
      preferredTheme?: string | null;
      metadata?: Record<string, unknown>;
    },
    passwordHash: string
  ): Promise<BenutzerKonto> {
    const uuid = input.uuid ?? `usr-${crypto.randomUUID()}`;
    const res = await this.db.query(
      `INSERT INTO core.users (
         uuid, username, display_name, email, password_hash,
         is_sysadmin, preferred_locale, preferred_theme, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
       RETURNING *`,
      [
        uuid,
        input.benutzername.trim().toLowerCase(),
        input.vollerName.trim(),
        input.email.trim().toLowerCase(),
        passwordHash,
        Boolean(input.istSysadmin),
        normalisiereSprache(input.preferredLocale, 'de'),
        input.preferredTheme ?? null,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapUserRow(res.rows[0]).konto;
  }

  async aktualisiereBenutzer(
    uuid: string,
    patch: {
      vollerName?: string;
      email?: string;
      istSysadmin?: boolean;
      preferredLocale?: string;
      preferredTheme?: string | null;
      metadata?: Record<string, unknown>;
      passwordHash?: string;
    }
  ): Promise<BenutzerKonto | null> {
    const vorhanden = await this.findeBenutzerNachUuid(uuid);
    if (!vorhanden) return null;

    const next = {
      vollerName: patch.vollerName?.trim() || vorhanden.konto.vollerName,
      email: patch.email?.trim().toLowerCase() || vorhanden.konto.email,
      istSysadmin:
        typeof patch.istSysadmin === 'boolean' ? patch.istSysadmin : vorhanden.konto.istSysadmin,
      preferredLocale: patch.preferredLocale
        ? normalisiereSprache(patch.preferredLocale, vorhanden.konto.preferredLocale)
        : vorhanden.konto.preferredLocale,
      preferredTheme:
        patch.preferredTheme === undefined
          ? vorhanden.konto.preferredTheme ?? null
          : patch.preferredTheme,
      metadata: patch.metadata ?? vorhanden.konto.metadata,
      passwordHash: patch.passwordHash ?? vorhanden.passwordHash,
    };

    const res = await this.db.query(
      `UPDATE core.users
       SET display_name = $2,
           email = $3,
           is_sysadmin = $4,
           preferred_locale = $5,
           preferred_theme = $6,
           metadata = $7::jsonb,
           password_hash = $8
       WHERE uuid = $1
       RETURNING *`,
      [
        uuid,
        next.vollerName,
        next.email,
        next.istSysadmin,
        next.preferredLocale,
        next.preferredTheme,
        JSON.stringify(next.metadata),
        next.passwordHash,
      ]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]).konto : null;
  }

  async erstelleSession(tokenHash: string, userUuid: string, expiresAtIso: string): Promise<void> {
    await this.db.query(
      `INSERT INTO core.sessions (token_hash, user_uuid, expires_at) VALUES ($1, $2, $3)`,
      [tokenHash, userUuid, expiresAtIso]
    );
  }

  async findeAktiveSession(
    tokenHash: string
  ): Promise<{ tokenHash: string; userUuid: string; expiresAt: string } | null> {
    const res = await this.db.query(
      `SELECT token_hash, user_uuid, expires_at
       FROM core.sessions
       WHERE token_hash = $1 AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      tokenHash: String(row.token_hash),
      userUuid: String(row.user_uuid),
      expiresAt: isoString(row.expires_at),
    };
  }

  async loescheSession(tokenHash: string): Promise<void> {
    await this.db.query(`DELETE FROM core.sessions WHERE token_hash = $1`, [tokenHash]);
  }

  // ---- Clubs (#21, #22, #23, #24) ----

  async listeClubs(): Promise<ClubKontext[]> {
    const res = await this.db.query(`SELECT * FROM core.clubs ORDER BY name ASC`);
    return res.rows.map(mapClubRow);
  }

  async findeClubNachId(clubId: string): Promise<ClubKontext | null> {
    const res = await this.db.query(`SELECT * FROM core.clubs WHERE id = $1 LIMIT 1`, [clubId]);
    return res.rows[0] ? mapClubRow(res.rows[0]) : null;
  }

  async erstelleClub(input: {
    id?: string;
    slug: string;
    name: string;
    storageNodeId?: string;
    storageQuotaBytes?: number | null;
    storageSoftLimitPercent?: number;
    metadata?: Record<string, unknown>;
  }): Promise<ClubKontext> {
    const id = input.id ?? `club-${crypto.randomUUID()}`;
    const res = await this.db.query(
      `INSERT INTO core.clubs (
         id, slug, name, storage_node_id, storage_quota_bytes,
         storage_soft_limit_percent, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        id,
        input.slug.trim().toLowerCase(),
        input.name.trim(),
        input.storageNodeId?.trim() || 'default',
        input.storageQuotaBytes ?? null,
        input.storageSoftLimitPercent ?? 90,
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapClubRow(res.rows[0]);
  }

  async aktualisiereClub(
    clubId: string,
    patch: { name?: string; metadata?: Record<string, unknown> }
  ): Promise<ClubKontext | null> {
    const vorhanden = await this.findeClubNachId(clubId);
    if (!vorhanden) return null;
    const res = await this.db.query(
      `UPDATE core.clubs SET name = $2, metadata = $3::jsonb WHERE id = $1 RETURNING *`,
      [clubId, patch.name?.trim() || vorhanden.name, JSON.stringify(patch.metadata ?? vorhanden.metadata)]
    );
    return res.rows[0] ? mapClubRow(res.rows[0]) : null;
  }

  async setzeClubSpeicherQuota(
    clubId: string,
    params: { quotaBytes: number | null; softLimitPercent?: number }
  ): Promise<ClubSpeicherStatus | null> {
    const vorhanden = await this.findeClubNachId(clubId);
    if (!vorhanden) return null;
    const soft =
      params.softLimitPercent !== undefined
        ? Math.max(50, Math.min(99, Math.floor(params.softLimitPercent)))
        : vorhanden.speicher.softLimitPercent;
    const quota =
      params.quotaBytes === null
        ? null
        : Math.max(1, Math.floor(params.quotaBytes));

    const res = await this.db.query(
      `UPDATE core.clubs
       SET storage_quota_bytes = $2, storage_soft_limit_percent = $3
       WHERE id = $1
       RETURNING *`,
      [clubId, quota, soft]
    );
    return res.rows[0] ? mapClubRow(res.rows[0]).speicher : null;
  }

  async setzeClubStorageNode(clubId: string, nodeId: string): Promise<ClubSpeicherStatus | null> {
    const clean = nodeId.trim();
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(clean)) {
      throw new Error('Ungültige Storage-Node-ID.');
    }
    const res = await this.db.query(
      `UPDATE core.clubs SET storage_node_id = $2 WHERE id = $1 RETURNING *`,
      [clubId, clean]
    );
    return res.rows[0] ? mapClubRow(res.rows[0]).speicher : null;
  }

  async passeClubSpeicherVerbrauchAn(
    clubId: string,
    deltaBytes: number
  ): Promise<ClubSpeicherStatus | null> {
    const delta = Math.trunc(deltaBytes);
    const res = await this.db.query(
      `UPDATE core.clubs
       SET storage_used_bytes = GREATEST(0, storage_used_bytes + $2)
       WHERE id = $1
       RETURNING *`,
      [clubId, delta]
    );
    return res.rows[0] ? mapClubRow(res.rows[0]).speicher : null;
  }

  async setzeExaktenClubSpeicherVerbrauch(
    clubId: string,
    exactUsedBytes: number
  ): Promise<ClubSpeicherStatus | null> {
    const bytes = Math.max(0, Math.floor(exactUsedBytes));
    const res = await this.db.query(
      `UPDATE core.clubs SET storage_used_bytes = $2 WHERE id = $1 RETURNING *`,
      [clubId, bytes]
    );
    return res.rows[0] ? mapClubRow(res.rows[0]).speicher : null;
  }

  // ---- Teams (#23, #25) ----

  async listeTeamsNachClub(
    clubId: string,
    optionen: { includeArchived?: boolean } = {}
  ): Promise<TeamKontext[]> {
    const sql = optionen.includeArchived
      ? `SELECT * FROM core.teams WHERE club_id = $1 ORDER BY status ASC, name ASC`
      : `SELECT * FROM core.teams WHERE club_id = $1 AND status = 'ACTIVE' ORDER BY name ASC`;
    const res = await this.db.query(sql, [clubId]);
    return res.rows.map(mapTeamRow);
  }

  async findeTeamNachId(teamId: string): Promise<TeamKontext | null> {
    const res = await this.db.query(`SELECT * FROM core.teams WHERE id = $1 LIMIT 1`, [teamId]);
    return res.rows[0] ? mapTeamRow(res.rows[0]) : null;
  }

  async erstelleTeam(input: {
    id?: string;
    clubId: string;
    slug: string;
    name: string;
    status?: TeamStatus;
    akzentFarbe?: string;
    metadata?: Record<string, unknown>;
  }): Promise<TeamKontext> {
    const id = input.id ?? `team-${crypto.randomUUID()}`;
    const res = await this.db.query(
      `INSERT INTO core.teams (id, club_id, slug, name, status, accent_color, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING *`,
      [
        id,
        input.clubId,
        input.slug.trim().toLowerCase(),
        input.name.trim(),
        input.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        input.akzentFarbe?.trim() || '#F59E0B',
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapTeamRow(res.rows[0]);
  }

  async aktualisiereTeam(
    teamId: string,
    patch: { name?: string; akzentFarbe?: string; metadata?: Record<string, unknown> }
  ): Promise<TeamKontext | null> {
    const vorhanden = await this.findeTeamNachId(teamId);
    if (!vorhanden) return null;
    const res = await this.db.query(
      `UPDATE core.teams
       SET name = $2, accent_color = $3, metadata = $4::jsonb
       WHERE id = $1
       RETURNING *`,
      [
        teamId,
        patch.name?.trim() || vorhanden.name,
        patch.akzentFarbe?.trim() || vorhanden.akzentFarbe,
        JSON.stringify(patch.metadata ?? vorhanden.metadata),
      ]
    );
    return res.rows[0] ? mapTeamRow(res.rows[0]) : null;
  }

  async setzeTeamStatus(teamId: string, status: TeamStatus): Promise<TeamKontext | null> {
    const res = await this.db.query(
      `UPDATE core.teams SET status = $2 WHERE id = $1 RETURNING *`,
      [teamId, status]
    );
    return res.rows[0] ? mapTeamRow(res.rows[0]) : null;
  }

  // ---- Getrennte Club- & Team-Mitgliedschaften + RBAC-Kaskade (#23, #26) ----

  async speichereClubMitgliedschaft(input: {
    userUuid: string;
    clubId: string;
    rolle: ClubRolle;
    status?: MitgliedschaftStatus;
  }): Promise<ClubMitgliedschaft> {
    const id = `cmem-${crypto.randomUUID()}`;
    const res = await this.db.query(
      `INSERT INTO core.club_memberships (id, user_uuid, club_id, role, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_uuid, club_id)
       DO UPDATE SET role = EXCLUDED.role, status = EXCLUDED.status
       RETURNING *`,
      [id, input.userUuid, input.clubId, input.rolle, input.status ?? 'ACTIVE']
    );
    return mapClubMembershipRow(res.rows[0]);
  }

  async findeClubMitgliedschaft(
    userUuid: string,
    clubId: string
  ): Promise<ClubMitgliedschaft | null> {
    const res = await this.db.query(
      `SELECT * FROM core.club_memberships WHERE user_uuid = $1 AND club_id = $2 LIMIT 1`,
      [userUuid, clubId]
    );
    return res.rows[0] ? mapClubMembershipRow(res.rows[0]) : null;
  }

  async listeClubMitgliedschaftenFuerUser(userUuid: string): Promise<ClubMitgliedschaft[]> {
    const res = await this.db.query(
      `SELECT * FROM core.club_memberships WHERE user_uuid = $1 ORDER BY joined_at ASC`,
      [userUuid]
    );
    return res.rows.map(mapClubMembershipRow);
  }

  async listeClubMitglieder(
    clubId: string
  ): Promise<Array<ClubMitgliedschaft & { user: BenutzerKonto }>> {
    const res = await this.db.query(
      `SELECT m.*, u.username, u.display_name, u.email, u.is_sysadmin,
              u.preferred_locale, u.preferred_theme, u.metadata AS user_metadata,
              u.created_at AS user_created_at
       FROM core.club_memberships m
       JOIN core.users u ON u.uuid = m.user_uuid
       WHERE m.club_id = $1
       ORDER BY u.display_name ASC`,
      [clubId]
    );
    return res.rows.map((r) => ({
      ...mapClubMembershipRow(r),
      user: mapUserRow({
        uuid: r.user_uuid,
        username: r.username,
        display_name: r.display_name,
        email: r.email,
        password_hash: '',
        is_sysadmin: r.is_sysadmin,
        preferred_locale: r.preferred_locale,
        preferred_theme: r.preferred_theme,
        metadata: r.user_metadata,
        created_at: r.user_created_at,
      }).konto,
    }));
  }

  async speichereTeamMitgliedschaft(input: {
    userUuid: string;
    teamId: string;
    rolle: TeamRolle;
    groups?: string[];
    status?: MitgliedschaftStatus;
  }): Promise<TeamMitgliedschaft> {
    const id = `tmem-${crypto.randomUUID()}`;
    const bereinigteGroups = Array.from(
      new Set((input.groups ?? []).map((g) => g.trim()).filter(Boolean))
    );
    const res = await this.db.query(
      `INSERT INTO core.team_memberships (id, user_uuid, team_id, role, groups, status)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6)
       ON CONFLICT (user_uuid, team_id)
       DO UPDATE SET role = EXCLUDED.role, groups = EXCLUDED.groups, status = EXCLUDED.status
       RETURNING *`,
      [
        id,
        input.userUuid,
        input.teamId,
        input.rolle,
        JSON.stringify(bereinigteGroups),
        input.status ?? 'ACTIVE',
      ]
    );
    return mapTeamMembershipRow(res.rows[0]);
  }

  async findeTeamMitgliedschaft(
    userUuid: string,
    teamId: string
  ): Promise<TeamMitgliedschaft | null> {
    const res = await this.db.query(
      `SELECT * FROM core.team_memberships WHERE user_uuid = $1 AND team_id = $2 LIMIT 1`,
      [userUuid, teamId]
    );
    return res.rows[0] ? mapTeamMembershipRow(res.rows[0]) : null;
  }

  async listeTeamMitgliedschaftenFuerUser(userUuid: string): Promise<TeamMitgliedschaft[]> {
    const res = await this.db.query(
      `SELECT * FROM core.team_memberships WHERE user_uuid = $1 ORDER BY joined_at ASC`,
      [userUuid]
    );
    return res.rows.map(mapTeamMembershipRow);
  }

  async listeTeamMitglieder(
    teamId: string
  ): Promise<Array<TeamMitgliedschaft & { user: BenutzerKonto }>> {
    const res = await this.db.query(
      `SELECT m.*, u.username, u.display_name, u.email, u.is_sysadmin,
              u.preferred_locale, u.preferred_theme, u.metadata AS user_metadata,
              u.created_at AS user_created_at
       FROM core.team_memberships m
       JOIN core.users u ON u.uuid = m.user_uuid
       WHERE m.team_id = $1
       ORDER BY u.display_name ASC`,
      [teamId]
    );
    return res.rows.map((r) => ({
      ...mapTeamMembershipRow(r),
      user: mapUserRow({
        uuid: r.user_uuid,
        username: r.username,
        display_name: r.display_name,
        email: r.email,
        password_hash: '',
        is_sysadmin: r.is_sysadmin,
        preferred_locale: r.preferred_locale,
        preferred_theme: r.preferred_theme,
        metadata: r.user_metadata,
        created_at: r.user_created_at,
      }).konto,
    }));
  }

  /**
   * Ermittelt die effektive Team-Berechtigung inklusive unveränderlicher
   * Vereinsadmin -> Teamadmin Rollenkaskade (#23) sowie Archiv-Status (#25).
   */
  async ermittleEffektiveTeamBerechtigung(
    userUuid: string,
    teamId: string
  ): Promise<EffektiveTeamBerechtigung | null> {
    const team = await this.findeTeamNachId(teamId);
    if (!team) return null;

    const [clubM, teamM] = await Promise.all([
      this.findeClubMitgliedschaft(userUuid, team.clubId),
      this.findeTeamMitgliedschaft(userUuid, team.id),
    ]);

    const aufgeloest = ermittleEffektiveTeamRolle({
      clubMitgliedschaft: clubM,
      teamMitgliedschaft: teamM,
    });

    return {
      clubId: team.clubId,
      teamId: team.id,
      clubRolle: aufgeloest.clubRolle,
      effektiveTeamRolle: aufgeloest.effektiveTeamRolle,
      istKaskadiertVonClubAdmin: aufgeloest.istKaskadiertVonClubAdmin,
      groups: aufgeloest.groups,
      teamStatus: team.status,
      istLesemodus: team.status === 'ARCHIVED',
    };
  }

  /**
   * Liefert alle Clubs und Teams, auf die ein Benutzer Zugriff hat (inkl. Kaskade #23).
   */
  async ladeBenutzerKontext(userUuid: string): Promise<{
    clubs: Array<ClubKontext & { clubRolle: ClubRolle }>;
    teams: Array<
      TeamKontext & {
        effektiveTeamRolle: TeamRolle;
        istKaskadiertVonClubAdmin: boolean;
        groups: string[];
      }
    >;
  }> {
    const [clubMems, teamMems] = await Promise.all([
      this.listeClubMitgliedschaftenFuerUser(userUuid),
      this.listeTeamMitgliedschaftenFuerUser(userUuid),
    ]);

    const aktiveClubMems = clubMems.filter((m) => m.status === 'ACTIVE');
    const aktiveTeamMap = new Map(
      teamMems.filter((m) => m.status === 'ACTIVE').map((m) => [m.teamId, m])
    );

    const clubs: Array<ClubKontext & { clubRolle: ClubRolle }> = [];
    const teams: Array<
      TeamKontext & {
        effektiveTeamRolle: TeamRolle;
        istKaskadiertVonClubAdmin: boolean;
        groups: string[];
      }
    > = [];
    const geseheneTeams = new Set<string>();

    for (const cm of aktiveClubMems) {
      const club = await this.findeClubNachId(cm.clubId);
      if (!club) continue;
      clubs.push({ ...club, clubRolle: cm.rolle });

      // Ein CLUB_ADMIN sieht automatisch alle Teams (auch archivierte) seines Clubs (#23, #25)
      if (cm.rolle === 'CLUB_ADMIN') {
        const clubTeams = await this.listeTeamsNachClub(club.id, { includeArchived: true });
        for (const t of clubTeams) {
          geseheneTeams.add(t.id);
          const tm = aktiveTeamMap.get(t.id);
          teams.push({
            ...t,
            effektiveTeamRolle: 'TEAM_ADMIN',
            istKaskadiertVonClubAdmin: true,
            groups: tm?.groups ?? [],
          });
        }
      }
    }

    for (const [teamId, tm] of aktiveTeamMap.entries()) {
      if (geseheneTeams.has(teamId)) continue;
      const team = await this.findeTeamNachId(teamId);
      if (!team) continue;
      geseheneTeams.add(team.id);
      teams.push({
        ...team,
        effektiveTeamRolle: tm.rolle,
        istKaskadiertVonClubAdmin: false,
        groups: tm.groups,
      });
    }

    return { clubs, teams };
  }

  // ---- Einladungen mit atomarem Club+Team-Beitritt (#26) ----

  async erstelleEinladung(input: {
    clubId: string;
    teamId?: string | null;
    clubRolle?: ClubRolle;
    teamRolle?: TeamRolle;
    groups?: string[];
    zielEmail?: string;
    bestaetigungErforderlich?: boolean;
    gueltigBis: string;
    tokenOverride?: string;
  }): Promise<{ einladung: EinladungEintrag; token: string; pfad: string }> {
    const id = `inv-${crypto.randomUUID()}`;
    const token = input.tokenOverride?.trim() || crypto.randomBytes(20).toString('base64url');
    const tokenHash = hashEinladungsToken(token);
    const bereinigteGroups = Array.from(
      new Set((input.groups ?? []).map((g) => g.trim()).filter(Boolean))
    );

    const res = await this.db.query(
      `INSERT INTO core.invitations (
         id, token_hash, club_id, team_id, club_role, team_role,
         groups, target_email, requires_approval, expires_at, active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, TRUE)
       RETURNING *`,
      [
        id,
        tokenHash,
        input.clubId,
        input.teamId ?? null,
        input.clubRolle ?? 'CLUB_MEMBER',
        input.teamRolle ?? 'MEMBER',
        JSON.stringify(bereinigteGroups),
        input.zielEmail?.trim().toLowerCase() || null,
        Boolean(input.bestaetigungErforderlich),
        input.gueltigBis,
      ]
    );

    return {
      einladung: mapInvitationRow(res.rows[0]),
      token,
      pfad: `/invite/${encodeURIComponent(token)}`,
    };
  }

  async findeAktiveEinladungNachToken(token: string): Promise<EinladungEintrag | null> {
    const tokenHash = hashEinladungsToken(token);
    const res = await this.db.query(
      `SELECT * FROM core.invitations
       WHERE token_hash = $1 AND active = TRUE AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    return res.rows[0] ? mapInvitationRow(res.rows[0]) : null;
  }

  async listeEinladungenNachClub(clubId: string): Promise<EinladungEintrag[]> {
    const res = await this.db.query(
      `SELECT * FROM core.invitations WHERE club_id = $1 ORDER BY created_at DESC`,
      [clubId]
    );
    return res.rows.map(mapInvitationRow);
  }

  async deaktiviereEinladung(invitationId: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE core.invitations SET active = FALSE WHERE id = $1`,
      [invitationId]
    );
    return res.rowCount > 0;
  }

  /**
   * Atomarer Onboarding-Workflow (#26):
   * Ein Nutzer, der einem Team-Link folgt, wird automatisch Mitglied im übergeordneten Club
   * (ohne bestehende CLUB_ADMIN-Rolle herabzustufen) und erhält direkt die Team-Zuweisung.
   */
  async loeseEinladungFuerUserEin(params: {
    userUuid: string;
    einladung: EinladungEintrag;
  }): Promise<{
    clubMitgliedschaft: ClubMitgliedschaft;
    teamMitgliedschaft: TeamMitgliedschaft | null;
  }> {
    const zielStatus: MitgliedschaftStatus = params.einladung.bestaetigungErforderlich
      ? 'PENDING'
      : 'ACTIVE';

    return this.db.transaction(async (tx) => {
      const existingClub = await tx.query(
        `SELECT * FROM core.club_memberships WHERE user_uuid = $1 AND club_id = $2 LIMIT 1`,
        [params.userUuid, params.einladung.clubId]
      );

      let clubRow: Record<string, unknown>;
      if (existingClub.rows[0]) {
        const currentRole = existingClub.rows[0].role === 'CLUB_ADMIN' ? 'CLUB_ADMIN' : params.einladung.clubRolle;
        const currentStatus =
          existingClub.rows[0].status === 'ACTIVE' ? 'ACTIVE' : zielStatus;
        const upd = await tx.query(
          `UPDATE core.club_memberships SET role = $3, status = $4
           WHERE user_uuid = $1 AND club_id = $2 RETURNING *`,
          [params.userUuid, params.einladung.clubId, currentRole, currentStatus]
        );
        clubRow = upd.rows[0];
      } else {
        const ins = await tx.query(
          `INSERT INTO core.club_memberships (id, user_uuid, club_id, role, status)
           VALUES ($1, $2, $3, $4, $5) RETURNING *`,
          [
            `cmem-${crypto.randomUUID()}`,
            params.userUuid,
            params.einladung.clubId,
            params.einladung.clubRolle,
            zielStatus,
          ]
        );
        clubRow = ins.rows[0];
      }

      let teamMitgliedschaft: TeamMitgliedschaft | null = null;
      if (params.einladung.teamId) {
        const teamIns = await tx.query(
          `INSERT INTO core.team_memberships (id, user_uuid, team_id, role, groups, status)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           ON CONFLICT (user_uuid, team_id)
           DO UPDATE SET role = EXCLUDED.role, groups = EXCLUDED.groups, status = EXCLUDED.status
           RETURNING *`,
          [
            `tmem-${crypto.randomUUID()}`,
            params.userUuid,
            params.einladung.teamId,
            params.einladung.teamRolle,
            JSON.stringify(params.einladung.groups),
            zielStatus,
          ]
        );
        teamMitgliedschaft = mapTeamMembershipRow(teamIns.rows[0]);
      }

      // E-Mail-gebundene Einmal-Einladungen sofort verbrauchen
      if (params.einladung.zielEmail) {
        await tx.query(`UPDATE core.invitations SET active = FALSE WHERE id = $1`, [
          params.einladung.id,
        ]);
      }

      return {
        clubMitgliedschaft: mapClubMembershipRow(clubRow),
        teamMitgliedschaft,
      };
    });
  }

  // ---- Plugins & Scope-Module ----

  async listeInstalliertePlugins(): Promise<InstalliertesPluginDatensatz[]> {
    const res = await this.db.query(
      `SELECT * FROM core.installed_plugins ORDER BY plugin_id ASC`
    );
    return res.rows.map(mapPluginRow);
  }

  async findePlugin(pluginId: PluginId): Promise<InstalliertesPluginDatensatz | null> {
    const res = await this.db.query(
      `SELECT * FROM core.installed_plugins WHERE plugin_id = $1 LIMIT 1`,
      [pluginId]
    );
    return res.rows[0] ? mapPluginRow(res.rows[0]) : null;
  }

  async speichereInstalliertesPlugin(input: {
    manifest: PluginManifest;
    enabledGlobally: boolean;
    approvedCapabilities?: PrivilegiertePluginPermission[];
    sourceUrl?: string | null;
    sha256?: string | null;
  }): Promise<InstalliertesPluginDatensatz> {
    const vorhanden = await this.findePlugin(input.manifest.id);
    const previousVersion =
      vorhanden && vorhanden.version !== input.manifest.version
        ? vorhanden.version
        : vorhanden?.previousVersion ?? null;
    const approved =
      input.approvedCapabilities ?? vorhanden?.approvedCapabilities ?? [];

    const res = await this.db.query(
      `INSERT INTO core.installed_plugins (
         plugin_id, version, previous_version, manifest_json,
         enabled_globally, approved_capabilities, source_url, sha256, installed_at, last_error
       ) VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, NOW(), NULL)
       ON CONFLICT (plugin_id) DO UPDATE SET
         version = EXCLUDED.version,
         previous_version = EXCLUDED.previous_version,
         manifest_json = EXCLUDED.manifest_json,
         enabled_globally = EXCLUDED.enabled_globally,
         approved_capabilities = EXCLUDED.approved_capabilities,
         source_url = EXCLUDED.source_url,
         sha256 = EXCLUDED.sha256,
         installed_at = NOW(),
         last_error = NULL
       RETURNING *`,
      [
        input.manifest.id,
        input.manifest.version,
        previousVersion,
        JSON.stringify(input.manifest),
        input.enabledGlobally,
        JSON.stringify(approved),
        input.sourceUrl ?? null,
        input.sha256 ?? null,
      ]
    );
    return mapPluginRow(res.rows[0]);
  }

  async aktualisierePluginStatus(
    pluginId: PluginId,
    patch: {
      enabledGlobally?: boolean;
      approvedCapabilities?: PrivilegiertePluginPermission[];
      lastError?: string | null;
    }
  ): Promise<InstalliertesPluginDatensatz | null> {
    const vorhanden = await this.findePlugin(pluginId);
    if (!vorhanden) return null;

    const nextEnabled =
      typeof patch.enabledGlobally === 'boolean'
        ? patch.enabledGlobally
        : vorhanden.enabledGlobally;
    const nextApproved = patch.approvedCapabilities ?? vorhanden.approvedCapabilities;
    const nextError = patch.lastError === undefined ? vorhanden.lastError : patch.lastError;

    const res = await this.db.query(
      `UPDATE core.installed_plugins
       SET enabled_globally = $2,
           approved_capabilities = $3::jsonb,
           last_error = $4
       WHERE plugin_id = $1
       RETURNING *`,
      [pluginId, nextEnabled, JSON.stringify(nextApproved), nextError]
    );
    return res.rows[0] ? mapPluginRow(res.rows[0]) : null;
  }

  async loescheInstalliertesPlugin(pluginId: PluginId): Promise<boolean> {
    const res = await this.db.query(
      `DELETE FROM core.installed_plugins WHERE plugin_id = $1`,
      [pluginId]
    );
    return res.rowCount > 0;
  }

  async setzeScopeModulAktiv(
    scopeTyp: ScopeTyp,
    scopeId: string,
    pluginId: PluginId,
    enabled: boolean
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO core.scope_modules (scope_type, scope_id, plugin_id, enabled)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scope_type, scope_id, plugin_id)
       DO UPDATE SET enabled = EXCLUDED.enabled`,
      [scopeTyp, scopeId, pluginId, enabled]
    );
  }

  async listeAktiveScopeModule(scopeTyp: ScopeTyp, scopeId: string): Promise<PluginId[]> {
    const res = await this.db.query<{ plugin_id: string }>(
      `SELECT sm.plugin_id
       FROM core.scope_modules sm
       JOIN core.installed_plugins ip ON ip.plugin_id = sm.plugin_id
       WHERE sm.scope_type = $1 AND sm.scope_id = $2
         AND sm.enabled = TRUE AND ip.enabled_globally = TRUE
       ORDER BY sm.plugin_id ASC`,
      [scopeTyp, scopeId]
    );
    return res.rows.map((r) => r.plugin_id);
  }

  async istScopeModulAktiv(
    scopeTyp: ScopeTyp,
    scopeId: string,
    pluginId: PluginId
  ): Promise<boolean> {
    const res = await this.db.query(
      `SELECT 1 FROM core.scope_modules
       WHERE scope_type = $1 AND scope_id = $2 AND plugin_id = $3 AND enabled = TRUE
       LIMIT 1`,
      [scopeTyp, scopeId, pluginId]
    );
    return res.rows.length > 0;
  }

  // ---- System-Settings & In-App-Notifications ----

  async holeSystemSetting<T = Record<string, unknown>>(key: string): Promise<T | null> {
    const res = await this.db.query<{ value_json: unknown }>(
      `SELECT value_json FROM core.system_settings WHERE setting_key = $1 LIMIT 1`,
      [key]
    );
    if (!res.rows[0]) return null;
    const raw = res.rows[0].value_json;
    return (typeof raw === 'string' ? JSON.parse(raw) : raw) as T;
  }

  async speichereSystemSetting(key: string, wert: unknown): Promise<void> {
    await this.db.query(
      `INSERT INTO core.system_settings (setting_key, value_json, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (setting_key) DO UPDATE SET
         value_json = EXCLUDED.value_json,
         updated_at = NOW()`,
      [key, JSON.stringify(wert)]
    );
  }

  async erstelleNotification(input: {
    userUuid: string;
    clubId?: string;
    teamId?: string;
    sourcePluginId: string;
    eventType: string;
    title: string;
    message: string;
    linkPath?: string;
    priority?: NotificationPrioritaet;
    metadata?: Record<string, unknown>;
  }): Promise<NotificationEintrag> {
    const id = `ntf-${crypto.randomUUID()}`;
    const res = await this.db.query(
      `INSERT INTO core.notifications (
         id, user_uuid, club_id, team_id, source_plugin_id,
         event_type, title, message, link_path, priority, metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
       RETURNING *`,
      [
        id,
        input.userUuid,
        input.clubId ?? null,
        input.teamId ?? null,
        input.sourcePluginId,
        input.eventType,
        input.title,
        input.message,
        input.linkPath ?? null,
        input.priority ?? 'info',
        JSON.stringify(input.metadata ?? {}),
      ]
    );
    return mapNotificationRow(res.rows[0]);
  }

  async listeNotificationsFuerUser(
    userUuid: string,
    optionen: { limit?: number; nurUngelesen?: boolean } = {}
  ): Promise<NotificationEintrag[]> {
    const limit = Math.max(1, Math.min(100, optionen.limit ?? 30));
    const sql = optionen.nurUngelesen
      ? `SELECT * FROM core.notifications WHERE user_uuid = $1 AND read_at IS NULL ORDER BY created_at DESC LIMIT $2`
      : `SELECT * FROM core.notifications WHERE user_uuid = $1 ORDER BY created_at DESC LIMIT $2`;
    const res = await this.db.query(sql, [userUuid, limit]);
    return res.rows.map(mapNotificationRow);
  }

  async zaehleUngeleseneNotifications(userUuid: string): Promise<number> {
    const res = await this.db.query<{ anzahl: string | number }>(
      `SELECT COUNT(*)::int AS anzahl FROM core.notifications WHERE user_uuid = $1 AND read_at IS NULL`,
      [userUuid]
    );
    return Number(res.rows[0]?.anzahl ?? 0);
  }

  async markiereNotificationGelesen(userUuid: string, id: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE core.notifications SET read_at = NOW() WHERE id = $1 AND user_uuid = $2 AND read_at IS NULL`,
      [id, userUuid]
    );
    return res.rowCount > 0;
  }

  async markiereAlleNotificationsGelesen(userUuid: string): Promise<number> {
    const res = await this.db.query(
      `UPDATE core.notifications SET read_at = NOW() WHERE user_uuid = $1 AND read_at IS NULL`,
      [userUuid]
    );
    return res.rowCount;
  }
}

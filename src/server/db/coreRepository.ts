import crypto from 'node:crypto';
import type {
  BenutzerKonto,
  PluginId,
  ProfilCustomFeld,
  SpielerUnit,
  TeamEinladung,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { normalisiereSprache } from '../../shared/i18n.ts';
import {
  STANDARD_THEME_REF,
  SYSTEM_THEME_SETTING_KEY,
  parseThemeRef,
} from '../../shared/theme.ts';
import type { PluginManifest, PluginStoreEintrag } from '../../sdk/plugin.ts';
import type { CoreDatabaseClient } from './client.ts';

export interface DbBenutzerMitHash {
  konto: BenutzerKonto;
  passwordHash: string;
}

export interface DbSessionEintrag {
  id: string;
  userUuid: string;
  expiresAt: string;
}

function toIsoDate(wert: unknown): string {
  if (wert instanceof Date) {
    return wert.toISOString().slice(0, 10);
  }
  return String(wert ?? '').slice(0, 10);
}

function parseJsonWert<T>(wert: unknown, fallback: T): T {
  if (wert === null || wert === undefined) return fallback;
  if (typeof wert === 'string') {
    try {
      return JSON.parse(wert) as T;
    } catch {
      return fallback;
    }
  }
  return wert as T;
}

interface UserRow {
  uuid: string;
  username: string;
  full_name: string;
  email: string;
  password_hash: string;
  phone: string;
  jersey_number: string;
  position: string;
  is_sysadmin: boolean;
  preferred_locale?: string;
  preferred_theme?: string;
  custom_profile_values: unknown;
  created_at: unknown;
}

function mapUserRow(row: UserRow): DbBenutzerMitHash {
  const cleanTheme =
    typeof row.preferred_theme === 'string' && row.preferred_theme.trim()
      ? row.preferred_theme.trim()
      : undefined;
  return {
    passwordHash: row.password_hash,
    konto: {
      uuid: row.uuid,
      benutzername: row.username,
      vollerName: row.full_name,
      email: row.email,
      telefon: row.phone || undefined,
      trikotNummer: row.jersey_number || undefined,
      position: row.position || undefined,
      istSysadmin: Boolean(row.is_sysadmin),
      erstelltAm: toIsoDate(row.created_at),
      preferredLocale: normalisiereSprache(row.preferred_locale, 'de'),
      ...(cleanTheme ? { preferredTheme: cleanTheme } : {}),
      customProfilWerte: parseJsonWert<Record<string, string>>(row.custom_profile_values, {}),
    },
  };
}

export class CoreRepository {
  constructor(private readonly db: CoreDatabaseClient) {}

  // --- Benutzer ---

  async zaehleBenutzer(): Promise<number> {
    const res = await this.db.query<{ anzahl: string | number }>(
      `SELECT COUNT(*)::int AS anzahl FROM core.users`
    );
    return Number(res.rows[0]?.anzahl ?? 0);
  }

  async listeBenutzer(): Promise<BenutzerKonto[]> {
    const res = await this.db.query<UserRow>(
      `SELECT uuid, username, full_name, email, password_hash, phone, jersey_number,
              position, is_sysadmin, preferred_locale, preferred_theme, custom_profile_values, created_at
       FROM core.users
       ORDER BY created_at ASC, full_name ASC`
    );
    return res.rows.map((r) => mapUserRow(r).konto);
  }

  async findeBenutzerMitHashNachKennung(kennung: string): Promise<DbBenutzerMitHash | null> {
    const norm = kennung.trim().toLowerCase();
    if (!norm) return null;
    const res = await this.db.query<UserRow>(
      `SELECT uuid, username, full_name, email, password_hash, phone, jersey_number,
              position, is_sysadmin, preferred_locale, preferred_theme, custom_profile_values, created_at
       FROM core.users
       WHERE LOWER(email) = $1 OR LOWER(username) = $1
       LIMIT 1`,
      [norm]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  async findeBenutzerNachUuid(uuid: string): Promise<DbBenutzerMitHash | null> {
    const res = await this.db.query<UserRow>(
      `SELECT uuid, username, full_name, email, password_hash, phone, jersey_number,
              position, is_sysadmin, preferred_locale, preferred_theme, custom_profile_values, created_at
       FROM core.users
       WHERE uuid = $1
       LIMIT 1`,
      [uuid]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  async existiertEmailOderBenutzername(
    email: string,
    benutzername: string,
    ignoriereUuid?: string
  ): Promise<boolean> {
    const res = await this.db.query<{ uuid: string }>(
      `SELECT uuid FROM core.users
       WHERE (LOWER(email) = $1 OR LOWER(username) = $2)
         AND ($3::text IS NULL OR uuid <> $3)
       LIMIT 1`,
      [email.trim().toLowerCase(), benutzername.trim().toLowerCase(), ignoriereUuid ?? null]
    );
    return res.rows.length > 0;
  }

  async erstelleBenutzer(konto: BenutzerKonto, passwordHash: string): Promise<BenutzerKonto> {
    const res = await this.db.query<UserRow>(
      `INSERT INTO core.users (
         uuid, username, full_name, email, password_hash,
         phone, jersey_number, position, is_sysadmin, preferred_locale, preferred_theme, custom_profile_values, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
       RETURNING uuid, username, full_name, email, password_hash, phone, jersey_number,
                 position, is_sysadmin, preferred_locale, preferred_theme, custom_profile_values, created_at`,
      [
        konto.uuid,
        konto.benutzername.trim().toLowerCase(),
        konto.vollerName.trim(),
        konto.email.trim().toLowerCase(),
        passwordHash,
        konto.telefon ?? '',
        konto.trikotNummer ?? '',
        konto.position ?? '',
        konto.istSysadmin,
        normalisiereSprache(konto.preferredLocale, 'de'),
        konto.preferredTheme?.trim() ?? '',
        JSON.stringify(konto.customProfilWerte ?? {}),
        konto.erstelltAm || new Date().toISOString().slice(0, 10),
      ]
    );
    return mapUserRow(res.rows[0]).konto;
  }

  async aktualisiereBenutzer(konto: BenutzerKonto): Promise<BenutzerKonto | null> {
    const res = await this.db.query<UserRow>(
      `UPDATE core.users
       SET username = $2,
           full_name = $3,
           email = $4,
           phone = $5,
           jersey_number = $6,
           position = $7,
           is_sysadmin = $8,
           preferred_locale = $9,
           preferred_theme = $10,
           custom_profile_values = $11::jsonb,
           updated_at = NOW()
       WHERE uuid = $1
       RETURNING uuid, username, full_name, email, password_hash, phone, jersey_number,
                 position, is_sysadmin, preferred_locale, preferred_theme, custom_profile_values, created_at`,
      [
        konto.uuid,
        konto.benutzername.trim().toLowerCase(),
        konto.vollerName.trim(),
        konto.email.trim().toLowerCase(),
        konto.telefon ?? '',
        konto.trikotNummer ?? '',
        konto.position ?? '',
        konto.istSysadmin,
        normalisiereSprache(konto.preferredLocale, 'de'),
        konto.preferredTheme?.trim() ?? '',
        JSON.stringify(konto.customProfilWerte ?? {}),
      ]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]).konto : null;
  }

  async aktualisierePasswortHash(userUuid: string, neuerHash: string): Promise<void> {
    await this.db.query(
      `UPDATE core.users SET password_hash = $2, updated_at = NOW() WHERE uuid = $1`,
      [userUuid, neuerHash]
    );
  }

  async loescheBenutzer(userUuid: string): Promise<void> {
    await this.db.query(`DELETE FROM core.users WHERE uuid = $1`, [userUuid]);
  }

  // --- Sessions ---

  async erstelleSession(
    userUuid: string,
    tokenHash: string,
    ttlStunden: number
  ): Promise<DbSessionEintrag> {
    const id = `sess-${crypto.randomUUID()}`;
    const expiresAt = new Date(Date.now() + ttlStunden * 3600 * 1000).toISOString();
    await this.db.query(
      `INSERT INTO core.sessions (id, token_hash, user_uuid, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [id, tokenHash, userUuid, expiresAt]
    );
    return { id, userUuid, expiresAt };
  }

  async findeAktiveSession(tokenHash: string): Promise<DbSessionEintrag | null> {
    const res = await this.db.query<{ id: string; user_uuid: string; expires_at: unknown }>(
      `SELECT id, user_uuid, expires_at
       FROM core.sessions
       WHERE token_hash = $1 AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash]
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      userUuid: row.user_uuid,
      expiresAt:
        row.expires_at instanceof Date ? row.expires_at.toISOString() : String(row.expires_at),
    };
  }

  async loescheSession(tokenHash: string): Promise<void> {
    await this.db.query(`DELETE FROM core.sessions WHERE token_hash = $1`, [tokenHash]);
  }

  // --- Teams & Saisons ---

  async listeTeams(): Promise<TeamKontext[]> {
    const teamsRes = await this.db.query<{
      id: string;
      name: string;
      short_name: string;
      active_season: string;
      primary_color: string;
      custom_profile_fields: unknown;
    }>(
      `SELECT id, name, short_name, active_season, primary_color, custom_profile_fields
       FROM core.teams
       ORDER BY created_at ASC, name ASC`
    );

    const saisonRes = await this.db.query<{ team_id: string; season: string }>(
      `SELECT team_id, season FROM core.team_seasons ORDER BY season DESC`
    );
    const modulRes = await this.db.query<{ team_id: string; plugin_id: string }>(
      `SELECT team_id, plugin_id FROM core.team_modules WHERE enabled = TRUE`
    );

    return teamsRes.rows.map((t) => {
      const saisons = saisonRes.rows.filter((s) => s.team_id === t.id).map((s) => s.season);
      const aktivierteModule = modulRes.rows
        .filter((m) => m.team_id === t.id)
        .map((m) => m.plugin_id);
      return {
        id: t.id,
        name: t.name,
        kurzname: t.short_name,
        aktiveSaison: t.active_season,
        saisons: saisons.length > 0 ? saisons : [t.active_season],
        primaerFarbe: t.primary_color,
        aktivierteModule,
        customProfilFelder: parseJsonWert<ProfilCustomFeld[]>(t.custom_profile_fields, []),
      };
    });
  }

  async erstelleTeam(team: TeamKontext): Promise<TeamKontext> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO core.teams (id, name, short_name, active_season, primary_color, custom_profile_fields)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [
          team.id,
          team.name.trim(),
          team.kurzname.trim(),
          team.aktiveSaison,
          team.primaerFarbe ?? '#F59E0B',
          JSON.stringify(team.customProfilFelder ?? []),
        ]
      );

      const saisons = Array.from(new Set([team.aktiveSaison, ...team.saisons]));
      for (const saison of saisons) {
        await tx.query(
          `INSERT INTO core.team_seasons (team_id, season) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [team.id, saison]
        );
      }

      for (const pluginId of team.aktivierteModule) {
        await tx.query(
          `INSERT INTO core.team_modules (team_id, plugin_id, enabled)
           SELECT $1, plugin_id, TRUE
           FROM core.installed_plugins
           WHERE plugin_id = $2
           ON CONFLICT (team_id, plugin_id) DO UPDATE SET enabled = TRUE`,
          [team.id, pluginId]
        );
      }
    });

    return team;
  }

  async findeTeamNachId(teamId: string): Promise<TeamKontext | null> {
    const teams = await this.listeTeams();
    return teams.find((t) => t.id === teamId) ?? null;
  }

  async aktualisiereTeam(team: TeamKontext): Promise<TeamKontext | null> {
    const res = await this.db.query<{ id: string }>(
      `UPDATE core.teams
       SET name = $2,
           short_name = $3,
           active_season = $4,
           primary_color = $5,
           custom_profile_fields = $6::jsonb
       WHERE id = $1
       RETURNING id`,
      [
        team.id,
        team.name.trim(),
        team.kurzname.trim(),
        team.aktiveSaison,
        team.primaerFarbe ?? '#F59E0B',
        JSON.stringify(team.customProfilFelder ?? []),
      ]
    );
    if (res.rows.length === 0) return null;
    await this.fuegeTeamSaisonHinzu(team.id, team.aktiveSaison, true);
    return this.findeTeamNachId(team.id);
  }

  async fuegeTeamSaisonHinzu(teamId: string, saison: string, alsAktiv = true): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO core.team_seasons (team_id, season) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [teamId, saison]
      );
      if (alsAktiv) {
        await tx.query(`UPDATE core.teams SET active_season = $2 WHERE id = $1`, [
          teamId,
          saison,
        ]);
      }
    });
  }

  async loescheTeam(teamId: string): Promise<void> {
    await this.db.query(`DELETE FROM core.teams WHERE id = $1`, [teamId]);
  }

  // --- Mitgliedschaften ---

  async findeMitgliedschaftNachId(id: string): Promise<TeamMitgliedschaft | null> {
    const res = await this.db.query<{
      id: string;
      user_uuid: string;
      team_id: string;
      role: TeamRolle;
      units: unknown;
      status: TeamMitgliedschaft['status'];
      joined_at: unknown;
    }>(
      `SELECT id, user_uuid, team_id, role, units, status, joined_at
       FROM core.memberships WHERE id = $1 LIMIT 1`,
      [id]
    );
    const m = res.rows[0];
    if (!m) return null;
    return {
      id: m.id,
      userUuid: m.user_uuid,
      teamId: m.team_id,
      rolle: m.role,
      units: parseJsonWert<SpielerUnit[]>(m.units, ['OFFENSE']),
      status: m.status,
      beigetretenAm: toIsoDate(m.joined_at),
    };
  }

  async listeMitgliedschaften(teamId?: string): Promise<TeamMitgliedschaft[]> {
    const sql = teamId
      ? `SELECT id, user_uuid, team_id, role, units, status, joined_at
         FROM core.memberships WHERE team_id = $1 ORDER BY joined_at ASC`
      : `SELECT id, user_uuid, team_id, role, units, status, joined_at
         FROM core.memberships ORDER BY joined_at ASC`;
    const res = await this.db.query<{
      id: string;
      user_uuid: string;
      team_id: string;
      role: TeamRolle;
      units: unknown;
      status: TeamMitgliedschaft['status'];
      joined_at: unknown;
    }>(sql, teamId ? [teamId] : []);

    return res.rows.map((m) => ({
      id: m.id,
      userUuid: m.user_uuid,
      teamId: m.team_id,
      rolle: m.role,
      units: parseJsonWert<SpielerUnit[]>(m.units, ['OFFENSE']),
      status: m.status,
      beigetretenAm: toIsoDate(m.joined_at),
    }));
  }

  async speichereMitgliedschaft(m: TeamMitgliedschaft): Promise<TeamMitgliedschaft> {
    await this.db.query(
      `INSERT INTO core.memberships (id, user_uuid, team_id, role, units, status, joined_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       ON CONFLICT (user_uuid, team_id) DO UPDATE
       SET role = EXCLUDED.role, units = EXCLUDED.units, status = EXCLUDED.status`,
      [m.id, m.userUuid, m.teamId, m.rolle, JSON.stringify(m.units), m.status, m.beigetretenAm]
    );
    return m;
  }

  async loescheMitgliedschaft(mitgliedschaftId: string): Promise<void> {
    await this.db.query(`DELETE FROM core.memberships WHERE id = $1`, [mitgliedschaftId]);
  }

  async setzeBenutzerMitgliedschaften(
    userUuid: string,
    gewuenschte: Array<{
      teamId: string;
      rolle: TeamRolle;
      units: SpielerUnit[];
      status: 'AKTIV' | 'WARTET_AUF_FREIGABE';
    }>
  ): Promise<TeamMitgliedschaft[]> {
    const heute = new Date().toISOString().slice(0, 10);
    await this.db.transaction(async (tx) => {
      const bestehendRes = await tx.query<{
        id: string;
        team_id: string;
        joined_at: unknown;
      }>(`SELECT id, team_id, joined_at FROM core.memberships WHERE user_uuid = $1`, [userUuid]);
      const bestehendNachTeam = new Map(bestehendRes.rows.map((r) => [r.team_id, r]));
      const zielTeamIds = new Set(gewuenschte.map((g) => g.teamId));

      for (const alt of bestehendRes.rows) {
        if (!zielTeamIds.has(alt.team_id)) {
          await tx.query(`DELETE FROM core.memberships WHERE id = $1`, [alt.id]);
        }
      }

      for (const eintrag of gewuenschte) {
        const alt = bestehendNachTeam.get(eintrag.teamId);
        const id = alt?.id ?? `mem-${crypto.randomUUID()}`;
        const joinedAt = alt ? toIsoDate(alt.joined_at) : heute;
        await tx.query(
          `INSERT INTO core.memberships (id, user_uuid, team_id, role, units, status, joined_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
           ON CONFLICT (user_uuid, team_id) DO UPDATE
           SET role = EXCLUDED.role, units = EXCLUDED.units, status = EXCLUDED.status`,
          [
            id,
            userUuid,
            eintrag.teamId,
            eintrag.rolle,
            JSON.stringify(eintrag.units),
            eintrag.status,
            joinedAt,
          ]
        );
      }
    });

    const alle = await this.listeMitgliedschaften();
    return alle.filter((m) => m.userUuid === userUuid);
  }

  // --- Einladungen ---

  async listeEinladungen(teamId?: string): Promise<TeamEinladung[]> {
    const sql = teamId
      ? `SELECT id, team_id, type, target_email, role, units, token, path, expires_at, requires_approval, active, created_at
         FROM core.invitations WHERE team_id = $1 ORDER BY created_at DESC`
      : `SELECT id, team_id, type, target_email, role, units, token, path, expires_at, requires_approval, active, created_at
         FROM core.invitations ORDER BY created_at DESC`;

    const res = await this.db.query<{
      id: string;
      team_id: string;
      type: TeamEinladung['typ'];
      target_email: string | null;
      role: TeamRolle;
      units: unknown;
      token: string;
      path: string;
      expires_at: unknown;
      requires_approval: boolean;
      active: boolean;
      created_at: unknown;
    }>(sql, teamId ? [teamId] : []);

    return res.rows.map((e) => ({
      id: e.id,
      teamId: e.team_id,
      typ: e.type,
      ...(e.target_email ? { zielEmail: e.target_email } : {}),
      rolle: e.role,
      units: parseJsonWert<SpielerUnit[]>(e.units, ['OFFENSE']),
      token: e.token,
      pfad: e.path,
      erstelltAm: toIsoDate(e.created_at),
      gueltigBis: toIsoDate(e.expires_at),
      bestaetigungErforderlich: Boolean(e.requires_approval),
      aktiv: Boolean(e.active),
    }));
  }

  async findeEinladungNachToken(token: string): Promise<TeamEinladung | null> {
    const res = await this.db.query<{
      id: string;
      team_id: string;
      type: TeamEinladung['typ'];
      target_email: string | null;
      role: TeamRolle;
      units: unknown;
      token: string;
      path: string;
      expires_at: unknown;
      requires_approval: boolean;
      active: boolean;
      created_at: unknown;
    }>(
      `SELECT id, team_id, type, target_email, role, units, token, path, expires_at, requires_approval, active, created_at
       FROM core.invitations WHERE token = $1 LIMIT 1`,
      [token.trim()]
    );
    const e = res.rows[0];
    if (!e) return null;
    return {
      id: e.id,
      teamId: e.team_id,
      typ: e.type,
      ...(e.target_email ? { zielEmail: e.target_email } : {}),
      rolle: e.role,
      units: parseJsonWert<SpielerUnit[]>(e.units, ['OFFENSE']),
      token: e.token,
      pfad: e.path,
      erstelltAm: toIsoDate(e.created_at),
      gueltigBis: toIsoDate(e.expires_at),
      bestaetigungErforderlich: Boolean(e.requires_approval),
      aktiv: Boolean(e.active),
    };
  }

  async erstelleEinladung(e: TeamEinladung): Promise<TeamEinladung> {
    await this.db.query(
      `INSERT INTO core.invitations (
         id, team_id, type, target_email, role, units, token, path, expires_at, requires_approval, active, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12)`,
      [
        e.id,
        e.teamId,
        e.typ,
        e.zielEmail ?? null,
        e.rolle,
        JSON.stringify(e.units),
        e.token,
        e.pfad,
        e.gueltigBis,
        e.bestaetigungErforderlich,
        e.aktiv,
        e.erstelltAm,
      ]
    );
    return e;
  }

  async widerrufeEinladung(einladungId: string): Promise<void> {
    await this.db.query(`UPDATE core.invitations SET active = FALSE WHERE id = $1`, [einladungId]);
  }

  // --- Plugins & Team-Freigaben ---

  async registrierePlugin(
    eintrag: PluginStoreEintrag,
    globalAktiviert: boolean
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO core.installed_plugins (
         plugin_id, manifest_json, source, release_tag, enabled_globally,
         installed_version, install_mode
       ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, 'CATALOG')
       ON CONFLICT (plugin_id) DO NOTHING`,
      [
        eintrag.manifest.id,
        JSON.stringify(eintrag.manifest),
        eintrag.quelle,
        eintrag.releaseTag,
        globalAktiviert,
        eintrag.manifest.version,
      ]
    );
  }

  async speicherePluginInstallation(params: {
    manifest: PluginManifest;
    source: string;
    releaseTag: string;
    enabledGlobally: boolean;
    installMode: 'CATALOG' | 'RELEASE_BUNDLE' | 'OFFLINE_UPLOAD' | 'DEV_GIT';
    packageSha256?: string | null;
    devBranch?: string | null;
  }): Promise<void> {
    const bestehend = await this.findePluginStatus(params.manifest.id);
    const previousVersion =
      params.installMode === 'DEV_GIT'
        ? null
        : bestehend && bestehend.installedVersion !== params.manifest.version
          ? bestehend.installedVersion
          : bestehend?.previousVersion ?? null;

    await this.db.query(
      `INSERT INTO core.installed_plugins (
         plugin_id, manifest_json, source, release_tag, enabled_globally,
         installed_version, previous_version, install_mode, package_sha256, dev_branch, last_error, installed_at
       ) VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9, $10, NULL, NOW())
       ON CONFLICT (plugin_id) DO UPDATE SET
         manifest_json = EXCLUDED.manifest_json,
         source = EXCLUDED.source,
         release_tag = EXCLUDED.release_tag,
         installed_version = EXCLUDED.installed_version,
         previous_version = EXCLUDED.previous_version,
         install_mode = EXCLUDED.install_mode,
         package_sha256 = EXCLUDED.package_sha256,
         dev_branch = EXCLUDED.dev_branch,
         last_error = NULL,
         installed_at = NOW()`,
      [
        params.manifest.id,
        JSON.stringify(params.manifest),
        params.source,
        params.releaseTag,
        bestehend ? bestehend.enabledGlobally : params.enabledGlobally,
        params.manifest.version,
        previousVersion,
        params.installMode,
        params.packageSha256 ?? null,
        params.devBranch ?? null,
      ]
    );
  }

  async listeInstalliertePlugins(): Promise<
    Array<{
      manifest: PluginManifest;
      enabledGlobally: boolean;
      source: string;
      releaseTag: string;
      installedVersion: string;
      previousVersion: string | null;
      installMode: string;
      packageSha256: string | null;
      devBranch: string | null;
      installedAt: string;
      lastError: string | null;
    }>
  > {
    const res = await this.db.query<{
      manifest_json: unknown;
      enabled_globally: boolean;
      source: string;
      release_tag: string;
      installed_version: string;
      previous_version: string | null;
      install_mode: string;
      package_sha256: string | null;
      dev_branch: string | null;
      installed_at: unknown;
      last_error: string | null;
    }>(
      `SELECT manifest_json, enabled_globally, source, release_tag,
              installed_version, previous_version, install_mode, package_sha256, dev_branch,
              installed_at, last_error
       FROM core.installed_plugins
       ORDER BY installed_at ASC`
    );
    return res.rows.map((r) => {
      const manifest = parseJsonWert<PluginManifest>(r.manifest_json, {} as PluginManifest);
      return {
        manifest,
        enabledGlobally: Boolean(r.enabled_globally),
        source: r.source,
        releaseTag: r.release_tag,
        installedVersion: r.installed_version || manifest.version || '0.1.0',
        previousVersion: r.previous_version ?? null,
        installMode: r.install_mode || 'CATALOG',
        packageSha256: r.package_sha256 ?? null,
        devBranch: r.dev_branch ?? null,
        installedAt:
          r.installed_at instanceof Date
            ? r.installed_at.toISOString()
            : String(r.installed_at ?? ''),
        lastError: r.last_error ?? null,
      };
    });
  }

  async findePluginStatus(pluginId: string): Promise<{
    manifest: PluginManifest;
    enabledGlobally: boolean;
    installedVersion: string;
    previousVersion: string | null;
    installMode: string;
    source: string;
    releaseTag: string;
    installedAt: string;
    lastError: string | null;
  } | null> {
    const res = await this.db.query<{
      manifest_json: unknown;
      enabled_globally: boolean;
      installed_version: string;
      previous_version: string | null;
      install_mode: string;
      source: string;
      release_tag: string;
      installed_at: unknown;
      last_error: string | null;
    }>(
      `SELECT manifest_json, enabled_globally, installed_version, previous_version,
              install_mode, source, release_tag, installed_at, last_error
       FROM core.installed_plugins WHERE plugin_id = $1 LIMIT 1`,
      [pluginId]
    );
    const r = res.rows[0];
    if (!r) return null;
    const manifest = parseJsonWert<PluginManifest>(r.manifest_json, {} as PluginManifest);
    return {
      manifest,
      enabledGlobally: Boolean(r.enabled_globally),
      installedVersion: r.installed_version || manifest.version || '0.1.0',
      previousVersion: r.previous_version ?? null,
      installMode: r.install_mode || 'CATALOG',
      source: r.source,
      releaseTag: r.release_tag,
      installedAt:
        r.installed_at instanceof Date
          ? r.installed_at.toISOString()
          : String(r.installed_at ?? ''),
      lastError: r.last_error ?? null,
    };
  }

  async rollbackPluginVersion(
    pluginId: string,
    manifest: PluginManifest,
    zielVersion: string,
    releaseTag: string
  ): Promise<void> {
    await this.db.query(
      `UPDATE core.installed_plugins
       SET manifest_json = $2::jsonb,
           installed_version = $3,
           release_tag = $4,
           previous_version = NULL,
           last_error = NULL,
           installed_at = NOW()
       WHERE plugin_id = $1`,
      [pluginId, JSON.stringify(manifest), zielVersion, releaseTag]
    );
  }

  async speicherePluginFehler(pluginId: string, fehler: string | null): Promise<void> {
    await this.db.query(
      `UPDATE core.installed_plugins SET last_error = $2 WHERE plugin_id = $1`,
      [pluginId, fehler]
    );
  }

  async entferneInstalliertesPlugin(pluginId: string): Promise<boolean> {
    const res = await this.db.query<{ plugin_id: string }>(
      `DELETE FROM core.installed_plugins WHERE plugin_id = $1 RETURNING plugin_id`,
      [pluginId]
    );
    return res.rows.length > 0;
  }

  async setzePluginGlobalAktiv(pluginId: string, aktiv: boolean): Promise<boolean> {
    const res = await this.db.query<{ plugin_id: string }>(
      `UPDATE core.installed_plugins SET enabled_globally = $2 WHERE plugin_id = $1 RETURNING plugin_id`,
      [pluginId, aktiv]
    );
    return res.rows.length > 0;
  }

  async istTeamModulAktiv(teamId: string, pluginId: PluginId): Promise<boolean> {
    const res = await this.db.query<{ enabled: boolean }>(
      `SELECT enabled FROM core.team_modules WHERE team_id = $1 AND plugin_id = $2 LIMIT 1`,
      [teamId, pluginId]
    );
    return Boolean(res.rows[0]?.enabled);
  }

  async setzeTeamModulAktiv(teamId: string, pluginId: PluginId, aktiv: boolean): Promise<void> {
    await this.db.query(
      `INSERT INTO core.team_modules (team_id, plugin_id, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, plugin_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [teamId, pluginId, aktiv]
    );
  }

  // --- System-Einstellungen (S3 & SMTP) ---

  async holeSystemSetting<T>(key: string): Promise<T | null> {
    const res = await this.db.query<{ value_json: unknown }>(
      `SELECT value_json FROM core.system_settings WHERE key = $1 LIMIT 1`,
      [key]
    );
    if (res.rows.length === 0) return null;
    return parseJsonWert<T | null>(res.rows[0].value_json, null);
  }

  async speichereSystemSetting<T>(key: string, value: T): Promise<void> {
    await this.db.query(
      `INSERT INTO core.system_settings (key, value_json, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE
       SET value_json = EXCLUDED.value_json, updated_at = NOW()`,
      [key, JSON.stringify(value)]
    );
  }

  async holeStandardThemeRef(): Promise<string> {
    const gespeicherte = await this.holeSystemSetting<{ themeRef?: unknown }>(
      SYSTEM_THEME_SETTING_KEY
    );
    const parsed = parseThemeRef(gespeicherte?.themeRef);
    if (!parsed) return STANDARD_THEME_REF;
    return parsed.typ === 'core'
      ? STANDARD_THEME_REF
      : `${parsed.pluginId}:${parsed.themeId}`;
  }

  async speichereStandardThemeRef(themeRef: string): Promise<string> {
    const parsed = parseThemeRef(themeRef);
    const normalisiert = !parsed || parsed.typ === 'core'
      ? STANDARD_THEME_REF
      : `${parsed.pluginId}:${parsed.themeId}`;
    await this.speichereSystemSetting(SYSTEM_THEME_SETTING_KEY, { themeRef: normalisiert });
    return normalisiert;
  }

  // --- Benachrichtigungen (In-App-Standardkanal) ---

  async erstelleNotification(params: {
    userUuid: string;
    teamId?: string;
    sourcePluginId: string;
    eventType: string;
    title: string;
    message: string;
    linkPath?: string;
    priority: 'info' | 'warning' | 'urgent';
    metadata?: Record<string, unknown>;
  }): Promise<{
    id: string;
    userUuid: string;
    teamId?: string;
    sourcePluginId: string;
    eventType: string;
    title: string;
    message: string;
    linkPath?: string;
    priority: 'info' | 'warning' | 'urgent';
    metadata: Record<string, unknown>;
    readAt: string | null;
    createdAt: string;
  }> {
    const id = `ntf-${crypto.randomUUID()}`;
    const res = await this.db.query<{ created_at: unknown }>(
      `INSERT INTO core.notifications (
         id, user_uuid, team_id, source_plugin_id, event_type, title, message, link_path, priority, metadata_json
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
       RETURNING created_at`,
      [
        id,
        params.userUuid,
        params.teamId ?? null,
        params.sourcePluginId,
        params.eventType,
        params.title,
        params.message,
        params.linkPath ?? null,
        params.priority,
        JSON.stringify(params.metadata ?? {}),
      ]
    );
    const createdRaw = res.rows[0]?.created_at;
    const createdAt =
      createdRaw instanceof Date ? createdRaw.toISOString() : new Date().toISOString();
    return {
      id,
      userUuid: params.userUuid,
      ...(params.teamId ? { teamId: params.teamId } : {}),
      sourcePluginId: params.sourcePluginId,
      eventType: params.eventType,
      title: params.title,
      message: params.message,
      ...(params.linkPath ? { linkPath: params.linkPath } : {}),
      priority: params.priority,
      metadata: params.metadata ?? {},
      readAt: null,
      createdAt,
    };
  }

  async listeNotificationsFuerBenutzer(
    userUuid: string,
    limit = 50
  ): Promise<{
    notifications: Array<{
      id: string;
      userUuid: string;
      teamId?: string;
      sourcePluginId: string;
      eventType: string;
      title: string;
      message: string;
      linkPath?: string;
      priority: 'info' | 'warning' | 'urgent';
      metadata: Record<string, unknown>;
      readAt: string | null;
      createdAt: string;
    }>;
    unreadCount: number;
  }> {
    const clampedLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const [rowsRes, unreadRes] = await Promise.all([
      this.db.query<{
        id: string;
        user_uuid: string;
        team_id: string | null;
        source_plugin_id: string;
        event_type: string;
        title: string;
        message: string;
        link_path: string | null;
        priority: 'info' | 'warning' | 'urgent';
        metadata_json: unknown;
        read_at: unknown;
        created_at: unknown;
      }>(
        `SELECT id, user_uuid, team_id, source_plugin_id, event_type, title, message,
                link_path, priority, metadata_json, read_at, created_at
         FROM core.notifications
         WHERE user_uuid = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [userUuid, clampedLimit]
      ),
      this.db.query<{ anzahl: string | number }>(
        `SELECT COUNT(*)::int AS anzahl
         FROM core.notifications
         WHERE user_uuid = $1 AND read_at IS NULL`,
        [userUuid]
      ),
    ]);

    return {
      unreadCount: Number(unreadRes.rows[0]?.anzahl ?? 0),
      notifications: rowsRes.rows.map((r) => ({
        id: r.id,
        userUuid: r.user_uuid,
        ...(r.team_id ? { teamId: r.team_id } : {}),
        sourcePluginId: r.source_plugin_id,
        eventType: r.event_type,
        title: r.title,
        message: r.message,
        ...(r.link_path ? { linkPath: r.link_path } : {}),
        priority: r.priority,
        metadata: parseJsonWert<Record<string, unknown>>(r.metadata_json, {}),
        readAt:
          r.read_at instanceof Date
            ? r.read_at.toISOString()
            : r.read_at
              ? String(r.read_at)
              : null,
        createdAt:
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      })),
    };
  }

  async markiereNotificationGelesen(userUuid: string, notificationId: string): Promise<boolean> {
    const res = await this.db.query<{ id: string }>(
      `UPDATE core.notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = $1 AND user_uuid = $2
       RETURNING id`,
      [notificationId, userUuid]
    );
    return res.rows.length > 0;
  }

  async markiereAlleNotificationsGelesen(userUuid: string): Promise<number> {
    const res = await this.db.query<{ id: string }>(
      `UPDATE core.notifications
       SET read_at = NOW()
       WHERE user_uuid = $1 AND read_at IS NULL
       RETURNING id`,
      [userUuid]
    );
    return res.rows.length;
  }
}

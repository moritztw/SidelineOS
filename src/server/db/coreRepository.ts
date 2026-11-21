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
  custom_profile_values: unknown;
  created_at: unknown;
}

function mapUserRow(row: UserRow): DbBenutzerMitHash {
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
              position, is_sysadmin, custom_profile_values, created_at
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
              position, is_sysadmin, custom_profile_values, created_at
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
              position, is_sysadmin, custom_profile_values, created_at
       FROM core.users
       WHERE uuid = $1
       LIMIT 1`,
      [uuid]
    );
    return res.rows[0] ? mapUserRow(res.rows[0]) : null;
  }

  async erstelleBenutzer(konto: BenutzerKonto, passwordHash: string): Promise<BenutzerKonto> {
    const res = await this.db.query<UserRow>(
      `INSERT INTO core.users (
         uuid, username, full_name, email, password_hash,
         phone, jersey_number, position, is_sysadmin, custom_profile_values, created_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       RETURNING uuid, username, full_name, email, password_hash, phone, jersey_number,
                 position, is_sysadmin, custom_profile_values, created_at`,
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
           custom_profile_values = $9::jsonb,
           updated_at = NOW()
       WHERE uuid = $1
       RETURNING uuid, username, full_name, email, password_hash, phone, jersey_number,
                 position, is_sysadmin, custom_profile_values, created_at`,
      [
        konto.uuid,
        konto.benutzername.trim().toLowerCase(),
        konto.vollerName.trim(),
        konto.email.trim().toLowerCase(),
        konto.telefon ?? '',
        konto.trikotNummer ?? '',
        konto.position ?? '',
        konto.istSysadmin,
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
           VALUES ($1, $2, TRUE)
           ON CONFLICT (team_id, plugin_id) DO UPDATE SET enabled = TRUE`,
          [team.id, pluginId]
        );
      }
    });

    return team;
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
      `INSERT INTO core.installed_plugins (plugin_id, manifest_json, source, release_tag, enabled_globally)
       VALUES ($1, $2::jsonb, $3, $4, $5)
       ON CONFLICT (plugin_id) DO NOTHING`,
      [
        eintrag.manifest.id,
        JSON.stringify(eintrag.manifest),
        eintrag.quelle,
        eintrag.releaseTag,
        globalAktiviert,
      ]
    );
  }

  async listeInstalliertePlugins(): Promise<
    Array<{ manifest: PluginManifest; enabledGlobally: boolean; source: string; releaseTag: string }>
  > {
    const res = await this.db.query<{
      manifest_json: unknown;
      enabled_globally: boolean;
      source: string;
      release_tag: string;
    }>(
      `SELECT manifest_json, enabled_globally, source, release_tag
       FROM core.installed_plugins
       ORDER BY installed_at ASC`
    );
    return res.rows.map((r) => ({
      manifest: parseJsonWert<PluginManifest>(r.manifest_json, {} as PluginManifest),
      enabledGlobally: Boolean(r.enabled_globally),
      source: r.source,
      releaseTag: r.release_tag,
    }));
  }

  async setzeTeamModulAktiv(teamId: string, pluginId: PluginId, aktiv: boolean): Promise<void> {
    await this.db.query(
      `INSERT INTO core.team_modules (team_id, plugin_id, enabled)
       VALUES ($1, $2, $3)
       ON CONFLICT (team_id, plugin_id) DO UPDATE SET enabled = EXCLUDED.enabled`,
      [teamId, pluginId, aktiv]
    );
  }
}

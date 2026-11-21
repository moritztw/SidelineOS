import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import type { PluginManifest, SidelineBackendPlugin } from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import { PluginBackendHost } from '../../src/server/plugins/backendHost.ts';

function extrahiereCookieHeader(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie.split(';')[0] ?? '';
}

const VIDEO_TEST_MANIFEST: PluginManifest = {
  id: 'video-analysis',
  name: 'Videoanalyse',
  kurzbeschreibung: 'Test-Plugin Backend',
  version: '1.0.0',
  sdkVersion: '1.0',
  autor: 'Test',
  repositoryUrl: 'https://github.com/example/video',
  icon: 'film',
  status: 'AKTIV',
  standardAktiviert: true,
  permissions: ['team:read', 'db:plugin-tables', 'share:public-links'],
  dbPrefix: 'mod_video_',
  s3Prefix: 'plugins/video-analysis/',
  settingsAnker: {},
};

const PLAYBOOK_TEST_MANIFEST: PluginManifest = {
  ...VIDEO_TEST_MANIFEST,
  id: 'playbook',
  name: 'Playbook',
  permissions: ['team:read', 'db:plugin-tables'], // ausdrücklich OHNE share:public-links
};

describe('SidelineOS-Core API & Plugin-Gateway (Teilpaket 1B)', () => {
  let db: CoreDatabaseClient;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    const config = loadCoreConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'test-session-secret-mindestens-32-zeichen-lang',
    });
    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });

    const pluginHost = new PluginBackendHost(db);

    const videoBackend: SidelineBackendPlugin = {
      manifest: VIDEO_TEST_MANIFEST,
      migrations: [
        {
          name: '001_clips',
          sql: `
            CREATE TABLE IF NOT EXISTS clips (
              id TEXT PRIMARY KEY,
              team_id TEXT NOT NULL,
              titel TEXT NOT NULL
            );
          `,
        },
      ],
      async handleRequest(req, ctx) {
        if (req.method === 'POST' && req.path === '/clips') {
          const titel = String((req.body as { titel?: string })?.titel ?? 'Ohne Titel');
          const id = `clip-${Date.now()}`;
          await ctx.db.query(`INSERT INTO clips (id, team_id, titel) VALUES ($1, $2, $3)`, [
            id,
            ctx.team.id,
            titel,
          ]);
          return {
            status: 201,
            body: { id, titel, schemaName: ctx.db.schemaName, teamId: ctx.team.id },
          };
        }
        if (req.method === 'GET' && req.path === '/clips') {
          const res = await ctx.db.query<{ id: string; titel: string }>(
            `SELECT id, titel FROM clips WHERE team_id = $1`,
            [ctx.team.id]
          );
          return {
            status: 200,
            body: { schemaName: ctx.db.schemaName, clips: res.rows, rolle: ctx.teamRolle },
          };
        }
        return { status: 404, body: { fehler: 'Unbekannte Plugin-Route' } };
      },
      async handlePublicRequest(req, pluginDb) {
        return {
          status: 200,
          body: { path: req.path, schemaName: pluginDb.schemaName, oeffentlich: true },
        };
      },
    };

    const playbookBackend: SidelineBackendPlugin = {
      manifest: PLAYBOOK_TEST_MANIFEST,
      async handleRequest(_req, ctx) {
        return { status: 200, body: { team: ctx.team.id } };
      },
      async handlePublicRequest() {
        return { status: 200, body: { darfNichtErreichbarSein: true } };
      },
    };

    await pluginHost.registriereBackendPlugin(videoBackend);
    await pluginHost.registriereBackendPlugin(playbookBackend);

    const { app } = erstelleCoreApp({ db, config, pluginHost });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    assert.ok(addr && typeof addr !== 'string');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  });

  it('liefert /api/v1/health mit aktivem Datenbankdialekt und registrierten Plugins', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { status: string; db: string; plugins: string[] };
    assert.equal(data.status, 'ok');
    assert.equal(data.db, 'pglite');
    assert.ok(data.plugins.includes('video-analysis'));
  });

  it('authentifiziert per HttpOnly-Cookie und Bearer-Token und invalidiert bei Logout', async () => {
    const falsch = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: 'falsches-passwort' }),
    });
    assert.equal(falsch.status, 401);

    const loginRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: DEMO_STANDARD_PASSWORT }),
    });
    assert.equal(loginRes.status, 200);

    const setCookie = loginRes.headers.get('set-cookie');
    assert.ok(setCookie?.includes('sidelineos_session='));
    assert.ok(setCookie?.includes('HttpOnly'));
    const cookie = extrahiereCookieHeader(setCookie);

    const loginData = (await loginRes.json()) as {
      token: string;
      user: { uuid: string; istSysadmin: boolean };
      teams: Array<{ id: string }>;
    };
    assert.equal(loginData.user.istSysadmin, true);
    assert.ok(loginData.token.length > 20);
    assert.ok(loginData.teams.length >= 1);

    // /me via Cookie
    const meCookie = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { cookie },
    });
    assert.equal(meCookie.status, 200);

    // /me via Bearer
    const meBearer = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(meBearer.status, 200);

    // Logout löscht Session serverseitig
    const logoutRes = await fetch(`${baseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const meDanach = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(meDanach.status, 401);
  });

  it('bildet Einladungs-Registrierung mit Warteliste, Team-Admin-Freigabe und Konto-Trennung ab', async () => {
    // 1. Unbekannter Invite-Token -> 404
    const notFound = await fetch(`${baseUrl}/api/v1/auth/invite/unbekannt-token`);
    assert.equal(notFound.status, 404);

    // 2. Team Admin meldet sich an und erstellt Einladungslink mit Freigabepflicht
    const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: DEMO_STANDARD_PASSWORT }),
    });
    const adminData = (await adminLogin.json()) as { token: string };

    const invRes = await fetch(`${baseUrl}/api/v1/teams/team-stallions-u19/invitations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${adminData.token}`,
      },
      body: JSON.stringify({
        typ: 'TEAM_LINK',
        rolle: 'PLAYER',
        units: ['DEFENSE'],
        bestaetigungErforderlich: true,
      }),
    });
    assert.equal(invRes.status, 201);
    const invData = (await invRes.json()) as {
      invitation: { id: string; token: string };
    };

    // 3. Öffentliches Prüfen des Invite-Links
    const checkRes = await fetch(`${baseUrl}/api/v1/auth/invite/${invData.invitation.token}`);
    assert.equal(checkRes.status, 200);

    // 4. Neuer Spieler registriert sich über Invite-Link
    const acceptRes = await fetch(
      `${baseUrl}/api/v1/auth/invite/${invData.invitation.token}/accept`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          modus: 'neu',
          vollerName: 'Jonas Becker',
          benutzername: 'j.becker',
          email: 'jonas.becker@example.org',
          passwort: 'super-sicheres-passwort',
        }),
      }
    );
    assert.equal(acceptRes.status, 201);
    const acceptData = (await acceptRes.json()) as {
      status: string;
      membership: { id: string };
    };
    assert.equal(acceptData.status, 'WARTET_AUF_FREIGABE');

    // Noch nicht freigeschaltet -> Login möglich, aber kein aktiver Team-Zugriff
    const spielerLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kennung: 'j.becker',
        passwort: 'super-sicheres-passwort',
      }),
    });
    const spielerData = (await spielerLogin.json()) as { token: string };
    const blockiert = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-u19/clips`,
      { headers: { authorization: `Bearer ${spielerData.token}` } }
    );
    assert.equal(blockiert.status, 403);

    // 5. Team Admin schaltet Mitglied frei -> Zugriff funktioniert
    const freigabeRes = await fetch(
      `${baseUrl}/api/v1/teams/team-stallions-u19/members/${acceptData.membership.id}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminData.token}`,
        },
        body: JSON.stringify({ status: 'AKTIV' }),
      }
    );
    assert.equal(freigabeRes.status, 200);

    const erlaubt = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-u19/clips`,
      { headers: { authorization: `Bearer ${spielerData.token}` } }
    );
    assert.equal(erlaubt.status, 200);

    // 6. Team Admin entfernt Mitgliedschaft -> globales Konto bleibt intakt
    const entfernenRes = await fetch(
      `${baseUrl}/api/v1/teams/team-stallions-u19/members/${acceptData.membership.id}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminData.token}` },
      }
    );
    assert.equal(entfernenRes.status, 200);

    const nochAngemeldet = await fetch(`${baseUrl}/api/v1/auth/me`, {
      headers: { authorization: `Bearer ${spielerData.token}` },
    });
    assert.equal(nochAngemeldet.status, 200);

    // 7. Widerrufener Einladungslink liefert 410 Gone
    const revokeRes = await fetch(
      `${baseUrl}/api/v1/teams/team-stallions-u19/invitations/${invData.invitation.id}`,
      {
        method: 'DELETE',
        headers: { authorization: `Bearer ${adminData.token}` },
      }
    );
    assert.equal(revokeRes.status, 200);
    const afterRevoke = await fetch(`${baseUrl}/api/v1/auth/invite/${invData.invitation.token}`);
    assert.equal(afterRevoke.status, 410);
  });

  it('schützt Plugin-Gateway, Schema-Isolation und Sysadmin-Routen konsequent', async () => {
    const coachLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 't.richter', passwort: DEMO_STANDARD_PASSWORT }),
    });
    const coachData = (await coachLogin.json()) as { token: string };

    // Coach darf nicht auf /sysadmin zugreifen
    const sysadminVerboten = await fetch(`${baseUrl}/api/v1/sysadmin/overview`, {
      headers: { authorization: `Bearer ${coachData.token}` },
    });
    assert.equal(sysadminVerboten.status, 403);

    // Coach gehört nicht zu team-stallions-u19 -> 403
    const fremdesTeamVerboten = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-u19/clips`,
      { headers: { authorization: `Bearer ${coachData.token}` } }
    );
    assert.equal(fremdesTeamVerboten.status, 403);

    // Coach speichert Daten für sein Team im isolierten plugin_video_analysis Schema
    const postClip = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-seniors/clips`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${coachData.token}`,
        },
        body: JSON.stringify({ titel: 'Redzone Drill #4' }),
      }
    );
    assert.equal(postClip.status, 201);
    const clipData = (await postClip.json()) as { schemaName: string; titel: string };
    assert.equal(clipData.schemaName, 'plugin_video_analysis');
    assert.equal(clipData.titel, 'Redzone Drill #4');

    // Öffentlicher Share-Endpunkt erlaubt für video-analysis (share:public-links)
    const publicOk = await fetch(`${baseUrl}/api/v1/public/plugins/video-analysis/share-xyz`);
    assert.equal(publicOk.status, 200);

    // Öffentlicher Share-Endpunkt verweigert für playbook (Permission fehlt)
    const publicVerboten = await fetch(`${baseUrl}/api/v1/public/plugins/playbook/share-xyz`);
    assert.equal(publicVerboten.status, 403);

    // Sysadmin deaktiviert video-analysis für team-stallions-seniors
    const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: DEMO_STANDARD_PASSWORT }),
    });
    const adminData = (await adminLogin.json()) as { token: string };

    const toggleTeam = await fetch(
      `${baseUrl}/api/v1/sysadmin/teams/team-stallions-seniors/plugins/video-analysis`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminData.token}`,
        },
        body: JSON.stringify({ enabled: false }),
      }
    );
    assert.equal(toggleTeam.status, 200);

    const nachDeaktivierung = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-seniors/clips`,
      { headers: { authorization: `Bearer ${coachData.token}` } }
    );
    assert.equal(nachDeaktivierung.status, 403);
  });
});

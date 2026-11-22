import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import type { PluginManifest, SidelineBackendPlugin } from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import { CoreRepository } from '../../src/server/db/coreRepository.ts';
import { PluginBackendHost } from '../../src/server/plugins/backendHost.ts';
import { entschluesseleGeheimnis, verschluesseleGeheimnis } from '../../src/server/security.ts';
import {
  baueS3ClientKonfig,
  normalisiereUndPruefeS3Key,
  S3BrokerService,
  validiereS3EndpointUrl,
} from '../../src/server/services/s3Broker.ts';
import { SmtpService } from '../../src/server/services/smtpService.ts';

function extrahiereCookieHeader(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie.split(';')[0] ?? '';
}

const VIDEO_S3_MANIFEST: PluginManifest = {
  id: 'video-analysis',
  name: 'Videoanalyse',
  kurzbeschreibung: 'Test',
  version: '1.0.0',
  sdkVersion: '1.0',
  autor: 'Test',
  repositoryUrl: 'https://github.com/example/video',
  icon: 'film',
  status: 'AKTIV',
  standardAktiviert: true,
  permissions: ['team:read', 's3:team-rw', 'db:plugin-tables'],
  dbPrefix: 'mod_video_',
  s3Prefix: 'plugins/video-analysis/',
  settingsAnker: {},
};

const PLAYBOOK_OHNE_S3_MANIFEST: PluginManifest = {
  ...VIDEO_S3_MANIFEST,
  id: 'playbook',
  name: 'Playbook',
  permissions: ['team:read', 'db:plugin-tables'],
  dbPrefix: 'mod_playbook_',
  s3Prefix: 'plugins/playbook/',
};

describe('Core-Phase 2: S3-Broker & SMTP-Service', () => {
  let db: CoreDatabaseClient;
  let server: http.Server;
  let baseUrl: string;
  let gesendeteMails: Array<{ from: string; to: string; subject: string; text: string }> = [];
  let s3Kommandos: Array<{ name: string; input: Record<string, unknown> }> = [];
  let smtpSollFehlschlagen = false;

  before(async () => {
    const config = loadCoreConfig({
      NODE_ENV: 'test',
      APP_URL: 'https://sideline.example.org',
      SESSION_SECRET: 'phase2-test-session-secret-mindestens-32-chars',
      ENABLED_MODULES: 'video-analysis,playbook',
    });

    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });
    const repo = new CoreRepository(db);

    const s3Broker = new S3BrokerService(repo, config, {
      clientFactory: () => ({
        async send(command: unknown) {
          const cmd = command as { constructor: { name: string }; input: Record<string, unknown> };
          s3Kommandos.push({ name: cmd.constructor.name, input: cmd.input });
          return { $metadata: { httpStatusCode: 200 } };
        },
      }),
      presigner: async (_client, command, options) => {
        const cmd = command as unknown as {
          constructor: { name: string };
          input: { Bucket: string; Key: string };
        };
        return `https://minio.local/${cmd.input.Bucket}/${cmd.input.Key}?op=${cmd.constructor.name}&exp=${options.expiresIn}`;
      },
    });

    const smtpService = new SmtpService(repo, config, {
      transportFactory: () => ({
        async verify() {
          if (smtpSollFehlschlagen) throw new Error('ECONNREFUSED');
          return true;
        },
        async sendMail(mail) {
          if (smtpSollFehlschlagen) throw new Error('ECONNREFUSED');
          gesendeteMails.push(mail);
          return { messageId: `<msg-${gesendeteMails.length}@sideline.example.org>` };
        },
      }),
    });

    const pluginHost = new PluginBackendHost(db, s3Broker);
    const videoPlugin: SidelineBackendPlugin = {
      manifest: VIDEO_S3_MANIFEST,
      async handleRequest(req, ctx) {
        if (req.method === 'POST' && req.path === '/upload-link') {
          assert.ok(ctx.s3, 'ctx.s3 muss bei s3:team-rw gesetzt sein');
          const signiert = await ctx.s3.getSignedUploadUrl({
            objectPath: 'games/week-1.mp4',
            contentType: 'video/mp4',
          });
          return { status: 200, body: signiert };
        }
        return { status: 404, body: { fehler: 'Unbekannt' } };
      },
    };
    const playbookPlugin: SidelineBackendPlugin = {
      manifest: PLAYBOOK_OHNE_S3_MANIFEST,
      async handleRequest(_req, ctx) {
        return { status: 200, body: { hatS3: Boolean(ctx.s3) } };
      },
    };
    await pluginHost.registriereBackendPlugin(videoPlugin);
    await pluginHost.registriereBackendPlugin(playbookPlugin);

    // Playbook zusätzlich für Seniors aktivieren
    await repo.setzeTeamModulAktiv('team-stallions-seniors', 'playbook', true);

    const { app } = erstelleCoreApp({ db, config, pluginHost, s3Broker, smtpService });
    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });
    const addr = server.address();
    assert.ok(addr && typeof addr === 'object');
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
  });

  it('verschlüsselt und entschlüsselt S3/SMTP-Secrets mit AES-256-GCM sauber', () => {
    const secret = 'mein-langes-session-secret-1234567890';
    const chiffre = verschluesseleGeheimnis('geheimes-s3-token', secret);
    assert.ok(chiffre.startsWith('enc$v1$'));
    assert.equal(chiffre.includes('geheimes-s3-token'), false);
    assert.equal(entschluesseleGeheimnis(chiffre, secret), 'geheimes-s3-token');
    assert.equal(entschluesseleGeheimnis(chiffre, 'falscher-schluessel'), '');
  });

  it('erzwingt strikte S3-Präfix-Isolation und blockiert Path-Traversal', () => {
    const ok = normalisiereUndPruefeS3Key({
      teamId: 'team-stallions-seniors',
      pluginId: 'video-analysis',
      s3Prefix: 'plugins/video-analysis/',
      objectPath: '/games/week1/cut.mp4',
    });
    assert.equal(
      ok.key,
      'teams/team-stallions-seniors/plugins/video-analysis/games/week1/cut.mp4'
    );

    assert.throws(() =>
      normalisiereUndPruefeS3Key({
        teamId: 'team-stallions-seniors',
        pluginId: 'video-analysis',
        s3Prefix: 'plugins/video-analysis/',
        objectPath: '../../team-stallions-u19/secret.mp4',
      })
    );

    assert.throws(() =>
      normalisiereUndPruefeS3Key({
        teamId: 'team-stallions-seniors',
        pluginId: 'video-analysis',
        s3Prefix: 'plugins/video-analysis/',
        objectPath: 'games\\win.mp4',
      })
    );

    assert.equal(validiereS3EndpointUrl('http://localhost:9000').ok, true);
    assert.equal(validiereS3EndpointUrl('https://demoaccount.r2.cloudflarestorage.com').ok, true);
    assert.equal(validiereS3EndpointUrl('javascript:alert(1)').ok, false);

    const r2ClientKonfig = baueS3ClientKonfig({
      endpoint: 'https://demoaccount.r2.cloudflarestorage.com',
      region: 'auto',
      bucket: 'sidelineos-alpha',
      accessKey: 'r2-access',
      secretKey: 'r2-secret',
      forcePathStyle: true,
      cleanupRetentionDays: 14,
    });
    assert.equal(r2ClientKonfig.region, 'auto');
    assert.equal(r2ClientKonfig.requestChecksumCalculation, 'WHEN_REQUIRED');
    assert.equal(r2ClientKonfig.responseChecksumValidation, 'WHEN_REQUIRED');
    assert.equal(r2ClientKonfig.forcePathStyle, true);
  });

  it('persistiert S3-Settings verschlüsselt, maskiert Secrets und liefert Presigned URLs nur innerhalb des Team-/Plugin-Scopes', async () => {
    // Login als Sysadmin + Team Admin (m.brenner)
    const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: DEMO_STANDARD_PASSWORT }),
    });
    const adminCookie = extrahiereCookieHeader(adminLogin.headers.get('set-cookie'));

    // Login als Spieler (l.weber)
    const playerLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kennung: 'l.weber', passwort: DEMO_STANDARD_PASSWORT }),
    });
    const playerCookie = extrahiereCookieHeader(playerLogin.headers.get('set-cookie'));

    // Spieler darf keine Sysadmin-S3-Settings ändern
    const verbotenRes = await fetch(`${baseUrl}/api/v1/sysadmin/s3`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: playerCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        endpoint: 'http://minio:9000',
        region: 'eu-central-1',
        bucket: 'sideline-prod',
        accessKey: 'minioadmin',
        secretKey: 'super-secret',
        forcePathStyle: true,
      }),
    });
    assert.equal(verbotenRes.status, 403);

    // Sysadmin speichert S3-Konfiguration
    const saveRes = await fetch(`${baseUrl}/api/v1/sysadmin/s3`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        endpoint: 'http://minio:9000',
        region: 'eu-central-1',
        bucket: 'sideline-prod',
        accessKey: 'minioadmin',
        secretKey: 'top-secret-minio-key',
        forcePathStyle: true,
        cleanupRetentionDays: 21,
      }),
    });
    assert.equal(saveRes.status, 200);
    const saveJson = (await saveRes.json()) as { s3Config: Record<string, unknown> };
    assert.equal(saveJson.s3Config.bucket, 'sideline-prod');
    assert.equal(saveJson.s3Config.hatSecretKey, true);
    assert.equal(saveJson.s3Config.konfiguriert, true);
    assert.equal(saveJson.s3Config.cleanupRetentionDays, 21);
    assert.equal('secretKey' in saveJson.s3Config, false);

    // DB enthält Secret ausschließlich verschlüsselt
    const dbRow = await db.query<{ value_json: { secretKeyEncrypted: string } }>(
      `SELECT value_json FROM core.system_settings WHERE key = 's3'`
    );
    const storedSecret = dbRow.rows[0].value_json.secretKeyEncrypted;
    assert.ok(storedSecret.startsWith('enc$v1$'));
    assert.equal(storedSecret.includes('top-secret-minio-key'), false);

    // Speichern ohne neues secretKey behält gespeicherten Secret Key
    const saveWithoutSecret = await fetch(`${baseUrl}/api/v1/sysadmin/s3`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        endpoint: 'http://minio:9000',
        region: 'eu-central-1',
        bucket: 'sideline-prod-v2',
        accessKey: 'minioadmin',
        forcePathStyle: true,
      }),
    });
    assert.equal(saveWithoutSecret.status, 200);
    const saveWithoutJson = (await saveWithoutSecret.json()) as {
      s3Config: { bucket: string; hatSecretKey: boolean; konfiguriert: boolean };
    };
    assert.equal(saveWithoutJson.s3Config.bucket, 'sideline-prod-v2');
    assert.equal(saveWithoutJson.s3Config.hatSecretKey, true);
    assert.equal(saveWithoutJson.s3Config.konfiguriert, true);

    // S3-Verbindungstest
    s3Kommandos = [];
    const testRes = await fetch(`${baseUrl}/api/v1/sysadmin/s3/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({}),
    });
    assert.equal(testRes.status, 200);
    const testJson = (await testRes.json()) as { ok: boolean; nachricht: string };
    assert.equal(testJson.ok, true);
    assert.equal(s3Kommandos[0].name, 'HeadBucketCommand');

    // Plugin-Gateway: Coach/Admin erhält Upload-URL, Spieler nicht
    const playerUploadRes = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-seniors/_s3/presign-upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: playerCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ objectPath: 'games/test.mp4' }),
      }
    );
    assert.equal(playerUploadRes.status, 403);

    const playerDownloadRes = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-seniors/_s3/presign-download`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: playerCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ objectPath: 'games/test.mp4' }),
      }
    );
    assert.equal(playerDownloadRes.status, 200);
    const dlJson = (await playerDownloadRes.json()) as { url: string; key: string };
    assert.equal(dlJson.key, 'teams/team-stallions-seniors/plugins/video-analysis/games/test.mp4');

    // Traversal-Angriff im Gateway wird geblockt
    const traversalRes = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-seniors/_s3/presign-upload`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ objectPath: '../../team-stallions-u19/hack.mp4' }),
      }
    );
    assert.equal(traversalRes.status, 400);

    // Backend-Plugin erhält ctx.s3 nur bei Permission s3:team-rw
    const videoCtxRes = await fetch(
      `${baseUrl}/api/v1/plugins/video-analysis/teams/team-stallions-seniors/upload-link`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({}),
      }
    );
    assert.equal(videoCtxRes.status, 200);
    const videoCtxJson = (await videoCtxRes.json()) as { key: string };
    assert.equal(
      videoCtxJson.key,
      'teams/team-stallions-seniors/plugins/video-analysis/games/week-1.mp4'
    );

    const playbookNoS3Res = await fetch(
      `${baseUrl}/api/v1/plugins/playbook/teams/team-stallions-seniors/_s3/presign-download`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ objectPath: 'plays/cover2.json' }),
      }
    );
    assert.equal(playbookNoS3Res.status, 403);
  });

  it('sendet Einladungs-Mails via SMTP und fällt offline/bei Fehler sauber auf Link-Fallback zurück', async () => {
    const adminLogin = await fetch(`${baseUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kennung: 'm.brenner', passwort: DEMO_STANDARD_PASSWORT }),
    });
    const adminCookie = extrahiereCookieHeader(adminLogin.headers.get('set-cookie'));

    // 1. Ohne konfigurierten SMTP -> Einladung trotzdem 201 mit OFFLINE_FALLBACK
    const invOfflineRes = await fetch(
      `${baseUrl}/api/v1/teams/team-stallions-seniors/invitations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          typ: 'EMAIL',
          zielEmail: 'offline-player@verein.de',
          rolle: 'PLAYER',
          units: ['OFFENSE'],
        }),
      }
    );
    assert.equal(invOfflineRes.status, 201);
    const invOfflineJson = (await invOfflineRes.json()) as {
      mailStatus: { gesendet: boolean; modus: string };
    };
    assert.equal(invOfflineJson.mailStatus.gesendet, false);
    assert.equal(invOfflineJson.mailStatus.modus, 'OFFLINE_FALLBACK');

    // 2. Sysadmin konfiguriert SMTP
    const saveSmtpRes = await fetch(`${baseUrl}/api/v1/sysadmin/smtp`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        host: 'mail.verein.de',
        port: 587,
        absender: 'SidelineOS <noreply@verein.de>',
        benutzer: 'noreply@verein.de',
        passwort: 'smtp-secret-password',
        tlsAktiv: true,
      }),
    });
    assert.equal(saveSmtpRes.status, 200);
    const saveSmtpJson = (await saveSmtpRes.json()) as { smtpConfig: Record<string, unknown> };
    assert.equal(saveSmtpJson.smtpConfig.hatPasswort, true);
    assert.equal(saveSmtpJson.smtpConfig.konfiguriert, true);
    assert.equal('passwort' in saveSmtpJson.smtpConfig, false);

    // 3. SMTP-Verbindungstest mit Test-Empfänger
    gesendeteMails = [];
    const testSmtpRes = await fetch(`${baseUrl}/api/v1/sysadmin/smtp/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ testEmpfaenger: 'coach-check@verein.de' }),
    });
    assert.equal(testSmtpRes.status, 200);
    const testSmtpJson = (await testSmtpRes.json()) as { ok: boolean };
    assert.equal(testSmtpJson.ok, true);
    assert.equal(gesendeteMails.length, 1);
    assert.equal(gesendeteMails[0].to, 'coach-check@verein.de');

    // 4. Einladung wird per SMTP zugestellt
    const invOnlineRes = await fetch(
      `${baseUrl}/api/v1/teams/team-stallions-seniors/invitations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          typ: 'EMAIL',
          zielEmail: 'online-player@verein.de',
          rolle: 'COACH',
          units: ['DEFENSE'],
        }),
      }
    );
    assert.equal(invOnlineRes.status, 201);
    const invOnlineJson = (await invOnlineRes.json()) as {
      invitation: { pfad: string };
      mailStatus: { gesendet: boolean; modus: string };
    };
    assert.equal(invOnlineJson.mailStatus.gesendet, true);
    assert.equal(invOnlineJson.mailStatus.modus, 'SMTP');
    assert.equal(gesendeteMails.length, 2);
    assert.ok(gesendeteMails[1].text.includes(`https://sideline.example.org${invOnlineJson.invitation.pfad}`));

    // 5. Bei nicht erreichbarem SMTP bleibt Einladung dennoch nutzbar
    smtpSollFehlschlagen = true;
    const invAusfallRes = await fetch(
      `${baseUrl}/api/v1/teams/team-stallions-seniors/invitations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          typ: 'EMAIL',
          zielEmail: 'fallback-player@verein.de',
          rolle: 'PLAYER',
          units: ['SPECIAL_TEAMS'],
        }),
      }
    );
    assert.equal(invAusfallRes.status, 201);
    const invAusfallJson = (await invAusfallRes.json()) as {
      mailStatus: { gesendet: boolean; modus: string };
    };
    assert.equal(invAusfallJson.mailStatus.gesendet, false);
    assert.equal(invAusfallJson.mailStatus.modus, 'OFFLINE_FALLBACK');
    smtpSollFehlschlagen = false;
  });
});

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { DEMO_STANDARD_PASSWORT } from '../../src/core/authService.ts';
import type { PluginManifest } from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import type { CoreRepository } from '../../src/server/db/coreRepository.ts';
import { erzeugeTarGzBuffer } from '../../src/server/services/pluginInstaller.ts';
import { S3BrokerService, validiereUploadMetadaten } from '../../src/server/services/s3Broker.ts';
import { SmtpService } from '../../src/server/services/smtpService.ts';

function extrahiereCookieHeader(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie.split(';')[0] ?? '';
}

describe('Core Upload-/Multipart-Handling & erweiterbarer Notification-Endpunkt', () => {
  let tmpDataDir: string;
  let db: CoreDatabaseClient;
  let repo: CoreRepository;
  let coreServer: http.Server;
  let baseUrl: string;
  let sysadminCookie: string;
  let coachCookie: string;
  let playerCookie: string;

  const s3Aufrufe: Array<{ command: string; input: Record<string, unknown> }> = [];
  const smtpMails: Array<{ to: string; subject: string; text: string }> = [];
  let channelLogDatei: string;

  before(async () => {
    try {
      tmpDataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sidelineos-up-ntf-'));
      channelLogDatei = path.join(tmpDataDir, 'channel-events.json');
      await fs.writeFile(channelLogDatei, '[]', 'utf8');

      const config = loadCoreConfig({
        NODE_ENV: 'development',
        APP_URL: 'https://sideline.example.org',
        SESSION_SECRET: 'upload-notify-test-secret-mindestens-32-chars',
        CORE_VERSION: '0.1.0-alpha.1',
        PLUGIN_DATA_DIR: tmpDataDir,
        DISABLE_UPDATE_CHECK: 'true',
        S3_ENDPOINT: 'http://127.0.0.1:9000',
        S3_BUCKET: 'sidelineos-uploads',
        S3_ACCESS_KEY: 'test-access-key',
        S3_SECRET_KEY: 'test-secret-key-1234',
        S3_MAX_UPLOAD_BYTES: String(10 * 1024 * 1024), // 10 MiB Limit im Test
        SMTP_HOST: 'smtp.verein.local',
        SMTP_PORT: '587',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'secret-smtp-password',
        SMTP_FROM: 'SidelineOS <noreply@verein.local>',
      });

      db = await erstelleDatenbankClient(config);
      await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });
      const repoTemp = erstelleCoreApp({ db, config }).repo;
      repo = repoTemp;

      const s3Broker = new S3BrokerService(repo, config, {
        clientFactory: () => ({
          async send(command: unknown) {
            const cmd = command as { constructor: { name: string }; input: Record<string, unknown> };
            s3Aufrufe.push({ command: cmd.constructor.name, input: cmd.input });
            if (cmd.constructor.name === 'CreateMultipartUploadCommand') {
              return { UploadId: 'mp-upload-123' };
            }
            if (cmd.constructor.name === 'CompleteMultipartUploadCommand') {
              return {
                ETag: '"final-etag-999"',
                Location: `https://s3.local/${String(cmd.input.Bucket)}/${String(cmd.input.Key)}`,
              };
            }
            return { $metadata: { httpStatusCode: 200 } };
          },
        }),
        presigner: async (_client, command) => {
          const cmd = command as unknown as {
            constructor: { name: string };
            input: { Key?: string; PartNumber?: number; UploadId?: string };
          };
          const partSuffix = cmd.input.PartNumber ? `&part=${cmd.input.PartNumber}` : '';
          return `https://s3.signed.local/${encodeURIComponent(cmd.input.Key ?? '')}?op=${cmd.constructor.name}${partSuffix}`;
        },
      });

      const smtpService = new SmtpService(repo, config, {
        transportFactory: () => ({
          async verify() {
            return true;
          },
          async sendMail(mail) {
            smtpMails.push(mail);
            return { messageId: `msg-${smtpMails.length}` };
          },
        }),
      });

      const created = erstelleCoreApp({ db, config, s3Broker, smtpService });
      coreServer = http.createServer(created.app);
      await new Promise<void>((resolve) => {
        coreServer.listen(0, '127.0.0.1', () => resolve());
      });
      const addr = coreServer.address();
      assert.ok(addr && typeof addr === 'object');
      baseUrl = `http://127.0.0.1:${addr.port}`;

      const login = async (kennung: string) => {
        const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify({ kennung, passwort: DEMO_STANDARD_PASSWORT }),
        });
        assert.equal(res.status, 200);
        return extrahiereCookieHeader(res.headers.get('set-cookie'));
      };

      sysadminCookie = await login('sysadmin');
      coachCookie = await login('t.richter');
      playerCookie = await login('l.weber');
    } catch (err) {
      if (coreServer) await new Promise<void>((resolve) => coreServer.close(() => resolve()));
      if (db) await db.close();
      if (tmpDataDir) await fs.rm(tmpDataDir, { recursive: true, force: true }).catch(() => undefined);
      throw err;
    }
  });

  after(async () => {
    if (coreServer) await new Promise<void>((resolve) => coreServer.close(() => resolve()));
    if (db) await db.close();
    if (tmpDataDir) await fs.rm(tmpDataDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('validiert MIME-Types und Upload-Größenlimits sauber', () => {
    assert.deepEqual(
      validiereUploadMetadaten({
        contentType: 'video/mp4',
        fileSizeBytes: 1024,
        maxUploadBytes: 4096,
      }),
      { contentType: 'video/mp4' }
    );

    assert.throws(
      () =>
        validiereUploadMetadaten({
          contentType: 'not-a-mime-type',
          maxUploadBytes: 4096,
        }),
      /Content-Type/
    );
    assert.throws(
      () =>
        validiereUploadMetadaten({
          fileSizeBytes: 0,
          maxUploadBytes: 4096,
        }),
      /Dateigröße/
    );
    assert.throws(
      () =>
        validiereUploadMetadaten({
          fileSizeBytes: 5000,
          maxUploadBytes: 4096,
        }),
      /Upload-Limit/
    );
  });

  it('unterstützt S3-Multipart-Uploads inkl. Größenlimit, Team-Isolation und Abbruch über das Plugin-Gateway', async () => {
    const manifest: PluginManifest = {
      id: 'video-upload-test',
      name: 'Video Upload Test',
      kurzbeschreibung: 'Test',
      version: '0.1.0',
      sdkVersion: '1.0',
      autor: 'Test',
      repositoryUrl: 'https://github.com/sidelineos/video-upload-test',
      icon: 'film',
      status: 'AKTIV',
      standardAktiviert: false,
      permissions: ['team:read', 's3:team-rw'],
      dbPrefix: 'mod_video_upload_test_',
      s3Prefix: 'plugins/video-upload-test/',
      settingsAnker: {},
    };
    const tarGz = erzeugeTarGzBuffer({
      'plugin.manifest.json': JSON.stringify(manifest),
      'dist/server.js': `
        export default {
          manifest: ${JSON.stringify(manifest)},
          async handleRequest(_req, ctx) {
            const mp = await ctx.s3.initiateMultipartUpload({
              objectPath: 'reels/sdk-game.mp4',
              contentType: 'video/mp4',
              fileSizeBytes: 2048,
            });
            return { status: 200, body: mp };
          }
        };
      `,
    });

    const installRes = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ contentBase64: tarGz.toString('base64') }),
    });
    assert.equal(installRes.status, 200);

    await fetch(
      `${baseUrl}/api/v1/sysadmin/teams/team-stallions-seniors/plugins/video-upload-test`,
      {
        method: 'PATCH',
        headers: {
          Cookie: sysadminCookie,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ enabled: true }),
      }
    );

    const gwBase = `${baseUrl}/api/v1/plugins/video-upload-test/teams/team-stallions-seniors`;

    // 1. Spieler darf keinen Upload starten (403)
    const playerInit = await fetch(`${gwBase}/_s3/multipart/init`, {
      method: 'POST',
      headers: {
        Cookie: playerCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ objectPath: 'reels/game.mp4' }),
    });
    assert.equal(playerInit.status, 403);

    // 2. Datei größer als S3_MAX_UPLOAD_BYTES (10 MiB) ablehnen
    const tooBig = await fetch(`${gwBase}/_s3/multipart/init`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        objectPath: 'reels/huge.mp4',
        contentType: 'video/mp4',
        fileSizeBytes: 20 * 1024 * 1024,
      }),
    });
    assert.equal(tooBig.status, 400);

    // 3. Path Traversal ablehnen
    const traversal = await fetch(`${gwBase}/_s3/multipart/init`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ objectPath: '../../other-team/secret.mp4' }),
    });
    assert.equal(traversal.status, 400);

    // 4. Vollständiger Multipart-Durchlauf (init -> sign-part -> complete)
    const initRes = await fetch(`${gwBase}/_s3/multipart/init`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        objectPath: 'reels/week1.mp4',
        contentType: 'video/mp4',
        fileSizeBytes: 5 * 1024 * 1024,
      }),
    });
    assert.equal(initRes.status, 200);
    const initJson = (await initRes.json()) as {
      uploadId: string;
      key: string;
      maxFileSizeBytes: number;
    };
    assert.equal(initJson.uploadId, 'mp-upload-123');
    assert.equal(
      initJson.key,
      'teams/team-stallions-seniors/plugins/video-upload-test/reels/week1.mp4'
    );
    assert.equal(initJson.maxFileSizeBytes, 10 * 1024 * 1024);

    const badPart = await fetch(`${gwBase}/_s3/multipart/sign-part`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        objectPath: 'reels/week1.mp4',
        uploadId: initJson.uploadId,
        partNumber: 0,
      }),
    });
    assert.equal(badPart.status, 400);

    const partRes = await fetch(`${gwBase}/_s3/multipart/sign-part`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        objectPath: 'reels/week1.mp4',
        uploadId: initJson.uploadId,
        partNumber: 1,
      }),
    });
    assert.equal(partRes.status, 200);
    const partJson = (await partRes.json()) as { url: string; partNumber: number };
    assert.equal(partJson.partNumber, 1);
    assert.match(partJson.url, /UploadPartCommand&part=1/);

    const completeRes = await fetch(`${gwBase}/_s3/multipart/complete`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        objectPath: 'reels/week1.mp4',
        uploadId: initJson.uploadId,
        parts: [
          { partNumber: 2, etag: '"etag-2"' },
          { partNumber: 1, etag: '"etag-1"' },
        ],
      }),
    });
    assert.equal(completeRes.status, 200);
    const completeJson = (await completeRes.json()) as { key: string; etag: string };
    assert.equal(completeJson.etag, '"final-etag-999"');

    // Sicherstellen, dass Parts aufsteigend sortiert an S3 gingen
    const completeCall = s3Aufrufe.find((c) => c.command === 'CompleteMultipartUploadCommand');
    assert.ok(completeCall);
    const mpPayload = completeCall.input.MultipartUpload as {
      Parts: Array<{ PartNumber: number; ETag: string }>;
    };
    assert.deepEqual(mpPayload.Parts, [
      { PartNumber: 1, ETag: '"etag-1"' },
      { PartNumber: 2, ETag: '"etag-2"' },
    ]);

    // 5. Abbruch & SDK-Scope-Aufruf prüfen
    const abortRes = await fetch(`${gwBase}/_s3/multipart/abort`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ objectPath: 'reels/week1.mp4', uploadId: initJson.uploadId }),
    });
    assert.equal(abortRes.status, 200);

    const sdkRes = await fetch(`${gwBase}/sdk-test`, {
      method: 'POST',
      headers: { Cookie: coachCookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(sdkRes.status, 200);
    const sdkJson = (await sdkRes.json()) as { key: string };
    assert.match(sdkJson.key, /reels\/sdk-game\.mp4$/);
  });

  it('stellt Core-Notification-Endpunkt bereit und delegiert dynamisch an nachgelieferte Channel-Plugins', async () => {
    // 1. Sender-Plugin ohne notifications:send -> 403 prüfen
    const senderOhneRechtManifest: PluginManifest = {
      id: 'no-notify',
      name: 'No Notify',
      kurzbeschreibung: 'Test',
      version: '0.1.0',
      sdkVersion: '1.0',
      autor: 'Test',
      repositoryUrl: 'https://github.com/sidelineos/no-notify',
      icon: 'puzzle',
      status: 'AKTIV',
      standardAktiviert: false,
      permissions: ['team:read'],
      dbPrefix: 'mod_no_notify_',
      settingsAnker: {},
    };
    await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        contentBase64: erzeugeTarGzBuffer({
          'plugin.manifest.json': JSON.stringify(senderOhneRechtManifest),
          'dist/server.js': `export default { manifest: ${JSON.stringify(senderOhneRechtManifest)}, async handleRequest() { return { status: 200, body: {} }; } };`,
        }).toString('base64'),
      }),
    });
    await fetch(`${baseUrl}/api/v1/sysadmin/teams/team-stallions-seniors/plugins/no-notify`, {
      method: 'PATCH',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ enabled: true }),
    });

    const deniedSend = await fetch(
      `${baseUrl}/api/v1/plugins/no-notify/teams/team-stallions-seniors/_notifications/send`,
      {
        method: 'POST',
        headers: {
          Cookie: coachCookie,
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({ eventType: 'test', title: 'Hi', message: 'Denied' }),
      }
    );
    assert.equal(deniedSend.status, 403);

    // 2. Dynamisches Channel-Plugin (z. B. Discord/Webhook + ein fehlerhafter Kanal zur Isolationsprüfung) installieren
    const discordManifest: PluginManifest = {
      id: 'discord-notifier',
      name: 'Discord Notifier',
      kurzbeschreibung: 'Liefert Benachrichtigungsweg Discord-Webhook nach',
      version: '0.1.0',
      sdkVersion: '1.0',
      autor: 'Test',
      repositoryUrl: 'https://github.com/sidelineos/discord-notifier',
      icon: 'puzzle',
      status: 'AKTIV',
      standardAktiviert: false,
      permissions: ['notifications:channel'],
      dbPrefix: 'mod_discord_notifier_',
      settingsAnker: {},
    };
    const discordTar = erzeugeTarGzBuffer({
      'plugin.manifest.json': JSON.stringify(discordManifest),
      'dist/server.js': `
        import fs from 'node:fs/promises';
        const logDatei = ${JSON.stringify(channelLogDatei)};
        export default {
          manifest: ${JSON.stringify(discordManifest)},
          notificationChannels: [
            { id: 'discord-webhook', label: 'Discord Webhook' },
            { id: 'broken-push', label: 'Fehlerhafter Testkanal' }
          ],
          async deliverNotification(event, ctx) {
            if (ctx.channelId === 'broken-push') {
              throw new Error('Simulierter Webhook-Timeout');
            }
            const bestehend = JSON.parse(await fs.readFile(logDatei, 'utf8'));
            bestehend.push({ channelId: ctx.channelId, title: event.title, source: event.sourcePluginId, count: event.recipients.length });
            await fs.writeFile(logDatei, JSON.stringify(bestehend), 'utf8');
            return { delivered: event.recipients.length };
          }
        };
      `,
    });

    const discordInstall = await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ contentBase64: discordTar.toString('base64') }),
    });
    assert.equal(discordInstall.status, 200);

    await fetch(`${baseUrl}/api/v1/sysadmin/teams/team-stallions-seniors/plugins/discord-notifier`, {
      method: 'PATCH',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ enabled: true }),
    });

    // 3. Sender-Plugin mit `notifications:send` installieren
    const alertsManifest: PluginManifest = {
      id: 'game-alerts',
      name: 'Game Alerts',
      kurzbeschreibung: 'Sendet Spielbenachrichtigungen',
      version: '0.1.0',
      sdkVersion: '1.0',
      autor: 'Test',
      repositoryUrl: 'https://github.com/sidelineos/game-alerts',
      icon: 'puzzle',
      status: 'AKTIV',
      standardAktiviert: false,
      permissions: ['team:read', 'notifications:send'],
      dbPrefix: 'mod_game_alerts_',
      settingsAnker: {},
    };
    const alertsTar = erzeugeTarGzBuffer({
      'plugin.manifest.json': JSON.stringify(alertsManifest),
      'dist/server.js': `
        export default {
          manifest: ${JSON.stringify(alertsManifest)},
          async handleRequest(req, ctx) {
            if (req.path === '/notify') {
              const ergebnis = await ctx.notifications.send({
                eventType: 'film.uploaded',
                title: 'Neues Game Tape',
                message: 'Week 3 Film steht bereit.',
                linkPath: '/share/abc',
                channels: ['in-app', 'smtp', 'discord-webhook', 'broken-push'],
              });
              return { status: 200, body: ergebnis };
            }
            return { status: 404, body: {} };
          }
        };
      `,
    });
    await fetch(`${baseUrl}/api/v1/sysadmin/plugins/install-upload`, {
      method: 'POST',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ contentBase64: alertsTar.toString('base64') }),
    });
    await fetch(`${baseUrl}/api/v1/sysadmin/teams/team-stallions-seniors/plugins/game-alerts`, {
      method: 'PATCH',
      headers: {
        Cookie: sysadminCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({ enabled: true }),
    });

    // 4. Verfügbare Kanäle prüfen (Core + dynamisch geladenes Plugin)
    const chRes = await fetch(
      `${baseUrl}/api/v1/notifications/channels?teamId=team-stallions-seniors`,
      { headers: { Cookie: coachCookie } }
    );
    assert.equal(chRes.status, 200);
    const chJson = (await chRes.json()) as {
      channels: Array<{ id: string; providerPluginId: string; aktiv: boolean }>;
    };
    assert.ok(chJson.channels.some((c) => c.id === 'in-app' && c.providerPluginId === 'core'));
    assert.ok(chJson.channels.some((c) => c.id === 'smtp' && c.aktiv));
    assert.ok(
      chJson.channels.some(
        (c) => c.id === 'discord-webhook' && c.providerPluginId === 'discord-notifier' && c.aktiv
      )
    );

    // 5. Plugin löst Notification über ctx.notifications.send aus (inkl. Fehlerisolation für broken-push)
    smtpMails.length = 0;
    const sendRes = await fetch(
      `${baseUrl}/api/v1/plugins/game-alerts/teams/team-stallions-seniors/notify`,
      {
        method: 'POST',
        headers: { Cookie: coachCookie, 'X-Requested-With': 'XMLHttpRequest' },
      }
    );
    assert.equal(sendRes.status, 200);
    const sendJson = (await sendRes.json()) as {
      recipientCount: number;
      notificationIds: string[];
      channelResults: Array<{ channelId: string; status: string; delivered: number; error?: string }>;
    };
    assert.ok(sendJson.recipientCount >= 2);
    assert.equal(sendJson.notificationIds.length, sendJson.recipientCount);

    const inAppRes = sendJson.channelResults.find((r) => r.channelId === 'in-app');
    const smtpRes = sendJson.channelResults.find((r) => r.channelId === 'smtp');
    const discordRes = sendJson.channelResults.find((r) => r.channelId === 'discord-webhook');
    const brokenRes = sendJson.channelResults.find((r) => r.channelId === 'broken-push');
    assert.equal(inAppRes?.status, 'sent');
    assert.equal(smtpRes?.status, 'sent');
    assert.equal(smtpMails.length, sendJson.recipientCount);
    assert.equal(discordRes?.status, 'sent');
    assert.equal(brokenRes?.status, 'failed');
    assert.match(brokenRes?.error ?? '', /Webhook-Timeout/);

    const channelLogs = JSON.parse(await fs.readFile(channelLogDatei, 'utf8')) as Array<{
      channelId: string;
      title: string;
      source: string;
    }>;
    assert.equal(channelLogs.length, 1);
    assert.equal(channelLogs[0]?.source, 'game-alerts');

    // 6. Spieler liest und markiert eigene In-App-Benachrichtigungen als gelesen
    const inboxRes = await fetch(`${baseUrl}/api/v1/notifications`, {
      headers: { Cookie: playerCookie },
    });
    assert.equal(inboxRes.status, 200);
    const inbox = (await inboxRes.json()) as {
      unreadCount: number;
      notifications: Array<{ id: string; title: string; readAt: string | null }>;
    };
    assert.ok(inbox.unreadCount >= 1);
    const erste = inbox.notifications[0];
    assert.equal(erste?.title, 'Neues Game Tape');

    const readOne = await fetch(`${baseUrl}/api/v1/notifications/${erste!.id}/read`, {
      method: 'PATCH',
      headers: { Cookie: playerCookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(readOne.status, 200);

    // 7. Direkter Core-Dispatch-Endpunkt: Spieler darf nicht (403), unsafe linkPath (400), Coach darf (200)
    const playerDispatch = await fetch(`${baseUrl}/api/v1/notifications/dispatch`, {
      method: 'POST',
      headers: {
        Cookie: playerCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        teamId: 'team-stallions-seniors',
        title: 'Test',
        message: 'Forbidden',
      }),
    });
    assert.equal(playerDispatch.status, 403);

    const badLink = await fetch(`${baseUrl}/api/v1/notifications/dispatch`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        teamId: 'team-stallions-seniors',
        title: 'Test',
        message: 'Bad Link',
        linkPath: '//evil.example.org/phish',
      }),
    });
    assert.equal(badLink.status, 400);

    const coachDispatch = await fetch(`${baseUrl}/api/v1/notifications/dispatch`, {
      method: 'POST',
      headers: {
        Cookie: coachCookie,
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: JSON.stringify({
        teamId: 'team-stallions-seniors',
        eventType: 'practice.updated',
        title: 'Training verschoben',
        message: 'Heute 19:00 Uhr auf Kunstrasen.',
        channels: ['in-app', 'discord-webhook'],
      }),
    });
    assert.equal(coachDispatch.status, 200);

    const readAllRes = await fetch(`${baseUrl}/api/v1/notifications/read-all`, {
      method: 'POST',
      headers: { Cookie: playerCookie, 'X-Requested-With': 'XMLHttpRequest' },
    });
    assert.equal(readAllRes.status, 200);

    const inboxAfter = (await (
      await fetch(`${baseUrl}/api/v1/notifications`, { headers: { Cookie: playerCookie } })
    ).json()) as { unreadCount: number };
    assert.equal(inboxAfter.unreadCount, 0);
  });
});

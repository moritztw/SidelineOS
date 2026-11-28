import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import {
  SIDELINE_SDK_VERSION,
  definiereBackendPlugin,
  type PluginManifest,
  type StorageProviderAdapter,
} from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import {
  StoragePolicyError,
  normalisiereUndPruefeStorageKey,
} from '../../src/server/gateway/storageBroker.ts';
import { hashPasswort } from '../../src/server/security.ts';

function erstelleMockStorageAdapter(aufrufe: Array<{ op: string; nodeId: string; key: string }>): StorageProviderAdapter {
  return {
    providerId: 'mock-s3',
    label: 'Mock S3 Multi-Node',
    async presignUpload({ nodeId, key, expiresInSeconds }) {
      aufrufe.push({ op: 'upload', nodeId, key });
      return { url: `https://${nodeId}.example.test/${key}`, key, expiresIn: expiresInSeconds };
    },
    async presignDownload({ nodeId, key, expiresInSeconds }) {
      aufrufe.push({ op: 'download', nodeId, key });
      return { url: `https://${nodeId}.example.test/${key}?dl=1`, key, expiresIn: expiresInSeconds };
    },
    async initiateMultipartUpload({ nodeId, key }) {
      aufrufe.push({ op: 'multipart-init', nodeId, key });
      return { uploadId: 'mp-1', key };
    },
    async presignMultipartPart({ nodeId, key, partNumber, expiresInSeconds }) {
      aufrufe.push({ op: 'multipart-part', nodeId, key });
      return { url: `https://${nodeId}.example.test/${key}?p=${partNumber}`, key, partNumber, expiresIn: expiresInSeconds };
    },
    async completeMultipartUpload({ nodeId, key }) {
      aufrufe.push({ op: 'multipart-complete', nodeId, key });
      return { key, etag: '"etag-1"' };
    },
    async abortMultipartUpload({ nodeId, key }) {
      aufrufe.push({ op: 'multipart-abort', nodeId, key });
    },
    async deleteObject({ nodeId, key }) {
      aufrufe.push({ op: 'delete', nodeId, key });
    },
  };
}

describe('Abstrakter StorageBroker (#21, #22, #24), Archiv-ReadOnly (#25) & Capability-Gating', () => {
  let db: CoreDatabaseClient;
  let baseUrl: string;
  let closeServer: () => Promise<void>;
  let appBundle: ReturnType<typeof erstelleCoreApp>;
  const providerAufrufe: Array<{ op: string; nodeId: string; key: string }> = [];

  before(async () => {
    const config = loadCoreConfig({
      DATABASE_URL: '',
      PGLITE_DATA_DIR: '',
      SESSION_SECRET: 'storage-test-secret-mindestens-32-zeichen-lang',
    });
    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config);
    appBundle = erstelleCoreApp({ db, config });

    const server = http.createServer(appBundle.app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Server-Adresse fehlt.');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () =>
      new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  after(async () => {
    await closeServer();
    await db.close();
  });

  it('blockiert Path-Traversal und isoliert Plugin-Präfixe strikt', () => {
    const ok = normalisiereUndPruefeStorageKey({
      clubId: 'club-1',
      teamId: 'team-1',
      pluginId: 'video',
      storagePrefix: 'video',
      objectPath: 'clips/spiel-1.mp4',
    });
    assert.equal(ok.key, 'clubs/club-1/teams/team-1/video/clips/spiel-1.mp4');

    assert.throws(
      () =>
        normalisiereUndPruefeStorageKey({
          clubId: 'club-1',
          teamId: 'team-1',
          pluginId: 'video',
          objectPath: '../anderes-team/geheim.mp4',
        }),
      (err: unknown) => err instanceof StoragePolicyError && err.code === 'INVALID_STORAGE_INPUT'
    );
  });

  it('registriert storage:provider nur bei expliziter Freigabe und routet über nodeId (#22)', async () => {
    const storageManifest: PluginManifest = {
      id: 'storage-s3',
      name: 'S3 Provider',
      kurzbeschreibung: 'Test Storage Provider',
      version: '1.0.0',
      sdkVersion: SIDELINE_SDK_VERSION,
      minCoreVersion: '0.2.0',
      icon: 'hard-drive',
      permissions: ['storage:provider', 'core:storage-quota-manage', 'core:storage-nodes-manage'],
      navigation: { surface: 'system', scopes: ['global'] },
    };

    const storagePlugin = definiereBackendPlugin({
      manifest: storageManifest,
      storageProvider: erstelleMockStorageAdapter(providerAufrufe),
    });

    // Ohne Freigabe darf der Provider NICHT aktiv werden
    await appBundle.pluginHost.registriereBackendPlugin(storagePlugin, []);
    assert.equal(appBundle.storageBroker.holeProviderInfo().konfiguriert, false);

    // Mit expliziter Freigabe wird der Provider registriert
    await appBundle.pluginHost.registriereBackendPlugin(storagePlugin, [
      'storage:provider',
      'core:storage-quota-manage',
      'core:storage-nodes-manage',
    ]);
    assert.equal(appBundle.storageBroker.holeProviderInfo().konfiguriert, true);

    const club = await appBundle.repo.erstelleClub({ slug: 'sc-garage', name: 'SC Garage' });
    await appBundle.repo.setzeClubStorageNode(club.id, 'garage-eu-west');
    const team = await appBundle.repo.erstelleTeam({ clubId: club.id, slug: 't1', name: 'Team 1' });
    const aktualisiert = (await appBundle.repo.findeClubNachId(club.id))!;

    const videoManifest: PluginManifest = {
      id: 'video',
      name: 'Video',
      kurzbeschreibung: 'Video',
      version: '2.0.0',
      sdkVersion: SIDELINE_SDK_VERSION,
      minCoreVersion: '0.2.0',
      icon: 'film',
      permissions: ['storage:team-rw'],
      storagePrefix: 'video',
      navigation: { surface: 'app', scopes: ['team'] },
    };

    const scope = appBundle.storageBroker.erstellePluginScope({
      club: aktualisiert,
      team,
      manifest: videoManifest,
    });

    const upload = await scope.getSignedUploadUrl({
      objectPath: 'spiel1.mp4',
      contentType: 'video/mp4',
      fileSizeBytes: 500,
    });
    assert.ok(upload.url.startsWith('https://garage-eu-west.example.test/'));
    assert.equal(providerAufrufe.at(-1)?.nodeId, 'garage-eu-west');
  });

  it('erzwingt 90 %-Soft-Limit & 100 %-Hard-Limit (413), lässt Downloads aber immer offen (#24)', async () => {
    const club = await appBundle.repo.erstelleClub({ slug: 'sc-quota', name: 'SC Quota' });
    const team = await appBundle.repo.erstelleTeam({ clubId: club.id, slug: 't-q', name: 'Team Q' });

    // 1000 Bytes Quota, 90 % Soft-Limit
    await appBundle.repo.setzeClubSpeicherQuota(club.id, { quotaBytes: 1000, softLimitPercent: 90 });

    const videoManifest: PluginManifest = {
      id: 'video',
      name: 'Video',
      kurzbeschreibung: 'Video',
      version: '2.0.0',
      sdkVersion: SIDELINE_SDK_VERSION,
      minCoreVersion: '0.2.0',
      icon: 'film',
      permissions: ['storage:team-rw'],
      storagePrefix: 'video',
      navigation: { surface: 'app', scopes: ['team'] },
    };

    const scope = appBundle.storageBroker.erstellePluginScope({
      club: (await appBundle.repo.findeClubNachId(club.id))!,
      team,
      manifest: videoManifest,
    });

    // 920 Bytes -> Soft-Limit erreicht (>= 90 %), Upload erfolgreich
    await scope.getSignedUploadUrl({ objectPath: 'a.mp4', fileSizeBytes: 920 });
    const nachUpload = (await appBundle.repo.findeClubNachId(club.id))!;
    assert.equal(nachUpload.speicher.softLimitErreicht, true);
    assert.equal(nachUpload.speicher.hardLimitErreicht, false);

    // Weitere 200 Bytes -> über 1000 Bytes -> HTTP 413 STORAGE_QUOTA_EXCEEDED
    await assert.rejects(
      () => scope.getSignedUploadUrl({ objectPath: 'b.mp4', fileSizeBytes: 200 }),
      (err: unknown) =>
        err instanceof StoragePolicyError &&
        err.status === 413 &&
        err.code === 'STORAGE_QUOTA_EXCEEDED'
    );

    // Download bleibt trotz Quota-Limit vollständig erreichbar!
    const dl = await scope.getSignedDownloadUrl({ objectPath: 'a.mp4' });
    assert.ok(dl.url.includes('a.mp4'));
  });

  it('blockiert schreibende Gateway-Requests auf archivierte Teams mit 409, erlaubt aber GET (#25)', async () => {
    const club = await appBundle.repo.erstelleClub({ slug: 'sc-gw', name: 'SC Gateway' });
    const team = await appBundle.repo.erstelleTeam({ clubId: club.id, slug: 'alt', name: 'Alt-Team' });
    const user = await appBundle.repo.erstelleBenutzer(
      { benutzername: 'gwuser', vollerName: 'GW User', email: 'gw@test.de' },
      hashPasswort('Geheim1234!')
    );
    await appBundle.repo.speichereClubMitgliedschaft({
      userUuid: user.uuid,
      clubId: club.id,
      rolle: 'CLUB_ADMIN',
    });
    await appBundle.repo.setzeTeamStatus(team.id, 'ARCHIVED');

    const testPlugin = definiereBackendPlugin({
      manifest: {
        id: 'notizen',
        name: 'Notizen',
        kurzbeschreibung: 'Test',
        version: '1.0.0',
        sdkVersion: SIDELINE_SDK_VERSION,
        minCoreVersion: '0.2.0',
        icon: 'layers',
        permissions: ['db:plugin-schema'],
        navigation: { surface: 'app', scopes: ['team'] },
      },
      async handleRequest(req, ctx) {
        return { status: 200, body: { method: req.method, isReadOnly: ctx.isReadOnly } };
      },
    });
    await appBundle.repo.speichereInstalliertesPlugin({
      manifest: testPlugin.manifest,
      enabledGlobally: true,
      approvedCapabilities: [],
    });
    await appBundle.repo.setzeScopeModulAktiv('team', team.id, 'notizen', true);
    await appBundle.pluginHost.registriereBackendPlugin(testPlugin, []);

    const loginRes = await fetch(`${baseUrl}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kennung: 'gwuser', passwort: 'Geheim1234!' }),
    }).then((r) => r.json());

    const getRes = await fetch(`${baseUrl}/api/v2/plugins/notizen/teams/${team.id}/items`, {
      headers: { Authorization: `Bearer ${loginRes.token}` },
    });
    assert.equal(getRes.status, 200);
    const getBody = await getRes.json();
    assert.equal(getBody.isReadOnly, true);

    const postRes = await fetch(`${baseUrl}/api/v2/plugins/notizen/teams/${team.id}/items`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${loginRes.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ titel: 'Verboten im Archiv' }),
    });
    assert.equal(postRes.status, 409);
    const postBody = await postRes.json();
    assert.equal(postBody.code, 'TEAM_ARCHIVED_READ_ONLY');
  });
});

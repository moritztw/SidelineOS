import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import zlib from 'node:zlib';
import { baueAppAnsichtPfad, parseBrowserPfad } from '../../src/core/navigation.ts';
import { SIDELINE_SDK_VERSION, definiereBackendPlugin } from '../../src/sdk/plugin.ts';
import { erstelleCoreApp } from '../../src/server/app.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';
import { loadCoreConfig } from '../../src/server/config.ts';
import { erstelleDatenbankClient, type CoreDatabaseClient } from '../../src/server/db/client.ts';
import {
  pruefeSichereArchivUrl,
  validierePluginManifestV2,
} from '../../src/server/runtime/archiveInstaller.ts';
import { hashPasswort } from '../../src/server/security.ts';

/** Erzeugt einen gültigen USTAR-`.tar.gz`-Buffer im Speicher für reproduzierbare Installer-Tests. */
function erstelleTarGz(dateien: Array<{ pfad: string; inhalt: string }>): Buffer {
  const bloecke: Buffer[] = [];
  for (const datei of dateien) {
    const daten = Buffer.from(datei.inhalt, 'utf8');
    const header = Buffer.alloc(512, 0);
    header.write(datei.pfad, 0, Math.min(100, Buffer.byteLength(datei.pfad)), 'utf8');
    header.write('0000644\0', 100, 8, 'ascii');
    header.write('0000000\0', 108, 8, 'ascii');
    header.write('0000000\0', 116, 8, 'ascii');
    header.write(`${daten.length.toString(8).padStart(11, '0')}\0`, 124, 12, 'ascii');
    header.write('00000000000\0', 136, 12, 'ascii');
    header.write('        ', 148, 8, 'ascii');
    header[156] = 48; // '0' normale Datei
    header.write('ustar\0', 257, 6, 'ascii');
    header.write('00', 263, 2, 'ascii');

    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');

    bloecke.push(header, daten);
    const rest = daten.length % 512;
    if (rest > 0) bloecke.push(Buffer.alloc(512 - rest, 0));
  }
  bloecke.push(Buffer.alloc(1024, 0));
  return zlib.gzipSync(Buffer.concat(bloecke));
}

describe('MinimalArchiveInstaller, Notification-Channels & 4-Ebenen-Navigation', () => {
  let db: CoreDatabaseClient;
  let tempDir: string;
  let appBundle: ReturnType<typeof erstelleCoreApp>;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sideline-v2-test-'));
    const config = loadCoreConfig({
      DATABASE_URL: '',
      PGLITE_DATA_DIR: '',
      PLUGIN_DATA_DIR: path.join(tempDir, 'plugins'),
      SESSION_SECRET: 'installer-test-secret-mindestens-32-zeichen',
    });
    db = await erstelleDatenbankClient(config);
    await bootstrapCoreInstance(db, config);
    appBundle = erstelleCoreApp({ db, config });
  });

  after(async () => {
    await db.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('lehnt SDK-v1.0-Manifeste, >3 Sidebar-Gruppen und unsichere URLs (SSRF) strikt ab', () => {
    assert.throws(() =>
      validierePluginManifestV2({
        id: 'alt-plugin',
        name: 'Alt',
        version: '1.0.0',
        sdkVersion: '1.0',
        permissions: [],
        navigation: { surface: 'app', scopes: ['team'] },
      })
    );

    assert.throws(() =>
      validierePluginManifestV2({
        id: 'zu-viele-gruppen',
        name: 'Ueberladen',
        version: '2.0.0',
        sdkVersion: SIDELINE_SDK_VERSION,
        permissions: [],
        navigation: {
          surface: 'app',
          scopes: ['team'],
          sidebarGroups: [
            { id: 'g1', label: '1', items: [] },
            { id: 'g2', label: '2', items: [] },
            { id: 'g3', label: '3', items: [] },
            { id: 'g4', label: '4', items: [] },
          ],
        },
      })
    );

    assert.throws(() => pruefeSichereArchivUrl('http://example.com/plugin.tar.gz'));
    assert.throws(() => pruefeSichereArchivUrl('https://127.0.0.1/plugin.tar.gz'));
    assert.throws(() => pruefeSichereArchivUrl('https://169.254.169.254/latest/meta-data'));
    assert.equal(
      pruefeSichereArchivUrl('https://github.com/moritztw/SidelineOS-org-admin/releases/latest/download/org-admin.tar.gz').hostname,
      'github.com'
    );
  });

  it('installiert ein gültiges SDK-v2.0-.tar.gz-Archiv und blockiert Path-Traversal-Einträge', async () => {
    const manifest = {
      id: 'demo-theme',
      name: 'Demo Theme',
      kurzbeschreibung: 'Headless Theme-Pack',
      version: '2.0.0',
      sdkVersion: SIDELINE_SDK_VERSION,
      minCoreVersion: '0.2.0',
      icon: 'layers',
      permissions: ['theme:presets'],
      navigation: { surface: 'headless', scopes: ['global'] },
    };

    const tarGz = erstelleTarGz([
      { pfad: 'demo-theme/plugin.json', inhalt: JSON.stringify(manifest) },
      { pfad: 'demo-theme/dist/client.js', inhalt: 'export default { manifest: { id: "demo-theme" } };' },
      { pfad: '../../ausbruch.txt', inhalt: 'darf nicht geschrieben werden' },
    ]);

    const installiert = await appBundle.archiveInstaller.installiereAusBuffer({
      archiveBuffer: tarGz,
      autoEnable: true,
    });
    assert.equal(installiert.pluginId, 'demo-theme');
    assert.equal(installiert.version, '2.0.0');

    // Path-Traversal-Datei wurde ignoriert und existiert nicht
    await assert.rejects(() => fs.access(path.join(tempDir, 'ausbruch.txt')));
  });

  it('verteilt Benachrichtigungen an In-App + externe notifications:channel-Plugins', async () => {
    const zugestellt: Array<{ channelId: string; empfaenger: number }> = [];
    const smtpMockPlugin = definiereBackendPlugin({
      manifest: {
        id: 'channel-smtp',
        name: 'SMTP Mock',
        kurzbeschreibung: 'E-Mail-Kanal',
        version: '1.0.0',
        sdkVersion: SIDELINE_SDK_VERSION,
        minCoreVersion: '0.2.0',
        icon: 'mail',
        permissions: ['notifications:channel'],
        navigation: { surface: 'system', scopes: ['global'] },
      },
      notificationChannels: [{ id: 'email', label: 'E-Mail (SMTP)' }],
      async deliverNotification(event, ctx) {
        zugestellt.push({ channelId: ctx.channelId, empfaenger: event.recipients.length });
        return { delivered: event.recipients.length };
      },
    });

    await appBundle.repo.speichereInstalliertesPlugin({
      manifest: smtpMockPlugin.manifest,
      enabledGlobally: true,
      approvedCapabilities: [],
    });
    await appBundle.pluginHost.registriereBackendPlugin(smtpMockPlugin, []);

    const club = await appBundle.repo.erstelleClub({ slug: 'sc-notify', name: 'SC Notify' });
    const empfaenger = await appBundle.repo.erstelleBenutzer(
      { benutzername: 'empf1', vollerName: 'Empfänger Eins', email: 'e1@test.de' },
      hashPasswort('Geheim1234!')
    );
    await appBundle.repo.speichereClubMitgliedschaft({
      userUuid: empfaenger.uuid,
      clubId: club.id,
      rolle: 'CLUB_MEMBER',
    });

    const ergebnis = await appBundle.notificationService.dispatch({
      sourcePluginId: 'video',
      clubId: club.id,
      payload: {
        eventType: 'video.uploaded',
        title: 'Neues Spielvideo',
        message: 'SC Notify vs. SV Test steht bereit.',
        linkPath: '/modules/video/library',
      },
    });

    assert.equal(ergebnis.recipientCount, 1);
    assert.equal(ergebnis.notificationIds.length, 1);
    assert.equal(zugestellt.length, 1);
    assert.equal(zugestellt[0]?.channelId, 'email');
    assert.equal(zugestellt[0]?.empfaenger, 1);
  });

  it('parst und serialisiert alle 4-Ebenen-Routen verlustfrei (Roundtrip)', () => {
    const pfade = [
      '/',
      '/modules/video-analyse/playlists',
      '/settings/account',
      '/settings/account/security',
      '/admin/club',
      '/admin/club/teams',
      '/admin/system',
      '/admin/system/storage',
    ];

    for (const pfad of pfade) {
      const geparst = parseBrowserPfad(pfad);
      assert.equal(geparst.istBekannterAppPfad, true);
      assert.equal(baueAppAnsichtPfad(geparst.ansicht), pfad);
    }

    const invite = parseBrowserPfad('/invite/tok-123');
    assert.deepEqual(invite.routeModus, { art: 'invite', token: 'tok-123' });

    const share = parseBrowserPfad('/share/vid-999');
    assert.deepEqual(share.routeModus, { art: 'share', token: 'vid-999' });
  });
});

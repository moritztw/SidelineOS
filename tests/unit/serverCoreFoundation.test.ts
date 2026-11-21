import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCoreConfig } from '../../src/server/config.ts';
import {
  generiereEinladungsToken,
  generiereSessionToken,
  hashPasswort,
  hashSessionToken,
  pruefePasswort,
} from '../../src/server/security.ts';
import {
  erstelleDatenbankClient,
  erstellePluginDbScope,
  fuehrePluginMigrationAus,
  pluginSchemaName,
} from '../../src/server/db/client.ts';
import { CoreRepository } from '../../src/server/db/coreRepository.ts';
import { bootstrapCoreInstance } from '../../src/server/bootstrap.ts';

test('scrypt Passwort-Hashing und Session-Token-Hashing arbeiten deterministisch und sicher', () => {
  const hash = hashPasswort('StarkesCoachingPasswort2026!');
  assert.ok(hash.startsWith('scrypt$'));
  assert.equal(pruefePasswort('StarkesCoachingPasswort2026!', hash), true);
  assert.equal(pruefePasswort('FalschesPasswort', hash), false);
  assert.equal(pruefePasswort('abc', 'ungueltig'), false);

  const token = generiereSessionToken();
  const h1 = hashSessionToken(token, 'geheimnis-1');
  const h2 = hashSessionToken(token, 'geheimnis-2');
  assert.notEqual(h1, token);
  assert.notEqual(h1, h2);

  const inv = generiereEinladungsToken('team');
  assert.ok(inv.startsWith('team-'));
});

test('bootstrapCoreInstance legt ENV-Sysadmin idempotent in PGlite an', async () => {
  const config = loadCoreConfig({
    NODE_ENV: 'production',
    INITIAL_SYSADMIN_EMAIL: 'Admin@Stallions.de',
    INITIAL_SYSADMIN_USERNAME: 'rootcoach',
    INITIAL_SYSADMIN_PASSWORD: 'SehrSicheresInitPasswort99!',
    ENABLED_MODULES: 'video-analysis,playbook',
    SESSION_SECRET: 'test-session-secret-mindestens-16-zeichen',
  });

  const db = await erstelleDatenbankClient({ databaseUrl: undefined });
  try {
    assert.equal(db.dialekt, 'pglite');

    const erstlauf = await bootstrapCoreInstance(db, config);
    assert.equal(erstlauf.initialAdminErstellt, true);
    assert.equal(erstlauf.demoDatenGesetzt, false);
    assert.equal(erstlauf.anzahlBenutzer, 1);

    // Zweiter Start darf keinen weiteren Admin anlegen
    const zweitlauf = await bootstrapCoreInstance(db, config);
    assert.equal(zweitlauf.initialAdminErstellt, false);
    assert.equal(zweitlauf.anzahlBenutzer, 1);

    const repo = new CoreRepository(db);
    const admin = await repo.findeBenutzerMitHashNachKennung('admin@stallions.de');
    assert.ok(admin);
    assert.equal(admin.konto.istSysadmin, true);
    assert.equal(admin.konto.benutzername, 'rootcoach');
    assert.equal(pruefePasswort('SehrSicheresInitPasswort99!', admin.passwordHash), true);
  } finally {
    await db.close();
  }
});

test('CoreRepository verwaltet Multi-Saison-Teams, Sessions, Einladungen und isolierte Plugin-Schemas', async () => {
  const config = loadCoreConfig({ NODE_ENV: 'development', ENABLED_MODULES: 'video-analysis' });
  const db = await erstelleDatenbankClient({ databaseUrl: undefined });

  try {
    const boot = await bootstrapCoreInstance(db, config, { seedDemoWennLeer: true });
    assert.equal(boot.demoDatenGesetzt, true);

    const repo = new CoreRepository(db);
    const teamsVorher = await repo.listeTeams();
    assert.ok(teamsVorher.length >= 2);

    // Neue Saison hinzufügen ohne bestehende Daten zu verlieren
    await repo.fuegeTeamSaisonHinzu(teamsVorher[0].id, '2027', true);
    const teamsNachher = await repo.listeTeams();
    const aktuellesTeam = teamsNachher.find((t) => t.id === teamsVorher[0].id)!;
    assert.equal(aktuellesTeam.aktiveSaison, '2027');
    assert.ok(aktuellesTeam.saisons.includes('2026'));
    assert.ok(aktuellesTeam.saisons.includes('2027'));

    // Session anlegen, finden und widerrufen
    const user = await repo.findeBenutzerMitHashNachKennung('headcoach@stallions-football.de');
    assert.ok(user);
    const tokenHash = hashSessionToken(generiereSessionToken(), config.sessionSecret);
    await repo.erstelleSession(user.konto.uuid, tokenHash, 24);
    const aktiveSession = await repo.findeAktiveSession(tokenHash);
    assert.equal(aktiveSession?.userUuid, user.konto.uuid);

    await repo.loescheSession(tokenHash);
    assert.equal(await repo.findeAktiveSession(tokenHash), null);

    // Plugin-Schema-Isolation prüfen (`plugin_video_analysis`)
    assert.equal(pluginSchemaName('video-analysis'), 'plugin_video_analysis');
    assert.throws(() => pluginSchemaName('!!bad;DROP TABLE core.users;'));

    const mig1 = await fuehrePluginMigrationAus(
      db,
      'video-analysis',
      '001_init.sql',
      `CREATE TABLE IF NOT EXISTS reels (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, title TEXT NOT NULL);`
    );
    assert.equal(mig1.ausgefuehrt, true);
    assert.equal(mig1.schemaName, 'plugin_video_analysis');

    // Zweiter Aufruf derselben Migration muss idempotent übersprungen werden
    const mig2 = await fuehrePluginMigrationAus(
      db,
      'video-analysis',
      '001_init.sql',
      `CREATE TABLE IF NOT EXISTS reels (id TEXT PRIMARY KEY, team_id TEXT NOT NULL, title TEXT NOT NULL);`
    );
    assert.equal(mig2.ausgefuehrt, false);

    // Plugin-Scope-Executor schreibt ins eigene Schema, ohne `core.` im search_path zu brauchen
    const pluginDb = erstellePluginDbScope(db, 'video-analysis');
    await pluginDb.query(
      `INSERT INTO reels (id, team_id, title) VALUES ($1, $2, $3)`,
      ['reel-1', aktuellesTeam.id, 'Training Week 1']
    );
    const reels = await pluginDb.query<{ title: string }>(`SELECT title FROM reels`);
    assert.equal(reels.rows[0]?.title, 'Training Week 1');

    // Core-Schema enthält keine Tabelle `reels`
    await assert.rejects(async () => {
      await db.query(`SELECT * FROM core.reels`);
    });
  } finally {
    await db.close();
  }
});

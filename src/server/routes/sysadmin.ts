import crypto from 'node:crypto';
import { Router } from 'express';
import { normalisiereSprache } from '../../shared/i18n.ts';
import type { SpielerUnit, TeamRolle } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth, requireSysadmin } from '../middleware/auth.ts';
import { hashPasswort } from '../security.ts';
import {
  PluginInstallerFehler,
  type PluginInstallerService,
} from '../services/pluginInstaller.ts';
import type { S3BrokerService } from '../services/s3Broker.ts';
import type { S3CleanupService } from '../services/s3CleanupService.ts';
import type { SmtpService } from '../services/smtpService.ts';
import type { PluginRuntimeLoader } from '../plugins/runtimeLoader.ts';

const MIN_PASSWORT_LAENGE = 10;
const GUELTIGE_ROLLEN = new Set<TeamRolle>(['TEAM_ADMIN', 'COACH', 'PLAYER']);
const GUELTIGE_UNITS = new Set<SpielerUnit>(['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS']);

function bereinigeUnits(raw: unknown, fallback: SpielerUnit[] = ['OFFENSE']): SpielerUnit[] {
  if (!Array.isArray(raw)) return fallback;
  const gefiltert = raw.filter(
    (u): u is SpielerUnit => typeof u === 'string' && GUELTIGE_UNITS.has(u as SpielerUnit)
  );
  return gefiltert.length > 0 ? Array.from(new Set(gefiltert)) : fallback;
}

interface BereinigteMitgliedschaftEingabe {
  teamId: string;
  rolle: TeamRolle;
  units: SpielerUnit[];
  status: 'AKTIV' | 'WARTET_AUF_FREIGABE';
}

function parseMitgliedschaftsListe(
  raw: unknown
): { ok: true; eintraege: BereinigteMitgliedschaftEingabe[] } | { ok: false; fehler: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, fehler: 'Ungültiges Format für Team-Mitgliedschaften.' };
  }
  const gesehen = new Set<string>();
  const eintraege: BereinigteMitgliedschaftEingabe[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, fehler: 'Ungültiger Team-Mitgliedschafts-Eintrag.' };
    }
    const rec = item as {
      teamId?: unknown;
      rolle?: unknown;
      units?: unknown;
      status?: unknown;
    };
    const teamId = typeof rec.teamId === 'string' ? rec.teamId.trim() : '';
    if (!teamId) {
      return { ok: false, fehler: 'Jede Team-Zuweisung benötigt eine gültige Team-ID.' };
    }
    if (gesehen.has(teamId)) {
      return { ok: false, fehler: `Team "${teamId}" wurde mehrfach zugewiesen.` };
    }
    gesehen.add(teamId);
    const rolle: TeamRolle =
      typeof rec.rolle === 'string' && GUELTIGE_ROLLEN.has(rec.rolle as TeamRolle)
        ? (rec.rolle as TeamRolle)
        : 'PLAYER';
    const status: 'AKTIV' | 'WARTET_AUF_FREIGABE' =
      rec.status === 'WARTET_AUF_FREIGABE' ? 'WARTET_AUF_FREIGABE' : 'AKTIV';
    eintraege.push({
      teamId,
      rolle,
      units: bereinigeUnits(rec.units, ['OFFENSE']),
      status,
    });
  }
  return { ok: true, eintraege };
}

export function erstelleSysadminRouter(
  repo: CoreRepository,
  config: CoreServerConfig,
  services?: {
    s3Broker?: S3BrokerService;
    s3Cleanup?: S3CleanupService;
    smtpService?: SmtpService;
    pluginInstaller?: PluginInstallerService;
    runtimeLoader?: PluginRuntimeLoader;
  }
): Router {
  const router = Router();
  router.use(requireAuth(repo, config), requireSysadmin());

  router.get('/overview', async (_req, res, next) => {
    try {
      const [teams, users, memberships, plugins, s3Config, smtpConfig, cleanupStats] =
        await Promise.all([
          repo.listeTeams(),
          repo.listeBenutzer(),
          repo.listeMitgliedschaften(),
          repo.listeInstalliertePlugins(),
          services?.s3Broker?.holeMaskierteKonfig(),
          services?.smtpService?.holeMaskierteKonfig(),
          services?.s3Cleanup?.holeAnonymisierteStatistik(),
        ]);
      res.status(200).json({
        teams,
        users,
        memberships,
        plugins,
        capabilities: {
          devGitInstallErlaubt: config.devAllowGitInstall,
          disableUpdateCheck: config.disableUpdateCheck,
          coreVersion: config.coreVersion,
          supportedSdkVersion: config.supportedSdkVersion,
          brandName: config.brandName,
          defaultLocale: config.defaultLocale,
        },
        ...(s3Config ? { s3Config } : {}),
        ...(smtpConfig ? { smtpConfig } : {}),
        ...(cleanupStats ? { cleanupStats } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/teams', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const kurzname = typeof body.kurzname === 'string' ? body.kurzname.trim() : '';
      const aktiveSaison =
        typeof body.aktiveSaison === 'string' && body.aktiveSaison.trim()
          ? body.aktiveSaison.trim()
          : String(new Date().getFullYear());

      if (!name || !kurzname) {
        res.status(400).json({ fehler: 'Teamname und Kurzname sind erforderlich.' });
        return;
      }

      const allePlugins = await repo.listeInstalliertePlugins();
      const globalAktiveIds = new Set(
        allePlugins.filter((p) => p.enabledGlobally).map((p) => p.manifest.id)
      );
      const angefordert: string[] = Array.isArray(body.aktivierteModule)
        ? (body.aktivierteModule as unknown[]).filter(
            (id): id is string => typeof id === 'string'
          )
        : Array.from(globalAktiveIds);
      const aktivierteModule = angefordert.filter((id) => globalAktiveIds.has(id));

      const id =
        typeof body.id === 'string' && /^[a-z0-9-]+$/.test(body.id.trim())
          ? body.id.trim()
          : `team-${crypto.randomUUID().slice(0, 8)}`;

      const team = await repo.erstelleTeam({
        id,
        name,
        kurzname,
        aktiveSaison,
        saisons: [aktiveSaison],
        primaerFarbe:
          typeof body.primaerFarbe === 'string' && body.primaerFarbe.trim()
            ? body.primaerFarbe.trim()
            : '#F59E0B',
        aktivierteModule,
        customProfilFelder: Array.isArray(body.customProfilFelder) ? body.customProfilFelder : [],
      });

      if (typeof body.ersterTeamAdminUuid === 'string' && body.ersterTeamAdminUuid.trim()) {
        const adminKonto = await repo.findeBenutzerNachUuid(body.ersterTeamAdminUuid.trim());
        if (adminKonto) {
          await repo.speichereMitgliedschaft({
            id: `mem-${crypto.randomUUID()}`,
            userUuid: adminKonto.konto.uuid,
            teamId: team.id,
            rolle: 'TEAM_ADMIN',
            units: ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS'],
            status: 'AKTIV',
            beigetretenAm: new Date().toISOString().slice(0, 10),
          });
        }
      }

      res.status(201).json({ team });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/teams/:teamId', async (req, res, next) => {
    try {
      const teamId = String(req.params.teamId);
      const team = await repo.findeTeamNachId(teamId);
      if (!team) {
        res.status(404).json({ fehler: 'Team nicht gefunden.' });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;

      let name = team.name;
      if ('name' in body) {
        if (typeof body.name !== 'string' || !body.name.trim()) {
          res.status(400).json({ fehler: 'Teamname darf nicht leer sein.' });
          return;
        }
        name = body.name.trim();
      }

      let kurzname = team.kurzname;
      if ('kurzname' in body) {
        if (typeof body.kurzname !== 'string' || !body.kurzname.trim()) {
          res.status(400).json({ fehler: 'Kurzname darf nicht leer sein.' });
          return;
        }
        kurzname = body.kurzname.trim();
      }

      let aktiveSaison = team.aktiveSaison;
      if ('aktiveSaison' in body) {
        if (typeof body.aktiveSaison !== 'string' || !body.aktiveSaison.trim()) {
          res.status(400).json({ fehler: 'Aktive Saison darf nicht leer sein.' });
          return;
        }
        aktiveSaison = body.aktiveSaison.trim();
      }

      let primaerFarbe = team.primaerFarbe;
      if ('primaerFarbe' in body) {
        if (typeof body.primaerFarbe !== 'string' || !body.primaerFarbe.trim()) {
          res.status(400).json({ fehler: 'Primärfarbe darf nicht leer sein.' });
          return;
        }
        primaerFarbe = body.primaerFarbe.trim();
      }

      const aktualisiert = await repo.aktualisiereTeam({
        ...team,
        name,
        kurzname,
        aktiveSaison,
        primaerFarbe,
        customProfilFelder: Array.isArray(body.customProfilFelder)
          ? (body.customProfilFelder as typeof team.customProfilFelder)
          : team.customProfilFelder,
      });

      res.status(200).json({ team: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/teams/:teamId', async (req, res, next) => {
    try {
      const teamId = String(req.params.teamId);
      const alle = await repo.listeTeams();
      if (!alle.some((t) => t.id === teamId)) {
        res.status(404).json({ fehler: 'Team nicht gefunden.' });
        return;
      }
      if (alle.length <= 1) {
        res.status(409).json({ fehler: 'Das letzte verbleibende Team kann nicht gelöscht werden.' });
        return;
      }
      await repo.loescheTeam(teamId);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/users', async (req, res, next) => {
    try {
      const body = req.body ?? {};
      const vollerName = typeof body.vollerName === 'string' ? body.vollerName.trim() : '';
      const benutzername =
        typeof body.benutzername === 'string' ? body.benutzername.trim().toLowerCase() : '';
      const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const passwort = typeof body.passwort === 'string' ? body.passwort : '';

      if (!vollerName || !benutzername || !email) {
        res.status(400).json({ fehler: 'Name, Benutzername und E-Mail sind erforderlich.' });
        return;
      }
      if (passwort.length < MIN_PASSWORT_LAENGE) {
        res.status(400).json({
          fehler: `Initialpasswort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`,
        });
        return;
      }

      const konflikt = await repo.existiertEmailOderBenutzername(email, benutzername);
      if (konflikt) {
        res.status(409).json({ fehler: 'E-Mail oder Benutzername existiert bereits.' });
        return;
      }

      const teams = await repo.listeTeams();
      const teamIds = new Set(teams.map((t) => t.id));

      let gewuenschteMitgliedschaften: BereinigteMitgliedschaftEingabe[] = [];
      if (body.mitgliedschaften !== undefined) {
        const geparst = parseMitgliedschaftsListe(body.mitgliedschaften);
        if (!geparst.ok) {
          res.status(400).json({ fehler: geparst.fehler });
          return;
        }
        const unbekannt = geparst.eintraege.find((e) => !teamIds.has(e.teamId));
        if (unbekannt) {
          res.status(404).json({ fehler: `Team "${unbekannt.teamId}" nicht gefunden.` });
          return;
        }
        gewuenschteMitgliedschaften = geparst.eintraege;
      } else {
        const zuweisung = body.teamZuweisung as { teamId?: unknown; rolle?: unknown } | undefined;
        if (zuweisung && typeof zuweisung.teamId === 'string' && zuweisung.teamId.trim()) {
          const tId = zuweisung.teamId.trim();
          if (teamIds.has(tId)) {
            const rolle: TeamRolle =
              typeof zuweisung.rolle === 'string' && GUELTIGE_ROLLEN.has(zuweisung.rolle as TeamRolle)
                ? (zuweisung.rolle as TeamRolle)
                : 'PLAYER';
            gewuenschteMitgliedschaften = [
              { teamId: tId, rolle, units: ['OFFENSE'], status: 'AKTIV' },
            ];
          }
        }
      }

      const user = await repo.erstelleBenutzer(
        {
          uuid: `usr-${crypto.randomUUID()}`,
          benutzername,
          vollerName,
          email,
          telefon: typeof body.telefon === 'string' ? body.telefon.trim() : undefined,
          trikotNummer: typeof body.trikotNummer === 'string' ? body.trikotNummer.trim() : undefined,
          position: typeof body.position === 'string' ? body.position.trim() : undefined,
          istSysadmin: Boolean(body.istSysadmin),
          erstelltAm: new Date().toISOString().slice(0, 10),
          preferredLocale: normalisiereSprache(body.preferredLocale, config.defaultLocale),
          customProfilWerte: {},
        },
        hashPasswort(passwort)
      );

      const memberships =
        gewuenschteMitgliedschaften.length > 0
          ? await repo.setzeBenutzerMitgliedschaften(user.uuid, gewuenschteMitgliedschaften)
          : [];
      const membership = memberships[0];

      res.status(201).json({
        user,
        ...(membership ? { membership } : {}),
        memberships,
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:userUuid', async (req, res, next) => {
    try {
      const userUuid = String(req.params.userUuid);
      const ziel = await repo.findeBenutzerNachUuid(userUuid);
      if (!ziel) {
        res.status(404).json({ fehler: 'Benutzer nicht gefunden.' });
        return;
      }

      const body = req.body ?? {};
      const vollerName =
        typeof body.vollerName === 'string' ? body.vollerName.trim() : ziel.konto.vollerName;
      const benutzername =
        typeof body.benutzername === 'string'
          ? body.benutzername.trim().toLowerCase()
          : ziel.konto.benutzername;
      const email =
        typeof body.email === 'string' ? body.email.trim().toLowerCase() : ziel.konto.email;

      if (!vollerName || !benutzername || !email || !email.includes('@')) {
        res.status(400).json({ fehler: 'Name, Benutzername und gültige E-Mail sind erforderlich.' });
        return;
      }

      const konflikt = await repo.existiertEmailOderBenutzername(email, benutzername, userUuid);
      if (konflikt) {
        res.status(409).json({ fehler: 'E-Mail oder Benutzername existiert bereits.' });
        return;
      }

      const neuesPasswort = typeof body.neuesPasswort === 'string' ? body.neuesPasswort : '';
      if (neuesPasswort && neuesPasswort.length < MIN_PASSWORT_LAENGE) {
        res.status(400).json({
          fehler: `Neues Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`,
        });
        return;
      }

      const istSysadmin =
        body.istSysadmin !== undefined ? Boolean(body.istSysadmin) : ziel.konto.istSysadmin;
      if (!istSysadmin && ziel.konto.istSysadmin) {
        const alle = await repo.listeBenutzer();
        if (alle.filter((u) => u.istSysadmin).length <= 1) {
          res.status(409).json({ fehler: 'Mindestens ein Sysadmin muss bestehen bleiben.' });
          return;
        }
      }

      let gewuenschteMitgliedschaften: BereinigteMitgliedschaftEingabe[] | undefined;
      if (body.mitgliedschaften !== undefined) {
        const geparst = parseMitgliedschaftsListe(body.mitgliedschaften);
        if (!geparst.ok) {
          res.status(400).json({ fehler: geparst.fehler });
          return;
        }
        const [alleTeams, alleMitgliedschaften] = await Promise.all([
          repo.listeTeams(),
          repo.listeMitgliedschaften(),
        ]);
        const teamMap = new Map(alleTeams.map((t) => [t.id, t]));
        for (const eintrag of geparst.eintraege) {
          if (!teamMap.has(eintrag.teamId)) {
            res.status(404).json({ fehler: `Team "${eintrag.teamId}" nicht gefunden.` });
            return;
          }
        }

        // Schutz: Letzten aktiven Team Admin je Team nicht entfernen oder herabstufen
        const zielMap = new Map(geparst.eintraege.map((e) => [e.teamId, e]));
        const bisherigeAktiveAdmins = alleMitgliedschaften.filter(
          (m) => m.userUuid === userUuid && m.rolle === 'TEAM_ADMIN' && m.status === 'AKTIV'
        );
        for (const alt of bisherigeAktiveAdmins) {
          const neu = zielMap.get(alt.teamId);
          if (!neu || neu.rolle !== 'TEAM_ADMIN' || neu.status !== 'AKTIV') {
            const andereAktiveAdmins = alleMitgliedschaften.filter(
              (m) =>
                m.teamId === alt.teamId &&
                m.userUuid !== userUuid &&
                m.rolle === 'TEAM_ADMIN' &&
                m.status === 'AKTIV'
            ).length;
            if (andereAktiveAdmins === 0) {
              const teamName = teamMap.get(alt.teamId)?.name ?? alt.teamId;
              res.status(409).json({
                fehler: `Mindestens ein aktiver Team Admin muss in "${teamName}" verbleiben.`,
              });
              return;
            }
          }
        }
        gewuenschteMitgliedschaften = geparst.eintraege;
      }

      const aktualisiert = await repo.aktualisiereBenutzer({
        ...ziel.konto,
        vollerName,
        benutzername,
        email,
        telefon: typeof body.telefon === 'string' ? body.telefon.trim() : ziel.konto.telefon,
        trikotNummer:
          typeof body.trikotNummer === 'string'
            ? body.trikotNummer.trim()
            : ziel.konto.trikotNummer,
        position: typeof body.position === 'string' ? body.position.trim() : ziel.konto.position,
        istSysadmin,
        preferredLocale:
          body.preferredLocale !== undefined
            ? normalisiereSprache(body.preferredLocale, ziel.konto.preferredLocale ?? 'de')
            : ziel.konto.preferredLocale,
      });

      if (neuesPasswort) {
        await repo.aktualisierePasswortHash(userUuid, hashPasswort(neuesPasswort));
      }

      const memberships =
        gewuenschteMitgliedschaften !== undefined
          ? await repo.setzeBenutzerMitgliedschaften(userUuid, gewuenschteMitgliedschaften)
          : (await repo.listeMitgliedschaften()).filter((m) => m.userUuid === userUuid);

      res.status(200).json({ user: aktualisiert, memberships });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/users/:userUuid/sysadmin', async (req, res, next) => {
    try {
      const userUuid = String(req.params.userUuid);
      const ziel = await repo.findeBenutzerNachUuid(userUuid);
      if (!ziel) {
        res.status(404).json({ fehler: 'Benutzer nicht gefunden.' });
        return;
      }

      const istSysadmin = Boolean(req.body?.istSysadmin);
      if (!istSysadmin && ziel.konto.istSysadmin) {
        const alle = await repo.listeBenutzer();
        const anzahlSysadmins = alle.filter((u) => u.istSysadmin).length;
        if (anzahlSysadmins <= 1) {
          res.status(409).json({ fehler: 'Mindestens ein Sysadmin muss bestehen bleiben.' });
          return;
        }
      }

      const aktualisiert = await repo.aktualisiereBenutzer({
        ...ziel.konto,
        istSysadmin,
      });
      res.status(200).json({ user: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/users/:userUuid', async (req, res, next) => {
    try {
      const userUuid = String(req.params.userUuid);
      if (userUuid === req.coreAuth!.user.uuid) {
        res.status(409).json({ fehler: 'Das aktuell angemeldete Konto kann sich nicht selbst löschen.' });
        return;
      }
      const ziel = await repo.findeBenutzerNachUuid(userUuid);
      if (!ziel) {
        res.status(404).json({ fehler: 'Benutzer nicht gefunden.' });
        return;
      }
      const alle = await repo.listeBenutzer();
      if (alle.length <= 1) {
        res.status(409).json({ fehler: 'Das letzte Benutzerkonto kann nicht gelöscht werden.' });
        return;
      }
      if (ziel.konto.istSysadmin && alle.filter((u) => u.istSysadmin).length <= 1) {
        res.status(409).json({ fehler: 'Der letzte Sysadmin kann nicht gelöscht werden.' });
        return;
      }

      await repo.loescheBenutzer(userUuid);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/plugins/:pluginId/global', async (req, res, next) => {
    try {
      const pluginId = String(req.params.pluginId);
      const aktiv = Boolean(req.body?.enabledGlobally);
      const gefunden = await repo.setzePluginGlobalAktiv(pluginId, aktiv);
      if (!gefunden) {
        res.status(404).json({ fehler: 'Plugin nicht installiert.' });
        return;
      }
      if (services?.runtimeLoader) {
        if (aktiv) {
          const status = await repo.findePluginStatus(pluginId);
          if (status) {
            await services.runtimeLoader
              .ladeBackendPlugin(pluginId, status.installedVersion)
              .catch((err) => {
                console.warn(`[SidelineOS-Core] Live-Load für "${pluginId}" fehlgeschlagen:`, err);
              });
          }
        } else {
          services.runtimeLoader.entladeBackendPlugin(pluginId);
        }
      }
      res.status(200).json({ pluginId, enabledGlobally: aktiv });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/teams/:teamId/plugins/:pluginId', async (req, res, next) => {
    try {
      const teamId = String(req.params.teamId);
      const pluginId = String(req.params.pluginId);
      const aktiv = Boolean(req.body?.enabled);

      const [team, pluginStatus] = await Promise.all([
        repo.findeTeamNachId(teamId),
        repo.findePluginStatus(pluginId),
      ]);
      if (!team) {
        res.status(404).json({ fehler: 'Team nicht gefunden.' });
        return;
      }
      if (!pluginStatus) {
        res.status(404).json({ fehler: 'Plugin nicht installiert.' });
        return;
      }
      if (aktiv && !pluginStatus.enabledGlobally) {
        res.status(409).json({
          fehler: 'Plugin ist global deaktiviert und kann keinem Team freigeschaltet werden.',
        });
        return;
      }

      await repo.setzeTeamModulAktiv(teamId, pluginId, aktiv);
      res.status(200).json({ teamId, pluginId, enabled: aktiv });
    } catch (err) {
      next(err);
    }
  });

  // --- Infrastruktur: S3 Object Storage & SMTP ---

  router.get('/infrastructure', async (_req, res, next) => {
    try {
      const [s3Config, smtpConfig] = await Promise.all([
        services?.s3Broker?.holeMaskierteKonfig(),
        services?.smtpService?.holeMaskierteKonfig(),
      ]);
      res.status(200).json({ s3Config, smtpConfig });
    } catch (err) {
      next(err);
    }
  });

  router.put('/s3', async (req, res, next) => {
    try {
      if (!services?.s3Broker) {
        res.status(503).json({ fehler: 'S3-Broker ist nicht initialisiert.' });
        return;
      }
      const body = req.body ?? {};
      const aktualisiert = await services.s3Broker.speichereKonfig({
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : '',
        region: typeof body.region === 'string' ? body.region : 'eu-central-1',
        bucket: typeof body.bucket === 'string' ? body.bucket : '',
        accessKey: typeof body.accessKey === 'string' ? body.accessKey : '',
        secretKey: typeof body.secretKey === 'string' ? body.secretKey : undefined,
        clearSecretKey: Boolean(body.clearSecretKey),
        forcePathStyle: body.forcePathStyle !== false,
        cleanupRetentionDays:
          typeof body.cleanupRetentionDays === 'number' ? body.cleanupRetentionDays : undefined,
      });
      res.status(200).json({ s3Config: aktualisiert });
    } catch (err) {
      if (err instanceof Error && err.message.includes('S3')) {
        res.status(400).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/s3/test', async (req, res, next) => {
    try {
      if (!services?.s3Broker) {
        res.status(503).json({ fehler: 'S3-Broker ist nicht initialisiert.' });
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const ergebnis = await services.s3Broker.testeVerbindung({
        endpoint: typeof body.endpoint === 'string' ? body.endpoint : undefined,
        region: typeof body.region === 'string' ? body.region : undefined,
        bucket: typeof body.bucket === 'string' ? body.bucket : undefined,
        accessKey: typeof body.accessKey === 'string' ? body.accessKey : undefined,
        secretKey: typeof body.secretKey === 'string' ? body.secretKey : undefined,
        forcePathStyle: typeof body.forcePathStyle === 'boolean' ? body.forcePathStyle : undefined,
      });
      res.status(200).json(ergebnis);
    } catch (err) {
      next(err);
    }
  });

  router.put('/smtp', async (req, res, next) => {
    try {
      if (!services?.smtpService) {
        res.status(503).json({ fehler: 'SMTP-Service ist nicht initialisiert.' });
        return;
      }
      const body = req.body ?? {};
      const aktualisiert = await services.smtpService.speichereKonfig({
        host: typeof body.host === 'string' ? body.host : '',
        port: Number(body.port) || 587,
        absender: typeof body.absender === 'string' ? body.absender : '',
        benutzer: typeof body.benutzer === 'string' ? body.benutzer : '',
        passwort: typeof body.passwort === 'string' ? body.passwort : undefined,
        clearPasswort: Boolean(body.clearPasswort),
        tlsAktiv: body.tlsAktiv !== false,
      });
      res.status(200).json({ smtpConfig: aktualisiert });
    } catch (err) {
      if (err instanceof Error && err.message.includes('SMTP')) {
        res.status(400).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/smtp/test', async (req, res, next) => {
    try {
      if (!services?.smtpService) {
        res.status(503).json({ fehler: 'SMTP-Service ist nicht initialisiert.' });
        return;
      }
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const ergebnis = await services.smtpService.testeVerbindung(
        {
          host: typeof body.host === 'string' ? body.host : undefined,
          port: typeof body.port === 'number' ? body.port : undefined,
          absender: typeof body.absender === 'string' ? body.absender : undefined,
          benutzer: typeof body.benutzer === 'string' ? body.benutzer : undefined,
          passwort: typeof body.passwort === 'string' ? body.passwort : undefined,
          tlsAktiv: typeof body.tlsAktiv === 'boolean' ? body.tlsAktiv : undefined,
        },
        typeof body.testEmpfaenger === 'string' ? body.testEmpfaenger : undefined
      );
      res.status(200).json(ergebnis);
    } catch (err) {
      next(err);
    }
  });

  // --- Phase 3: Updates, Plugin-Installer (Release / Offline-Upload / Dev-Git) & S3-Cleanup ---

  router.get('/updates', async (req, res, next) => {
    try {
      if (!services?.pluginInstaller) {
        res.status(503).json({ fehler: 'Plugin-Installer ist nicht initialisiert.' });
        return;
      }
      const forceRefresh = req.query.refresh === 'true';
      const ergebnis = await services.pluginInstaller.pruefeUpdates({ forceRefresh });
      res.status(200).json(ergebnis);
    } catch (err) {
      next(err);
    }
  });

  router.post('/plugins/install-release', async (req, res, next) => {
    try {
      if (!services?.pluginInstaller) {
        res.status(503).json({ fehler: 'Plugin-Installer ist nicht initialisiert.' });
        return;
      }
      const body = req.body ?? {};
      const repoUrl = typeof body.repoUrl === 'string' ? body.repoUrl.trim() : '';
      const tag = typeof body.tag === 'string' && body.tag.trim() ? body.tag.trim() : undefined;
      if (!repoUrl) {
        res.status(400).json({ fehler: 'Bitte eine gültige GitHub-Repository-URL angeben.' });
        return;
      }
      const ergebnis = await services.pluginInstaller.installiereAusReleaseBundle({ repoUrl, tag });
      if (services.runtimeLoader) {
        const status = await repo.findePluginStatus(ergebnis.manifest.id);
        if (status?.enabledGlobally) {
          await services.runtimeLoader
            .ladeBackendPlugin(ergebnis.manifest.id, ergebnis.manifest.version)
            .catch((err) => {
              console.warn(`[SidelineOS-Core] Live-Load nach Release fehlgeschlagen:`, err);
            });
        }
      }
      res.status(200).json({ ok: true, ...ergebnis });
    } catch (err) {
      if (err instanceof PluginInstallerFehler) {
        res.status(err.status).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/plugins/install-upload', async (req, res, next) => {
    try {
      if (!services?.pluginInstaller) {
        res.status(503).json({ fehler: 'Plugin-Installer ist nicht initialisiert.' });
        return;
      }
      const body = req.body ?? {};
      const contentBase64 = typeof body.contentBase64 === 'string' ? body.contentBase64.trim() : '';
      if (!contentBase64) {
        res.status(400).json({ fehler: 'Keine Paketdaten (contentBase64) übermittelt.' });
        return;
      }
      const tarGzBuffer = Buffer.from(contentBase64, 'base64');
      const expectedSha256 =
        typeof body.expectedSha256 === 'string' && body.expectedSha256.trim()
          ? body.expectedSha256.trim()
          : undefined;
      const ergebnis = await services.pluginInstaller.installiereAusOfflineTarGz({
        tarGzBuffer,
        expectedSha256,
        installMode: 'OFFLINE_UPLOAD',
      });
      if (services.runtimeLoader) {
        const status = await repo.findePluginStatus(ergebnis.manifest.id);
        if (status?.enabledGlobally) {
          await services.runtimeLoader
            .ladeBackendPlugin(ergebnis.manifest.id, ergebnis.manifest.version)
            .catch((err) => {
              console.warn(`[SidelineOS-Core] Live-Load nach Upload fehlgeschlagen:`, err);
            });
        }
      }
      res.status(200).json({ ok: true, ...ergebnis });
    } catch (err) {
      if (err instanceof PluginInstallerFehler) {
        res.status(err.status).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/plugins/install-dev-git', async (req, res, next) => {
    try {
      if (!services?.pluginInstaller) {
        res.status(503).json({ fehler: 'Plugin-Installer ist nicht initialisiert.' });
        return;
      }
      const body = req.body ?? {};
      const repoUrl = typeof body.repoUrl === 'string' ? body.repoUrl.trim() : '';
      const branch =
        typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : undefined;
      if (!repoUrl) {
        res.status(400).json({ fehler: 'Bitte eine GitHub-Repository-URL angeben.' });
        return;
      }
      const ergebnis = await services.pluginInstaller.installiereDevAusGit({ repoUrl, branch });
      if (services.runtimeLoader) {
        const status = await repo.findePluginStatus(ergebnis.manifest.id);
        if (status?.enabledGlobally) {
          await services.runtimeLoader
            .ladeBackendPlugin(ergebnis.manifest.id, ergebnis.manifest.version)
            .catch((err) => {
              console.warn(`[SidelineOS-Core] Live-Load nach Dev-Git fehlgeschlagen:`, err);
            });
        }
      }
      res.status(200).json({ ok: true, ...ergebnis });
    } catch (err) {
      if (err instanceof PluginInstallerFehler) {
        res.status(err.status).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  router.post('/plugins/:pluginId/rollback', async (req, res, next) => {
    try {
      if (!services?.pluginInstaller) {
        res.status(503).json({ fehler: 'Plugin-Installer ist nicht initialisiert.' });
        return;
      }
      const pluginId = String(req.params.pluginId);
      const ergebnis = await services.pluginInstaller.rollbackPlugin(pluginId);
      if (services.runtimeLoader) {
        const status = await repo.findePluginStatus(pluginId);
        if (status?.enabledGlobally) {
          await services.runtimeLoader
            .ladeBackendPlugin(pluginId, ergebnis.version)
            .catch((err) => {
              console.warn(`[SidelineOS-Core] Live-Load nach Rollback fehlgeschlagen:`, err);
            });
        }
      }
      res.status(200).json({ ok: true, ...ergebnis });
    } catch (err) {
      if (err instanceof PluginInstallerFehler) {
        res.status(err.status).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  router.delete('/plugins/:pluginId', async (req, res, next) => {
    try {
      if (!services?.pluginInstaller) {
        res.status(503).json({ fehler: 'Plugin-Installer ist nicht initialisiert.' });
        return;
      }
      const pluginId = String(req.params.pluginId);
      await services.pluginInstaller.deinstallierePlugin(pluginId);
      services.runtimeLoader?.entladeBackendPlugin(pluginId);
      res.status(200).json({ ok: true });
    } catch (err) {
      if (err instanceof PluginInstallerFehler) {
        res.status(err.status).json({ fehler: err.message });
        return;
      }
      next(err);
    }
  });

  router.get('/s3/cleanup', async (_req, res, next) => {
    try {
      if (!services?.s3Cleanup) {
        res.status(503).json({ fehler: 'S3-Cleanup-Service ist nicht initialisiert.' });
        return;
      }
      const statistik = await services.s3Cleanup.holeAnonymisierteStatistik();
      res.status(200).json({ statistik });
    } catch (err) {
      next(err);
    }
  });

  router.post('/s3/cleanup/run', async (req, res, next) => {
    try {
      if (!services?.s3Cleanup) {
        res.status(503).json({ fehler: 'S3-Cleanup-Service ist nicht initialisiert.' });
        return;
      }
      const auchVorfristig = Boolean(req.body?.auchVorfristig);
      const ergebnis = await services.s3Cleanup.bereinigeFaellige({ auchVorfristig });
      res.status(200).json(ergebnis);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

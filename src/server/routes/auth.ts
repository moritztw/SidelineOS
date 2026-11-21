import crypto from 'node:crypto';
import { Router } from 'express';
import { pruefeEinladungsToken } from '../../core/authService.ts';
import type { BenutzerKonto, TeamMitgliedschaft } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import {
  extrahiereSessionToken,
  loescheSessionCookie,
  requireAuth,
  setzeSessionCookie,
} from '../middleware/auth.ts';
import {
  generiereSessionToken,
  hashPasswort,
  hashSessionToken,
  pruefePasswort,
} from '../security.ts';

const MIN_PASSWORT_LAENGE = 10;

async function ladeUserKontext(repo: CoreRepository, userUuid: string) {
  const [alleMitgliedschaften, alleTeams] = await Promise.all([
    repo.listeMitgliedschaften(),
    repo.listeTeams(),
  ]);
  const memberships = alleMitgliedschaften.filter((m) => m.userUuid === userUuid);
  const aktiveTeamIds = new Set(
    memberships.filter((m) => m.status === 'AKTIV').map((m) => m.teamId)
  );
  const teams = alleTeams.filter((t) => aktiveTeamIds.has(t.id));
  return { memberships, teams };
}

export function erstelleAuthRouter(repo: CoreRepository, config: CoreServerConfig): Router {
  const router = Router();
  const auth = requireAuth(repo, config);

  router.post('/login', async (req, res, next) => {
    try {
      const kennung = typeof req.body?.kennung === 'string' ? req.body.kennung.trim() : '';
      const passwort = typeof req.body?.passwort === 'string' ? req.body.passwort : '';

      if (!kennung || !passwort) {
        res.status(400).json({
          fehler: 'Bitte Benutzername oder E-Mail sowie Passwort eingeben.',
        });
        return;
      }

      const treffer = await repo.findeBenutzerMitHashNachKennung(kennung);
      if (!treffer || !pruefePasswort(passwort, treffer.passwordHash)) {
        res.status(401).json({ fehler: 'Anmeldedaten ungültig. Bitte Eingabe prüfen.' });
        return;
      }

      const rawToken = generiereSessionToken();
      const tokenHash = hashSessionToken(rawToken, config.sessionSecret);
      await repo.erstelleSession(treffer.konto.uuid, tokenHash, config.sessionTtlStunden);
      setzeSessionCookie(res, req, config, rawToken);

      const { memberships, teams } = await ladeUserKontext(repo, treffer.konto.uuid);
      res.status(200).json({
        user: treffer.konto,
        memberships,
        teams,
        token: rawToken,
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const gefunden = extrahiereSessionToken(req);
      if (gefunden) {
        const tokenHash = hashSessionToken(gefunden.token, config.sessionSecret);
        await repo.loescheSession(tokenHash);
      }
      loescheSessionCookie(res, req, config);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', auth, async (req, res, next) => {
    try {
      const user = req.coreAuth!.user;
      const { memberships, teams } = await ladeUserKontext(repo, user.uuid);
      res.status(200).json({ user, memberships, teams });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/me', auth, async (req, res, next) => {
    try {
      const aktuell = req.coreAuth!.user;
      const body = req.body ?? {};

      const neuerUsername =
        typeof body.benutzername === 'string' && body.benutzername.trim()
          ? body.benutzername.trim().toLowerCase()
          : aktuell.benutzername;
      const neueEmail =
        typeof body.email === 'string' && body.email.trim()
          ? body.email.trim().toLowerCase()
          : aktuell.email;
      const neuerName =
        typeof body.vollerName === 'string' && body.vollerName.trim()
          ? body.vollerName.trim()
          : aktuell.vollerName;

      const konflikt = await repo.existiertEmailOderBenutzername(
        neueEmail,
        neuerUsername,
        aktuell.uuid
      );
      if (konflikt) {
        res.status(409).json({
          fehler: 'E-Mail oder Benutzername wird bereits von einem anderen Konto verwendet.',
        });
        return;
      }

      if (typeof body.neuesPasswort === 'string' && body.neuesPasswort.length > 0) {
        const alt = typeof body.altesPasswort === 'string' ? body.altesPasswort : '';
        const mitHash = await repo.findeBenutzerNachUuid(aktuell.uuid);
        if (!mitHash || !pruefePasswort(alt, mitHash.passwordHash)) {
          res.status(403).json({ fehler: 'Aktuelles Passwort ist nicht korrekt.' });
          return;
        }
        if (body.neuesPasswort.length < MIN_PASSWORT_LAENGE) {
          res.status(400).json({
            fehler: `Das neue Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`,
          });
          return;
        }
        await repo.aktualisierePasswortHash(aktuell.uuid, hashPasswort(body.neuesPasswort));
      }

      const customProfilWerte =
        body.customProfilWerte && typeof body.customProfilWerte === 'object'
          ? Object.fromEntries(
              Object.entries(body.customProfilWerte as Record<string, unknown>).map(([k, v]) => [
                k,
                String(v ?? ''),
              ])
            )
          : aktuell.customProfilWerte;

      const aktualisiert = await repo.aktualisiereBenutzer({
        ...aktuell,
        benutzername: neuerUsername,
        email: neueEmail,
        vollerName: neuerName,
        telefon: typeof body.telefon === 'string' ? body.telefon.trim() : aktuell.telefon,
        trikotNummer:
          typeof body.trikotNummer === 'string' ? body.trikotNummer.trim() : aktuell.trikotNummer,
        position: typeof body.position === 'string' ? body.position.trim() : aktuell.position,
        customProfilWerte,
      });

      res.status(200).json({ user: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.get('/invite/:token', async (req, res, next) => {
    try {
      const token = String(req.params.token ?? '').trim();
      const einladung = await repo.findeEinladungNachToken(token);
      const pruefung = pruefeEinladungsToken(einladung ? [einladung] : [], token);

      if (!pruefung.ok || !pruefung.einladung) {
        const httpStatus = pruefung.status === 'NOT_FOUND' ? 404 : 410;
        res.status(httpStatus).json({
          fehler: pruefung.fehler,
          status: pruefung.status,
        });
        return;
      }

      const team = await repo.findeTeamNachId(pruefung.einladung.teamId);
      if (!team) {
        res.status(404).json({ fehler: 'Zugehöriges Team nicht gefunden.' });
        return;
      }

      res.status(200).json({
        status: 'VALID',
        invitation: {
          id: pruefung.einladung.id,
          teamId: pruefung.einladung.teamId,
          typ: pruefung.einladung.typ,
          ...(pruefung.einladung.zielEmail ? { zielEmail: pruefung.einladung.zielEmail } : {}),
          rolle: pruefung.einladung.rolle,
          units: pruefung.einladung.units,
          gueltigBis: pruefung.einladung.gueltigBis,
          bestaetigungErforderlich: pruefung.einladung.bestaetigungErforderlich,
        },
        team: {
          id: team.id,
          name: team.name,
          kurzname: team.kurzname,
          aktiveSaison: team.aktiveSaison,
          primaerFarbe: team.primaerFarbe,
          customProfilFelder: team.customProfilFelder,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/invite/:token/accept', async (req, res, next) => {
    try {
      const token = String(req.params.token ?? '').trim();
      const einladung = await repo.findeEinladungNachToken(token);
      const pruefung = pruefeEinladungsToken(einladung ? [einladung] : [], token);

      if (!pruefung.ok || !pruefung.einladung) {
        const httpStatus = pruefung.status === 'NOT_FOUND' ? 404 : 410;
        res.status(httpStatus).json({ fehler: pruefung.fehler, status: pruefung.status });
        return;
      }

      const team = await repo.findeTeamNachId(pruefung.einladung.teamId);
      if (!team) {
        res.status(404).json({ fehler: 'Zugehöriges Team nicht gefunden.' });
        return;
      }

      const body = req.body ?? {};
      const modus = body.modus === 'bestehend' ? 'bestehend' : 'neu';
      let konto: BenutzerKonto;

      if (modus === 'bestehend') {
        const kennung = typeof body.kennung === 'string' ? body.kennung.trim() : '';
        const passwort = typeof body.passwort === 'string' ? body.passwort : '';
        const treffer = await repo.findeBenutzerMitHashNachKennung(kennung);
        if (!treffer || !pruefePasswort(passwort, treffer.passwordHash)) {
          res.status(401).json({ fehler: 'Bestehende Anmeldedaten ungültig.' });
          return;
        }
        konto = treffer.konto;
      } else {
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
            fehler: `Das Passwort muss mindestens ${MIN_PASSWORT_LAENGE} Zeichen lang sein.`,
          });
          return;
        }

        const konflikt = await repo.existiertEmailOderBenutzername(email, benutzername);
        if (konflikt) {
          res.status(409).json({
            fehler: 'E-Mail oder Benutzername ist bereits vergeben. Bitte mit bestehendem Konto anmelden.',
          });
          return;
        }

        const customProfilWerte =
          body.customProfilWerte && typeof body.customProfilWerte === 'object'
            ? Object.fromEntries(
                Object.entries(body.customProfilWerte as Record<string, unknown>).map(([k, v]) => [
                  k,
                  String(v ?? ''),
                ])
              )
            : {};

        konto = await repo.erstelleBenutzer(
          {
            uuid: `usr-${crypto.randomUUID()}`,
            benutzername,
            vollerName,
            email,
            telefon: typeof body.telefon === 'string' ? body.telefon.trim() : undefined,
            trikotNummer:
              typeof body.trikotNummer === 'string' ? body.trikotNummer.trim() : undefined,
            position: typeof body.position === 'string' ? body.position.trim() : undefined,
            istSysadmin: false,
            erstelltAm: new Date().toISOString().slice(0, 10),
            customProfilWerte,
          },
          hashPasswort(passwort)
        );
      }

      const teamMitgliedschaften = await repo.listeMitgliedschaften(team.id);
      if (teamMitgliedschaften.some((m) => m.userUuid === konto.uuid)) {
        res.status(409).json({ fehler: 'Dieses Konto ist bereits Mitglied dieses Teams.' });
        return;
      }

      const gueltigeUnits = new Set(['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS']);
      const gewaehlteUnits = Array.isArray(body.units)
        ? body.units.filter((u: unknown): u is 'OFFENSE' | 'DEFENSE' | 'SPECIAL_TEAMS' =>
            typeof u === 'string' && gueltigeUnits.has(u)
          )
        : [];
      const finalUnits = gewaehlteUnits.length > 0 ? gewaehlteUnits : pruefung.einladung.units;

      const status: TeamMitgliedschaft['status'] = pruefung.einladung.bestaetigungErforderlich
        ? 'WARTET_AUF_FREIGABE'
        : 'AKTIV';

      const mitgliedschaft = await repo.speichereMitgliedschaft({
        id: `mem-${crypto.randomUUID()}`,
        userUuid: konto.uuid,
        teamId: team.id,
        rolle: pruefung.einladung.rolle,
        units: finalUnits,
        status,
        beigetretenAm: new Date().toISOString().slice(0, 10),
      });

      let sessionToken: string | undefined;
      if (status === 'AKTIV') {
        sessionToken = generiereSessionToken();
        const tokenHash = hashSessionToken(sessionToken, config.sessionSecret);
        await repo.erstelleSession(konto.uuid, tokenHash, config.sessionTtlStunden);
        setzeSessionCookie(res, req, config, sessionToken);
      }

      res.status(201).json({
        status,
        user: konto,
        membership: mitgliedschaft,
        team,
        ...(sessionToken ? { token: sessionToken } : {}),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

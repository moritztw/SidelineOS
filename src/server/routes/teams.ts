import crypto from 'node:crypto';
import { Router } from 'express';
import type { SpielerUnit, TeamRolle } from '../../shared/types.ts';
import { TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth, requireTeamRolle } from '../middleware/auth.ts';
import { generiereEinladungsToken } from '../security.ts';
import type { SmtpService } from '../services/smtpService.ts';

const GUELTIGE_ROLLEN = new Set<TeamRolle>(['TEAM_ADMIN', 'COACH', 'PLAYER']);
const GUELTIGE_UNITS = new Set<SpielerUnit>(['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS']);

function bereinigeUnits(raw: unknown, fallback: SpielerUnit[] = ['OFFENSE']): SpielerUnit[] {
  if (!Array.isArray(raw)) return fallback;
  const gefiltert = raw.filter((u): u is SpielerUnit => GUELTIGE_UNITS.has(u as SpielerUnit));
  return gefiltert.length > 0 ? Array.from(new Set(gefiltert)) : fallback;
}

export function erstelleTeamRouter(
  repo: CoreRepository,
  config: CoreServerConfig,
  smtpService?: SmtpService
): Router {
  const router = Router();
  const auth = requireAuth(repo, config);

  router.get('/', auth, async (req, res, next) => {
    try {
      const user = req.coreAuth!.user;
      const [alleMitgliedschaften, alleTeams] = await Promise.all([
        repo.listeMitgliedschaften(),
        repo.listeTeams(),
      ]);
      const eigene = alleMitgliedschaften.filter((m) => m.userUuid === user.uuid);
      const aktivIds = new Set(eigene.filter((m) => m.status === 'AKTIV').map((m) => m.teamId));
      const teams = alleTeams.filter((t) => aktivIds.has(t.id));
      res.status(200).json({ teams, memberships: eigene });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:teamId', auth, requireTeamRolle(repo, ['TEAM_ADMIN']), async (req, res, next) => {
    try {
      const team = await repo.findeTeamNachId(String(req.params.teamId));
      if (!team) {
        res.status(404).json({ fehler: 'Team nicht gefunden.' });
        return;
      }

      const body = req.body ?? {};
      const aktualisiert = await repo.aktualisiereTeam({
        ...team,
        name: typeof body.name === 'string' && body.name.trim() ? body.name.trim() : team.name,
        kurzname:
          typeof body.kurzname === 'string' && body.kurzname.trim()
            ? body.kurzname.trim()
            : team.kurzname,
        aktiveSaison:
          typeof body.aktiveSaison === 'string' && body.aktiveSaison.trim()
            ? body.aktiveSaison.trim()
            : team.aktiveSaison,
        primaerFarbe:
          typeof body.primaerFarbe === 'string' && body.primaerFarbe.trim()
            ? body.primaerFarbe.trim()
            : team.primaerFarbe,
        customProfilFelder: Array.isArray(body.customProfilFelder)
          ? body.customProfilFelder
          : team.customProfilFelder,
      });

      res.status(200).json({ team: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/:teamId/seasons',
    auth,
    requireTeamRolle(repo, ['TEAM_ADMIN']),
    async (req, res, next) => {
      try {
        const teamId = String(req.params.teamId);
        const saison = typeof req.body?.saison === 'string' ? req.body.saison.trim() : '';
        if (!saison) {
          res.status(400).json({ fehler: 'Bitte eine gültige Saisonbezeichnung angeben.' });
          return;
        }
        const alsAktiv = req.body?.alsAktiv !== false;
        await repo.fuegeTeamSaisonHinzu(teamId, saison, alsAktiv);
        const team = await repo.findeTeamNachId(teamId);
        res.status(201).json({ team });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/:teamId/members',
    auth,
    requireTeamRolle(repo, ['TEAM_ADMIN', 'COACH', 'PLAYER']),
    async (req, res, next) => {
      try {
        const teamId = String(req.params.teamId);
        const eigeneRolle = req.coreMembership!.rolle;
        const darfPrivatdatenSehen = eigeneRolle === 'TEAM_ADMIN' || eigeneRolle === 'COACH';

        const [mitgliedschaften, benutzer] = await Promise.all([
          repo.listeMitgliedschaften(teamId),
          repo.listeBenutzer(),
        ]);

        const benutzerMap = new Map(benutzer.map((u) => [u.uuid, u]));
        const gefiltert = mitgliedschaften.filter(
          (m) =>
            m.status === 'AKTIV' ||
            darfPrivatdatenSehen ||
            m.userUuid === req.coreAuth!.user.uuid
        );

        const eintraege = gefiltert.map((m) => {
          const u = benutzerMap.get(m.userUuid);
          return {
            membership: m,
            user: u
              ? {
                  uuid: u.uuid,
                  benutzername: u.benutzername,
                  vollerName: u.vollerName,
                  trikotNummer: u.trikotNummer,
                  position: u.position,
                  ...(darfPrivatdatenSehen || u.uuid === req.coreAuth!.user.uuid
                    ? { email: u.email, telefon: u.telefon }
                    : {}),
                }
              : null,
          };
        });

        res.status(200).json({ members: eintraege });
      } catch (err) {
        next(err);
      }
    }
  );

  router.patch(
    '/:teamId/members/:membershipId',
    auth,
    requireTeamRolle(repo, ['TEAM_ADMIN']),
    async (req, res, next) => {
      try {
        const teamId = String(req.params.teamId);
        const membershipId = String(req.params.membershipId);
        const ziel = await repo.findeMitgliedschaftNachId(membershipId);
        if (!ziel || ziel.teamId !== teamId) {
          res.status(404).json({ fehler: 'Team-Mitgliedschaft nicht gefunden.' });
          return;
        }

        const body = req.body ?? {};
        const neueRolle =
          typeof body.rolle === 'string' && GUELTIGE_ROLLEN.has(body.rolle as TeamRolle)
            ? (body.rolle as TeamRolle)
            : ziel.rolle;
        const neuerStatus =
          body.status === 'AKTIV' || body.status === 'WARTET_AUF_FREIGABE'
            ? body.status
            : ziel.status;
        const neueUnits = body.units !== undefined ? bereinigeUnits(body.units, ziel.units) : ziel.units;

        // Schutz: Letzten aktiven Team Admin nicht herabstufen oder deaktivieren
        if (ziel.rolle === 'TEAM_ADMIN' && ziel.status === 'AKTIV') {
          if (neueRolle !== 'TEAM_ADMIN' || neuerStatus !== 'AKTIV') {
            const alle = await repo.listeMitgliedschaften(teamId);
            const anzahlAdmins = alle.filter(
              (m) => m.rolle === 'TEAM_ADMIN' && m.status === 'AKTIV'
            ).length;
            if (anzahlAdmins <= 1) {
              res.status(409).json({
                fehler: 'Mindestens ein aktiver Team Admin muss im Team verbleiben.',
              });
              return;
            }
          }
        }

        const gespeichert = await repo.speichereMitgliedschaft({
          ...ziel,
          rolle: neueRolle,
          status: neuerStatus,
          units: neueUnits,
        });
        res.status(200).json({ membership: gespeichert });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/:teamId/members/:membershipId',
    auth,
    requireTeamRolle(repo, ['TEAM_ADMIN']),
    async (req, res, next) => {
      try {
        const teamId = String(req.params.teamId);
        const membershipId = String(req.params.membershipId);
        const ziel = await repo.findeMitgliedschaftNachId(membershipId);
        if (!ziel || ziel.teamId !== teamId) {
          res.status(404).json({ fehler: 'Team-Mitgliedschaft nicht gefunden.' });
          return;
        }

        if (ziel.rolle === 'TEAM_ADMIN' && ziel.status === 'AKTIV') {
          const alle = await repo.listeMitgliedschaften(teamId);
          const anzahlAdmins = alle.filter(
            (m) => m.rolle === 'TEAM_ADMIN' && m.status === 'AKTIV'
          ).length;
          if (anzahlAdmins <= 1) {
            res.status(409).json({
              fehler: 'Der letzte aktive Team Admin kann nicht entfernt werden.',
            });
            return;
          }
        }

        // Wichtig: Entfernt nur die Team-Mitgliedschaft; das globale Benutzerkonto bleibt bestehen!
        await repo.loescheMitgliedschaft(membershipId);
        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/:teamId/invitations',
    auth,
    requireTeamRolle(repo, ['TEAM_ADMIN']),
    async (req, res, next) => {
      try {
        const invitations = await repo.listeEinladungen(String(req.params.teamId));
        res.status(200).json({ invitations });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/:teamId/invitations',
    auth,
    requireTeamRolle(repo, ['TEAM_ADMIN']),
    async (req, res, next) => {
      try {
        const teamId = String(req.params.teamId);
        const body = req.body ?? {};
        const typ = body.typ === 'EMAIL' ? 'EMAIL' : 'TEAM_LINK';
        const rolle = GUELTIGE_ROLLEN.has(body.rolle as TeamRolle)
          ? (body.rolle as TeamRolle)
          : 'PLAYER';
        const units = bereinigeUnits(body.units, ['OFFENSE']);
        const gueltigTage = Number(body.gueltigTage) > 0 ? Math.min(Number(body.gueltigTage), 90) : 14;
        const token = generiereEinladungsToken(typ === 'EMAIL' ? 'mail' : 'join');
        const erstelltAm = new Date().toISOString().slice(0, 10);
        const gueltigBis = new Date(Date.now() + gueltigTage * 86400 * 1000)
          .toISOString()
          .slice(0, 10);

        const einladung = await repo.erstelleEinladung({
          id: `inv-${crypto.randomUUID()}`,
          teamId,
          typ,
          ...(typ === 'EMAIL' && typeof body.zielEmail === 'string' && body.zielEmail.trim()
            ? { zielEmail: body.zielEmail.trim().toLowerCase() }
            : {}),
          rolle,
          units,
          token,
          pfad: `/invite/${token}`,
          erstelltAm,
          gueltigBis,
          bestaetigungErforderlich:
            typeof body.bestaetigungErforderlich === 'boolean'
              ? body.bestaetigungErforderlich
              : typ === 'TEAM_LINK',
          aktiv: true,
        });

        let mailStatus:
          | { gesendet: boolean; modus: 'SMTP' | 'OFFLINE_FALLBACK' | 'NICHT_ANGEFORDERT'; hinweis: string }
          | undefined;

        if (typ === 'EMAIL' && einladung.zielEmail && smtpService) {
          const team = await repo.findeTeamNachId(teamId);
          const versand = await smtpService.sendeEinladungsMail({
            empfaenger: einladung.zielEmail,
            teamName: team?.name ?? teamId,
            rolleLabel: TEAM_ROLLEN_LABELS[einladung.rolle],
            einladungsPfad: einladung.pfad,
            gueltigBis: einladung.gueltigBis,
          });
          mailStatus = {
            gesendet: versand.gesendet,
            modus: versand.modus,
            hinweis: versand.hinweis,
          };
        }

        res.status(201).json({
          invitation: einladung,
          ...(mailStatus ? { mailStatus } : {}),
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/:teamId/invitations/:invitationId',
    auth,
    requireTeamRolle(repo, ['TEAM_ADMIN']),
    async (req, res, next) => {
      try {
        const teamId = String(req.params.teamId);
        const invitationId = String(req.params.invitationId);
        const alle = await repo.listeEinladungen(teamId);
        if (!alle.some((e) => e.id === invitationId)) {
          res.status(404).json({ fehler: 'Einladung in diesem Team nicht gefunden.' });
          return;
        }
        await repo.widerrufeEinladung(invitationId);
        res.status(200).json({ ok: true });
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}

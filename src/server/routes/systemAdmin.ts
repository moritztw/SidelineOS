import { Router } from 'express';
import {
  istPrivilegierteCapability,
  type PrivilegiertePluginPermission,
} from '../../sdk/plugin.ts';
import { STANDARD_THEME_REF } from '../../shared/theme.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreDatabaseClient } from '../db/client.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import type { StorageBroker } from '../gateway/storageBroker.ts';
import { requireAuth, requireSysadmin } from '../middleware/auth.ts';
import type { PluginRuntimeLoader } from '../plugins/runtimeLoader.ts';
import type { MinimalArchiveInstaller } from '../runtime/archiveInstaller.ts';
import {
  listeOeffentlichePluginThemes,
  validiereThemeAuswahlFuerInstanz,
} from '../services/themeService.ts';

/**
 * Minimaler Core-Notfall- & System-Admin-Router (`/api/v2/admin/system/*`):
 * - Ausschließlich für Sysadmins zugänglich.
 * - Strikt OHNE Einsicht in vereinsinterne Daten, Mitglieder oder Playbooks (#23).
 */
export function erstelleSystemAdminRouter(params: {
  db: CoreDatabaseClient;
  repo: CoreRepository;
  config: CoreServerConfig;
  storageBroker: StorageBroker;
  runtimeLoader: PluginRuntimeLoader;
  archiveInstaller: MinimalArchiveInstaller;
}): Router {
  const { db, repo, config, storageBroker, runtimeLoader, archiveInstaller } = params;
  const router = Router();
  const auth = requireAuth(repo, config);
  const sysadmin = requireSysadmin();

  router.use(auth, sysadmin);

  router.get('/status', async (_req, res, next) => {
    try {
      const plugins = await repo.listeInstalliertePlugins();
      const appearance = await repo.holeSystemSetting<{ defaultTheme?: string }>('appearance');
      res.json({
        coreVersion: config.coreVersion,
        sdkVersion: config.supportedSdkVersion,
        dbDialekt: db.dialekt,
        allowDevPlugins: config.allowDevPlugins,
        storageProvider: storageBroker.holeProviderInfo(),
        pluginsGesamt: plugins.length,
        pluginsAktiv: plugins.filter((p) => p.enabledGlobally).length,
        instanzTheme: appearance?.defaultTheme?.trim() || STANDARD_THEME_REF,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/plugins', async (_req, res, next) => {
    try {
      const plugins = await repo.listeInstalliertePlugins();
      res.json({ plugins });
    } catch (err) {
      next(err);
    }
  });

  router.post('/plugins/install-archive', async (req, res, next) => {
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const autoEnable = body.autoEnable !== false;
      const autoApproveCapabilities = body.autoApproveCapabilities === true;

      if (typeof body.archiveBase64 === 'string' && body.archiveBase64.trim()) {
        const buffer = Buffer.from(body.archiveBase64.trim(), 'base64');
        const gespeichert = await archiveInstaller.installiereAusBuffer({
          archiveBuffer: buffer,
          sourceUrl: typeof body.fileName === 'string' ? `upload:${body.fileName}` : 'upload',
          autoEnable,
          autoApproveCapabilities,
        });
        res.status(201).json({ plugin: gespeichert });
        return;
      }

      if (typeof body.archiveUrl === 'string' && body.archiveUrl.trim()) {
        const gespeichert = await archiveInstaller.installiereAusUrl(body.archiveUrl.trim(), {
          autoEnable,
          autoApproveCapabilities,
        });
        res.status(201).json({ plugin: gespeichert });
        return;
      }

      res.status(400).json({
        fehler: 'Bitte ein .tar.gz-Archiv (archiveBase64) oder eine https://-URL (archiveUrl) angeben.',
      });
    } catch (err) {
      res.status(400).json({
        fehler: err instanceof Error ? err.message : 'Plugin-Archiv konnte nicht installiert werden.',
      });
    }
  });

  router.patch('/plugins/:pluginId', async (req, res, next) => {
    try {
      const pluginId = String(req.params.pluginId ?? '').trim();
      const vorhanden = await repo.findePlugin(pluginId);
      if (!vorhanden) {
        res.status(404).json({ fehler: `Plugin "${pluginId}" nicht gefunden.` });
        return;
      }

      const body = (req.body ?? {}) as Record<string, unknown>;
      const enabledGlobally =
        typeof body.enabledGlobally === 'boolean' ? body.enabledGlobally : vorhanden.enabledGlobally;

      let approvedCapabilities = vorhanden.approvedCapabilities;
      if (Array.isArray(body.approvedCapabilities)) {
        const angefordert = new Set(vorhanden.manifest.permissions);
        approvedCapabilities = body.approvedCapabilities.filter(
          (c): c is PrivilegiertePluginPermission =>
            typeof c === 'string' &&
            angefordert.has(c as PrivilegiertePluginPermission) &&
            istPrivilegierteCapability(c as PrivilegiertePluginPermission)
        );
      }

      const aktualisiert = await repo.aktualisierePluginStatus(pluginId, {
        enabledGlobally,
        approvedCapabilities,
        lastError: null,
      });

      if (enabledGlobally) {
        try {
          await runtimeLoader.ladeBackendPlugin(pluginId, vorhanden.version);
        } catch (loadErr) {
          const msg = loadErr instanceof Error ? loadErr.message : String(loadErr);
          await repo.aktualisierePluginStatus(pluginId, { lastError: msg });
          res.status(500).json({ fehler: `Plugin-Backend konnte nicht geladen werden: ${msg}` });
          return;
        }
      } else {
        runtimeLoader.entladeBackendPlugin(pluginId);
      }

      res.json({ plugin: aktualisiert });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/plugins/:pluginId', async (req, res, next) => {
    try {
      const pluginId = String(req.params.pluginId ?? '').trim();
      const ok = await archiveInstaller.deinstallierePlugin(pluginId);
      if (!ok) {
        res.status(404).json({ fehler: `Plugin "${pluginId}" nicht gefunden.` });
        return;
      }
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.get('/theme', async (_req, res, next) => {
    try {
      const appearance = await repo.holeSystemSetting<{ defaultTheme?: string }>('appearance');
      const pluginThemes = await listeOeffentlichePluginThemes(repo);
      res.json({
        instanzTheme: appearance?.defaultTheme?.trim() || STANDARD_THEME_REF,
        pluginThemes,
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/theme', async (req, res, next) => {
    try {
      const raw = (req.body as Record<string, unknown> | undefined)?.instanzTheme;
      const check = await validiereThemeAuswahlFuerInstanz(repo, raw);
      if (!check.ok) {
        res.status(check.status).json({ fehler: check.fehler });
        return;
      }
      const nextTheme = check.themeRef ?? STANDARD_THEME_REF;
      await repo.speichereSystemSetting('appearance', { defaultTheme: nextTheme });
      res.json({ instanzTheme: nextTheme });
    } catch (err) {
      next(err);
    }
  });

  // Metadaten-only Speicher-Kontingente & Storage-Node-Zuordnung pro Club (#21, #22, #24)
  router.get('/clubs-storage', async (_req, res, next) => {
    try {
      const clubs = await repo.listeClubs();
      res.json({
        clubs: clubs.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
          speicher: c.speicher,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/clubs/:clubId/storage-quota', async (req, res, next) => {
    try {
      const clubId = String(req.params.clubId ?? '').trim();
      const body = (req.body ?? {}) as Record<string, unknown>;
      const quotaBytes =
        body.quotaBytes === null || body.quotaBytes === ''
          ? null
          : Number(body.quotaBytes);
      if (quotaBytes !== null && (!Number.isFinite(quotaBytes) || quotaBytes <= 0)) {
        res.status(400).json({ fehler: 'quotaBytes muss null (unbegrenzt) oder > 0 sein.' });
        return;
      }
      const softLimitPercent =
        body.softLimitPercent !== undefined ? Number(body.softLimitPercent) : undefined;
      const speicher = await repo.setzeClubSpeicherQuota(clubId, {
        quotaBytes,
        softLimitPercent,
      });
      if (!speicher) {
        res.status(404).json({ fehler: 'Verein nicht gefunden.' });
        return;
      }
      res.json({ speicher });
    } catch (err) {
      next(err);
    }
  });

  router.put('/clubs/:clubId/storage-node', async (req, res, next) => {
    try {
      const clubId = String(req.params.clubId ?? '').trim();
      const nodeId = String((req.body as Record<string, unknown> | undefined)?.nodeId ?? '').trim();
      const speicher = await repo.setzeClubStorageNode(clubId, nodeId);
      if (!speicher) {
        res.status(404).json({ fehler: 'Verein nicht gefunden.' });
        return;
      }
      res.json({ speicher });
    } catch (err) {
      res.status(400).json({ fehler: err instanceof Error ? err.message : 'Node-Zuweisung fehlgeschlagen.' });
    }
  });

  return router;
}

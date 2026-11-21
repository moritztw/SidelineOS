import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { CoreServerConfig } from './config.ts';
import type { CoreDatabaseClient } from './db/client.ts';
import { CoreRepository } from './db/coreRepository.ts';
import { PluginBackendHost } from './plugins/backendHost.ts';
import { erstelleAuthRouter } from './routes/auth.ts';
import { erstellePluginGatewayRouter } from './routes/pluginGateway.ts';
import { erstelleSysadminRouter } from './routes/sysadmin.ts';
import { erstelleTeamRouter } from './routes/teams.ts';

export interface CreateCoreAppOptionen {
  db: CoreDatabaseClient;
  config: CoreServerConfig;
  pluginHost?: PluginBackendHost;
}

/**
 * Erstellt die reine Core-Express-App ohne Vite/HTTP-Server-Bindung
 * (ideal für schnelle API-Integrationstests sowie dev/prod-Wrapper in `server.ts`).
 */
export function erstelleCoreApp(optionen: CreateCoreAppOptionen): {
  app: Express;
  repo: CoreRepository;
  pluginHost: PluginBackendHost;
} {
  const { db, config } = optionen;
  const repo = new CoreRepository(db);
  const pluginHost = optionen.pluginHost ?? new PluginBackendHost(db);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'sidelineos-core',
      db: db.dialekt,
      plugins: pluginHost.listeRegistrierteIds(),
    });
  });

  app.use('/api/v1/auth', erstelleAuthRouter(repo, config));
  app.use('/api/v1/teams', erstelleTeamRouter(repo, config));
  app.use('/api/v1/sysadmin', erstelleSysadminRouter(repo, config));

  const { protectedRouter, publicRouter } = erstellePluginGatewayRouter(repo, config, pluginHost);
  app.use('/api/v1/plugins', protectedRouter);
  app.use('/api/v1/public/plugins', publicRouter);

  // Unbekannte API-Pfade sauber als JSON beantworten statt SPA-HTML auszuliefern
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ fehler: 'API-Endpunkt nicht gefunden.' });
  });

  // Zentraler Fehler-Handler ohne Stacktrace-Leak
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ fehler: 'Ungültiges JSON-Format in der Anfrage.' });
      return;
    }
    console.error('[SidelineOS-Core] Unerwarteter API-Fehler:', err);
    res.status(500).json({ fehler: 'Interner Serverfehler.' });
  });

  return { app, repo, pluginHost };
}

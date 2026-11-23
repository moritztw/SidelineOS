import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { CoreServerConfig } from './config.ts';
import type { CoreDatabaseClient } from './db/client.ts';
import { CoreRepository } from './db/coreRepository.ts';
import { PluginBackendHost } from './plugins/backendHost.ts';
import { PluginRuntimeLoader } from './plugins/runtimeLoader.ts';
import { erstelleAuthRouter } from './routes/auth.ts';
import { erstellePluginGatewayRouter } from './routes/pluginGateway.ts';
import { erstellePluginRuntimeRouter } from './routes/pluginRuntime.ts';
import { erstelleSysadminRouter } from './routes/sysadmin.ts';
import { erstelleTeamRouter } from './routes/teams.ts';
import { PluginInstallerService } from './services/pluginInstaller.ts';
import { S3BrokerService } from './services/s3Broker.ts';
import { S3CleanupService } from './services/s3CleanupService.ts';
import { SmtpService } from './services/smtpService.ts';

export interface CreateCoreAppOptionen {
  db: CoreDatabaseClient;
  config: CoreServerConfig;
  pluginHost?: PluginBackendHost;
  s3Broker?: S3BrokerService;
  s3Cleanup?: S3CleanupService;
  smtpService?: SmtpService;
  pluginInstaller?: PluginInstallerService;
  runtimeLoader?: PluginRuntimeLoader;
}

/**
 * Erstellt die reine Core-Express-App ohne Vite/HTTP-Server-Bindung
 * (ideal für schnelle API-Integrationstests sowie dev/prod-Wrapper in `server.ts`).
 */
export function erstelleCoreApp(optionen: CreateCoreAppOptionen): {
  app: Express;
  repo: CoreRepository;
  pluginHost: PluginBackendHost;
  runtimeLoader: PluginRuntimeLoader;
  s3Broker: S3BrokerService;
  s3Cleanup: S3CleanupService;
  smtpService: SmtpService;
  pluginInstaller: PluginInstallerService;
} {
  const { db, config } = optionen;
  const repo = new CoreRepository(db);
  const s3Broker = optionen.s3Broker ?? new S3BrokerService(repo, config);
  const s3Cleanup = optionen.s3Cleanup ?? new S3CleanupService(db, s3Broker);
  const smtpService = optionen.smtpService ?? new SmtpService(repo, config);
  const pluginInstaller =
    optionen.pluginInstaller ?? new PluginInstallerService(db, repo, config);
  const pluginHost = optionen.pluginHost ?? new PluginBackendHost(db, s3Broker, s3Cleanup);
  const runtimeLoader =
    optionen.runtimeLoader ?? new PluginRuntimeLoader(repo, config, pluginHost);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  const jsonStandard = express.json({ limit: '2mb' });
  const jsonUpload = express.json({ limit: '35mb' });
  app.use((req, res, next) => {
    if (req.path === '/api/v1/sysadmin/plugins/install-upload') {
      jsonUpload(req, res, next);
      return;
    }
    jsonStandard(req, res, next);
  });

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'sidelineos-core',
      version: config.coreVersion,
      db: db.dialekt,
      plugins: pluginHost.listeRegistrierteIds(),
    });
  });

  app.use('/api/v1/auth', erstelleAuthRouter(repo, config));
  app.use('/api/v1/teams', erstelleTeamRouter(repo, config, smtpService));
  app.use(
    '/api/v1/sysadmin',
    erstelleSysadminRouter(repo, config, {
      s3Broker,
      s3Cleanup,
      smtpService,
      pluginInstaller,
      runtimeLoader,
    })
  );

  app.use('/api/v1/plugins/runtime', erstellePluginRuntimeRouter(repo, config, runtimeLoader));

  const { protectedRouter, publicRouter } = erstellePluginGatewayRouter(
    repo,
    config,
    pluginHost,
    s3Broker,
    s3Cleanup
  );
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

  return {
    app,
    repo,
    pluginHost,
    runtimeLoader,
    s3Broker,
    s3Cleanup,
    smtpService,
    pluginInstaller,
  };
}

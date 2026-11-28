import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { CoreServerConfig } from './config.ts';
import type { CoreDatabaseClient } from './db/client.ts';
import { CoreRepository } from './db/coreRepository.ts';
import { StorageBroker } from './gateway/storageBroker.ts';
import { PluginBackendHost } from './plugins/backendHost.ts';
import { PluginRuntimeLoader } from './plugins/runtimeLoader.ts';
import { erstelleAuthRouter } from './routes/auth.ts';
import { erstelleNotificationsRouter } from './routes/notifications.ts';
import { erstellePluginGatewayRouter } from './routes/pluginGateway.ts';
import { erstellePluginRuntimeRouter } from './routes/pluginRuntime.ts';
import { erstelleSystemAdminRouter } from './routes/systemAdmin.ts';
import { MinimalArchiveInstaller } from './runtime/archiveInstaller.ts';
import { NotificationService } from './services/notificationService.ts';

export interface CoreAppBundle {
  app: Express;
  repo: CoreRepository;
  storageBroker: StorageBroker;
  notificationService: NotificationService;
  pluginHost: PluginBackendHost;
  runtimeLoader: PluginRuntimeLoader;
  archiveInstaller: MinimalArchiveInstaller;
}

/**
 * Erstellt die schlanke Micro-Kernel-Express-App von SidelineOS-core v0.2.0.
 */
export function erstelleCoreApp(params: {
  db: CoreDatabaseClient;
  config: CoreServerConfig;
  fetchFn?: typeof fetch;
}): CoreAppBundle {
  const { db, config } = params;
  const app = express();
  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(express.json({ limit: '55mb' }));

  const repo = new CoreRepository(db);
  const storageBroker = new StorageBroker(repo, config);
  const pluginHost = new PluginBackendHost(db, repo, storageBroker);
  const notificationService = new NotificationService(repo, config, pluginHost);
  const runtimeLoader = new PluginRuntimeLoader(repo, config, pluginHost);
  const archiveInstaller = new MinimalArchiveInstaller(
    repo,
    config,
    runtimeLoader,
    params.fetchFn ?? fetch
  );

  pluginHost.setzeNotificationBridge(notificationService);
  pluginHost.setzeArchiveInstaller(archiveInstaller);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: config.coreName,
      coreVersion: config.coreVersion,
      sdkVersion: config.supportedSdkVersion,
      dbDialekt: db.dialekt,
      storageProviderAktiv: storageBroker.holeProviderInfo().konfiguriert,
    });
  });

  app.use('/api/v2/auth', erstelleAuthRouter(repo, config));
  app.use('/api/v2/notifications', erstelleNotificationsRouter(repo, config));
  app.use(
    '/api/v2/admin/system',
    erstelleSystemAdminRouter({
      db,
      repo,
      config,
      storageBroker,
      runtimeLoader,
      archiveInstaller,
    })
  );
  app.use('/api/v2/plugins/runtime', erstellePluginRuntimeRouter(repo, config, runtimeLoader));

  const { protectedRouter, publicRouter } = erstellePluginGatewayRouter({
    repo,
    config,
    pluginHost,
    storageBroker,
    notificationService,
  });
  app.use('/api/v2/plugins', protectedRouter);
  app.use('/api/v2/public/plugins', publicRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ fehler: 'API-Endpunkt nicht gefunden.' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const nachricht = err instanceof Error ? err.message : 'Interner Serverfehler.';
    console.error('[SidelineOS-Core] Unerwarteter API-Fehler:', err);
    res.status(500).json({ fehler: nachricht });
  });

  return {
    app,
    repo,
    storageBroker,
    notificationService,
    pluginHost,
    runtimeLoader,
    archiveInstaller,
  };
}

import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { erstelleCoreApp } from './src/server/app.ts';
import { bootstrapCoreInstance } from './src/server/bootstrap.ts';
import { loadCoreConfig } from './src/server/config.ts';
import { erstelleDatenbankClient } from './src/server/db/client.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const config = loadCoreConfig();
  const db = await erstelleDatenbankClient(config);
  const bootstrap = await bootstrapCoreInstance(db, config);

  const { app, runtimeLoader } = erstelleCoreApp({ db, config });
  const runtimeStart = await runtimeLoader.ladeAlleInstalliertenBackendPlugins();
  if (runtimeStart.geladen.length > 0) {
    console.log(`[SidelineOS-Core] Dynamische Plugins geladen: ${runtimeStart.geladen.join(', ')}`);
  }

  if (config.nodeEnv !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
        return;
      }
      res.status(404).send('SidelineOS-Core Build fehlt (npm run build ausführen).');
    });
  }

  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `[SidelineOS-Core] Server aktiv auf Port ${config.port} (DB: ${db.dialekt}, Benutzer: ${bootstrap.anzahlBenutzer})`
    );
  });

  const beenden = async () => {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', beenden);
  process.on('SIGTERM', beenden);
}

startServer().catch((err) => {
  console.error('[SidelineOS-Core] Start fehlgeschlagen:', err);
  process.exit(1);
});

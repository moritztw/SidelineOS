import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { requireAuth } from '../middleware/auth.ts';
import type { PluginRuntimeLoader } from '../plugins/runtimeLoader.ts';

type SharedModuleKey =
  | 'react'
  | 'reactJsxRuntime'
  | 'reactDom'
  | 'reactDomClient'
  | 'lucideReact'
  | 'pluginSdk';

const SHIM_KONFIG: Record<
  string,
  { runtimeKey: SharedModuleKey; importPath: string }
> = {
  'react.js': { runtimeKey: 'react', importPath: 'react' },
  'react-jsx-runtime.js': { runtimeKey: 'reactJsxRuntime', importPath: 'react/jsx-runtime' },
  'react-dom.js': { runtimeKey: 'reactDom', importPath: 'react-dom' },
  'react-dom-client.js': { runtimeKey: 'reactDomClient', importPath: 'react-dom/client' },
  'lucide-react.js': { runtimeKey: 'lucideReact', importPath: 'lucide-react' },
  'sdk.js': { runtimeKey: 'pluginSdk', importPath: '../../sdk/plugin.ts' },
};

const RESERVIERTE_JS_WOERTER = new Set([
  'default',
  '__esModule',
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'implements',
  'interface',
  'package',
  'private',
  'protected',
  'public',
  'await',
]);

const GUELTIGER_JS_IDENT = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const MIME_TYPEN: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

const shimCache = new Map<string, string>();

async function baueSharedShimCode(shimName: string): Promise<string | null> {
  const gecached = shimCache.get(shimName);
  if (gecached) return gecached;

  const konfig = SHIM_KONFIG[shimName];
  if (!konfig) return null;

  const geladen = (await import(konfig.importPath)) as Record<string, unknown>;
  const defaultBasis =
    geladen.default && typeof geladen.default === 'object'
      ? (geladen.default as Record<string, unknown>)
      : geladen;

  const alleKeys = new Set<string>([
    ...Object.keys(geladen),
    ...Object.keys(defaultBasis),
  ]);

  const benannteExporte = Array.from(alleKeys)
    .filter((k) => GUELTIGER_JS_IDENT.test(k) && !RESERVIERTE_JS_WOERTER.has(k))
    .sort();

  const zeilen = [
    `const __rt = globalThis.__SIDELINE_RUNTIME__;`,
    `if (!__rt || !__rt.${konfig.runtimeKey}) {`,
    `  throw new Error("SidelineOS Shared Runtime (${konfig.runtimeKey}) ist nicht initialisiert.");`,
    `}`,
    `const __mod = __rt.${konfig.runtimeKey};`,
    `export default (__mod && __mod.default !== undefined ? __mod.default : __mod);`,
    ...benannteExporte.map(
      (key) => `export const ${key} = __mod?.${key} ?? __mod?.default?.${key};`
    ),
  ];

  const code = zeilen.join('\n') + '\n';
  shimCache.set(shimName, code);
  return code;
}

/**
 * Stellt geschützte Client-Bundles installierter Plugins sowie gemeinsame Browser-ESM-Shims bereit,
 * sodass externe Plugins exakt dieselbe React-/SDK-Instanz wie der Core teilen.
 */
export function erstellePluginRuntimeRouter(
  repo: CoreRepository,
  config: CoreServerConfig,
  runtimeLoader: PluginRuntimeLoader
): Router {
  const router = Router();
  const auth = requireAuth(repo, config);

  router.get('/_shared/:shimName', async (req, res, next) => {
    try {
      const shimName = String(req.params.shimName ?? '').trim();
      const code = await baueSharedShimCode(shimName);
      if (!code) {
        res.status(404).type('text/plain').send('Shared runtime shim not found.');
        return;
      }
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.status(200).send(code);
    } catch (err) {
      next(err);
    }
  });

  router.get('/manifest', auth, async (_req, res, next) => {
    try {
      const daten = await runtimeLoader.listeFrontendRuntimeEintraege({ nurPublicShare: false });
      res.status(200).json(daten);
    } catch (err) {
      next(err);
    }
  });

  router.get('/public-manifest', async (_req, res, next) => {
    try {
      const daten = await runtimeLoader.listeFrontendRuntimeEintraege({ nurPublicShare: true });
      res.status(200).json({ bundles: daten.bundles });
    } catch (err) {
      next(err);
    }
  });

  router.get('/bundles/:pluginId/:version/*', async (req, res, next) => {
    try {
      const pluginId = String(req.params.pluginId ?? '').trim();
      const version = String(req.params.version ?? '').trim();
      const wildcardPfad = String((req.params as Record<string, string>)[0] ?? '').trim();

      if (!wildcardPfad || wildcardPfad.includes('..') || wildcardPfad.includes('\\')) {
        res.status(400).json({ fehler: 'Ungültiger Bundle-Dateipfad.' });
        return;
      }

      const status = await repo.findePluginStatus(pluginId);
      if (!status || !status.enabledGlobally || status.installedVersion !== version) {
        res.status(404).json({ fehler: 'Plugin-Bundle nicht gefunden oder deaktiviert.' });
        return;
      }

      const versionDir = runtimeLoader.loesePluginVersionVerzeichnisAuf(pluginId, version);
      if (!versionDir) {
        res.status(400).json({ fehler: 'Ungültige Plugin-Version.' });
        return;
      }

      const distBasis = path.resolve(versionDir, 'dist');
      const relBereinigt = wildcardPfad.replace(/^\/+/, '');
      const vollPfad = path.resolve(distBasis, relBereinigt);
      if (!vollPfad.startsWith(distBasis + path.sep)) {
        res.status(403).json({ fehler: 'Zugriff außerhalb des Plugin-dist-Verzeichnisses verboten.' });
        return;
      }

      let inhalt: Buffer;
      try {
        const stat = await fs.stat(vollPfad);
        if (!stat.isFile()) {
          res.status(404).json({ fehler: 'Bundle-Datei nicht gefunden.' });
          return;
        }
        inhalt = await fs.readFile(vollPfad);
      } catch {
        res.status(404).json({ fehler: 'Bundle-Datei nicht gefunden.' });
        return;
      }

      const ext = path.extname(vollPfad).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPEN[ext] ?? 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.status(200).send(inhalt);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

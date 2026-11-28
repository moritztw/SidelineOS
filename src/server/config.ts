import crypto from 'node:crypto';
import fs from 'node:fs';
import { SIDELINE_SDK_VERSION, type PluginSdkVersion } from '../sdk/plugin.ts';
import { holeAktuelleBrandKonfig } from '../shared/brand.ts';
import { normalisiereSprache, type UnterstuetzteSprache } from '../shared/i18n.ts';

export const PACKAGE_CORE_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { version?: string };
    return pkg.version?.trim() || '0.2.0';
  } catch {
    return '0.2.0';
  }
})();

export interface CoreServerConfig {
  nodeEnv: string;
  port: number;
  appUrl: string;
  brandName: string;
  coreName: string;
  defaultLocale: UnterstuetzteSprache;
  databaseUrl?: string;
  pgliteDataDir?: string;
  sessionSecret: string;
  sessionTtlStunden: number;
  initialSysadmin?: {
    email: string;
    username: string;
    password: string;
  };
  coreVersion: string;
  supportedSdkVersion: PluginSdkVersion;
  pluginDataDir: string;
  coreBootstrapPlugins: string[];
  maxUploadBytes: number;
  allowDevPlugins: boolean;
}

function parseBool(wert: string | undefined, fallback: boolean): boolean {
  if (!wert) return fallback;
  const norm = wert.trim().toLowerCase();
  if (norm === 'true' || norm === '1' || norm === 'yes') return true;
  if (norm === 'false' || norm === '0' || norm === 'no') return false;
  return fallback;
}

function parseListe(wert: string | undefined): string[] {
  if (!wert) return [];
  return wert
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Parst und validiert alle schlanken Core-v0.2.0-Umgebungsvariablen.
 */
export function loadCoreConfig(
  env: Record<string, string | undefined> = process.env
): CoreServerConfig {
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const port = Number(env.PORT) > 0 ? Number(env.PORT) : 3000;
  const appUrl = env.APP_URL?.trim() || `http://localhost:${port}`;
  const brandKonfig = holeAktuelleBrandKonfig(env.APP_BRAND_NAME);
  const defaultLocale = normalisiereSprache(env.DEFAULT_LOCALE, 'de');
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  const pgliteDataDir = env.PGLITE_DATA_DIR?.trim() || undefined;

  const rawSecret = env.SESSION_SECRET?.trim();
  const sessionSecret =
    rawSecret && rawSecret.length >= 16
      ? rawSecret
      : crypto.randomBytes(32).toString('hex');

  const sessionTtlStunden =
    Number(env.SESSION_TTL_HOURS) > 0 ? Number(env.SESSION_TTL_HOURS) : 24 * 7;

  const sysEmail = env.INITIAL_SYSADMIN_EMAIL?.trim();
  const sysUser = env.INITIAL_SYSADMIN_USERNAME?.trim();
  const sysPass = env.INITIAL_SYSADMIN_PASSWORD?.trim();

  const initialSysadmin =
    sysEmail && sysUser && sysPass && sysPass !== 'CHANGE_ME_STRONG_PASSWORD'
      ? {
          email: sysEmail.toLowerCase(),
          username: sysUser.toLowerCase(),
          password: sysPass,
        }
      : undefined;

  const rawMaxUpload = Number(env.MAX_UPLOAD_BYTES);
  const defaultMaxUploadBytes = 5 * 1024 * 1024 * 1024; // 5 GiB

  return {
    nodeEnv,
    port,
    appUrl,
    brandName: brandKonfig.produktName,
    coreName: brandKonfig.coreName,
    defaultLocale,
    databaseUrl,
    pgliteDataDir,
    sessionSecret,
    sessionTtlStunden,
    initialSysadmin,
    coreVersion: env.CORE_VERSION?.trim() || PACKAGE_CORE_VERSION,
    supportedSdkVersion: SIDELINE_SDK_VERSION,
    pluginDataDir: env.PLUGIN_DATA_DIR?.trim() || '.sidelineos-data/plugins',
    coreBootstrapPlugins: parseListe(env.CORE_BOOTSTRAP_PLUGINS),
    maxUploadBytes:
      rawMaxUpload > 0 && Number.isFinite(rawMaxUpload)
        ? Math.floor(rawMaxUpload)
        : defaultMaxUploadBytes,
    allowDevPlugins: parseBool(env.ALLOW_DEV_PLUGINS, false),
  };
}

import crypto from 'node:crypto';
import { parseAktivierteModuleAusEnv } from '../core/pluginRegistry.ts';
import {
  OFFIZIELLER_PLUGIN_KATALOG,
  STANDARD_AKTIVIERTE_PLUGIN_IDS,
} from '../core/pluginStoreCatalog.ts';
import type { PluginId } from '../shared/types.ts';

export interface CoreServerConfig {
  nodeEnv: string;
  port: number;
  appUrl: string;
  databaseUrl?: string;
  pgliteDataDir?: string;
  sessionSecret: string;
  sessionTtlStunden: number;
  initialSysadmin?: {
    email: string;
    username: string;
    password: string;
  };
  enabledModules: PluginId[];
}

/**
 * Parst und validiert alle Core-Umgebungsvariablen (ohne Browser-Wizard).
 */
export function loadCoreConfig(env: Record<string, string | undefined> = process.env): CoreServerConfig {
  const nodeEnv = env.NODE_ENV?.trim() || 'development';
  const port = Number(env.PORT) > 0 ? Number(env.PORT) : 3000;
  const appUrl = env.APP_URL?.trim() || `http://localhost:${port}`;
  const databaseUrl = env.DATABASE_URL?.trim() || undefined;
  const pgliteDataDir = env.PGLITE_DATA_DIR?.trim() || undefined;

  const rawSecret = env.SESSION_SECRET?.trim();
  const sessionSecret = rawSecret && rawSecret.length >= 16
    ? rawSecret
    : crypto.randomBytes(32).toString('hex');

  const sessionTtlStunden = Number(env.SESSION_TTL_HOURS) > 0 ? Number(env.SESSION_TTL_HOURS) : 24 * 7;

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

  const verfuegbareIds = OFFIZIELLER_PLUGIN_KATALOG.map((e) => e.manifest.id);
  const enabledModules = parseAktivierteModuleAusEnv(
    env.ENABLED_MODULES,
    verfuegbareIds,
    STANDARD_AKTIVIERTE_PLUGIN_IDS
  );

  return {
    nodeEnv,
    port,
    appUrl,
    databaseUrl,
    pgliteDataDir,
    sessionSecret,
    sessionTtlStunden,
    initialSysadmin,
    enabledModules,
  };
}

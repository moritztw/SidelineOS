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
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
    cleanupRetentionDays: number;
  };
  smtp: {
    host: string;
    port: number;
    benutzer: string;
    passwort: string;
    absender: string;
    tlsAktiv: boolean;
  };
  coreVersion: string;
  supportedSdkVersion: '1.0';
  pluginDataDir: string;
  devAllowGitInstall: boolean;
  disableUpdateCheck: boolean;
  coreGithubRepo: string;
  githubApiBaseUrl: string;
}

function parseBool(wert: string | undefined, fallback: boolean): boolean {
  if (!wert) return fallback;
  const norm = wert.trim().toLowerCase();
  if (norm === 'true' || norm === '1' || norm === 'yes') return true;
  if (norm === 'false' || norm === '0' || norm === 'no') return false;
  return fallback;
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

  const rawS3Access = env.S3_ACCESS_KEY?.trim() || '';
  const rawS3Secret = env.S3_SECRET_KEY?.trim() || '';
  const s3AccessKey = rawS3Access === 'YOUR_S3_ACCESS_KEY' ? '' : rawS3Access;
  const s3SecretKey = rawS3Secret === 'YOUR_S3_SECRET_KEY' ? '' : rawS3Secret;
  const s3Retention = Number(env.S3_CLEANUP_RETENTION_DAYS);

  const rawSmtpHost = env.SMTP_HOST?.trim() || '';
  const rawSmtpPass = env.SMTP_PASSWORD?.trim() || '';
  const smtpHost = rawSmtpHost === 'smtp.example.org' ? '' : rawSmtpHost;
  const smtpPass = rawSmtpPass === 'YOUR_SMTP_PASSWORD' ? '' : rawSmtpPass;
  const smtpPort = Number(env.SMTP_PORT);

  const devAllowGitInstall =
    nodeEnv !== 'production' && parseBool(env.DEV_ALLOW_GIT_INSTALL, nodeEnv === 'development');

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
    s3: {
      endpoint: env.S3_ENDPOINT?.trim() || '',
      region: env.S3_REGION?.trim() || 'eu-central-1',
      bucket: env.S3_BUCKET?.trim() || '',
      accessKey: s3AccessKey,
      secretKey: s3SecretKey,
      forcePathStyle: parseBool(env.S3_FORCE_PATH_STYLE, true),
      cleanupRetentionDays: s3Retention > 0 ? Math.min(s3Retention, 365) : 14,
    },
    smtp: {
      host: smtpHost,
      port: smtpPort > 0 && smtpPort <= 65535 ? smtpPort : 587,
      benutzer: env.SMTP_USER?.trim() || '',
      passwort: smtpPass,
      absender: env.SMTP_FROM?.trim() || 'SidelineOS <noreply@sidelineos.local>',
      tlsAktiv: parseBool(env.SMTP_TLS, true),
    },
    coreVersion: env.CORE_VERSION?.trim() || '0.1.0',
    supportedSdkVersion: '1.0',
    pluginDataDir: env.PLUGIN_DATA_DIR?.trim() || '.sidelineos-data/plugins',
    devAllowGitInstall,
    disableUpdateCheck: parseBool(env.DISABLE_UPDATE_CHECK, false),
    coreGithubRepo: env.CORE_GITHUB_REPO?.trim() || 'sidelineos/sidelineos-core',
    githubApiBaseUrl: (env.GITHUB_API_BASE_URL?.trim() || 'https://api.github.com').replace(
      /\/+$/,
      ''
    ),
  };
}

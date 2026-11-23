import crypto from 'node:crypto';
import fs from 'node:fs';
import { holeAktuelleBrandKonfig } from '../shared/brand.ts';
import { normalisiereSprache, type UnterstuetzteSprache } from '../shared/i18n.ts';

const PACKAGE_CORE_VERSION = (() => {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(new URL('../../package.json', import.meta.url), 'utf8')
    ) as { version?: string };
    return pkg.version?.trim() || '0.1.0';
  } catch {
    return '0.1.0';
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
  s3: {
    endpoint: string;
    region: string;
    bucket: string;
    accessKey: string;
    secretKey: string;
    forcePathStyle: boolean;
    cleanupRetentionDays: number;
    maxUploadBytes: number;
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
  const brandKonfig = holeAktuelleBrandKonfig(env.APP_BRAND_NAME);
  const defaultLocale = normalisiereSprache(env.DEFAULT_LOCALE, 'de');
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

  const rawS3Access = env.S3_ACCESS_KEY?.trim() || '';
  const rawS3Secret = env.S3_SECRET_KEY?.trim() || '';
  const s3AccessKey = rawS3Access === 'YOUR_S3_ACCESS_KEY' ? '' : rawS3Access;
  const s3SecretKey = rawS3Secret === 'YOUR_S3_SECRET_KEY' ? '' : rawS3Secret;
  const s3Retention = Number(env.S3_CLEANUP_RETENTION_DAYS);
  const s3MaxUploadRaw = Number(env.S3_MAX_UPLOAD_BYTES);
  const defaultMaxUploadBytes = 5 * 1024 * 1024 * 1024; // 5 GiB Standardlimit für Multipart-Uploads

  const rawSmtpHost = env.SMTP_HOST?.trim() || '';
  const rawSmtpPass = env.SMTP_PASSWORD?.trim() || '';
  const smtpHost = rawSmtpHost === 'smtp.example.org' ? '' : rawSmtpHost;
  const smtpPass = rawSmtpPass === 'YOUR_SMTP_PASSWORD' ? '' : rawSmtpPass;
  const smtpPort = Number(env.SMTP_PORT);

  const devAllowGitInstall = parseBool(env.DEV_ALLOW_GIT_INSTALL, false);

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
    s3: {
      endpoint: env.S3_ENDPOINT?.trim() || '',
      region: env.S3_REGION?.trim() || 'eu-central-1',
      bucket: env.S3_BUCKET?.trim() || '',
      accessKey: s3AccessKey,
      secretKey: s3SecretKey,
      forcePathStyle: parseBool(env.S3_FORCE_PATH_STYLE, true),
      cleanupRetentionDays: s3Retention > 0 ? Math.min(s3Retention, 365) : 14,
      maxUploadBytes:
        s3MaxUploadRaw > 0 && Number.isFinite(s3MaxUploadRaw)
          ? Math.floor(s3MaxUploadRaw)
          : defaultMaxUploadBytes,
    },
    smtp: {
      host: smtpHost,
      port: smtpPort > 0 && smtpPort <= 65535 ? smtpPort : 587,
      benutzer: env.SMTP_USER?.trim() || '',
      passwort: smtpPass,
      absender: env.SMTP_FROM?.trim() || `${brandKonfig.produktName} <noreply@sidelineos.local>`,
      tlsAktiv: parseBool(env.SMTP_TLS, true),
    },
    coreVersion: env.CORE_VERSION?.trim() || PACKAGE_CORE_VERSION,
    supportedSdkVersion: '1.0',
    pluginDataDir: env.PLUGIN_DATA_DIR?.trim() || '.sidelineos-data/plugins',
    devAllowGitInstall,
    disableUpdateCheck: parseBool(env.DISABLE_UPDATE_CHECK, false),
    coreGithubRepo: env.CORE_GITHUB_REPO?.trim() || 'moritztw/SidelineOS-core',
    githubApiBaseUrl: (env.GITHUB_API_BASE_URL?.trim() || 'https://api.github.com').replace(
      /\/+$/,
      ''
    ),
  };
}

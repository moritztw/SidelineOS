import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  PluginManifest,
  PluginS3Scope,
  S3MultipartPartRef,
} from '../../sdk/plugin.ts';
import type { S3Konfiguration } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';
import { entschluesseleGeheimnis, verschluesseleGeheimnis } from '../security.ts';

const SETTING_KEY_S3 = 's3';

interface StoredS3Setting {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKeyEncrypted: string;
  forcePathStyle: boolean;
  cleanupRetentionDays: number;
}

export interface VollS3Konfiguration {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle: boolean;
  cleanupRetentionDays: number;
}

export interface S3UpdatePayload {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey?: string;
  clearSecretKey?: boolean;
  forcePathStyle: boolean;
  cleanupRetentionDays?: number;
}

export interface S3ClientAdapter {
  send(command: unknown): Promise<unknown>;
}

export type S3ClientFactory = (konfig: VollS3Konfiguration) => S3ClientAdapter;
export type S3PresignerFn = (
  client: S3ClientAdapter,
  command: PutObjectCommand | GetObjectCommand | UploadPartCommand,
  options: { expiresIn: number }
) => Promise<string>;

const GUELTIGER_MIME_TYP =
  /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*(\s*;[^\u0000-\u001f]*)?$/;

export function validiereUploadMetadaten(params: {
  contentType?: string;
  fileSizeBytes?: number;
  maxUploadBytes: number;
}): { contentType?: string } {
  let bereinigterTyp: string | undefined;
  if (typeof params.contentType === 'string' && params.contentType.trim().length > 0) {
    const typ = params.contentType.trim();
    if (!GUELTIGER_MIME_TYP.test(typ)) {
      throw new Error('Ungültiger Content-Type für S3-Upload.');
    }
    bereinigterTyp = typ;
  }

  if (params.fileSizeBytes !== undefined) {
    if (
      typeof params.fileSizeBytes !== 'number' ||
      !Number.isFinite(params.fileSizeBytes) ||
      params.fileSizeBytes <= 0
    ) {
      throw new Error('Dateigröße (fileSizeBytes) muss größer als 0 sein.');
    }
    if (params.fileSizeBytes > params.maxUploadBytes) {
      throw new Error(
        `Datei überschreitet das konfigurierte Upload-Limit (${params.maxUploadBytes} Bytes).`
      );
    }
  }

  return { contentType: bereinigterTyp };
}

export function validiereS3EndpointUrl(endpoint: string): { ok: boolean; fehler?: string } {
  const bereinigt = endpoint.trim();
  if (!bereinigt) return { ok: true };
  try {
    const parsed = new URL(bereinigt);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, fehler: 'S3-Endpoint muss http:// oder https:// verwenden.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, fehler: 'Ungültige S3-Endpoint-URL.' };
  }
}

export function ermittleTeamPluginPrefix(
  teamId: string,
  pluginId: string,
  s3Prefix?: string
): string {
  const cleanTeam = teamId.trim();
  const cleanPlugin = pluginId.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(cleanTeam)) {
    throw new Error('Ungültige Team-ID für S3-Präfix.');
  }
  if (!/^[a-z0-9-]+$/.test(cleanPlugin)) {
    throw new Error('Ungültige Plugin-ID für S3-Präfix.');
  }

  const rawPluginPrefix = (s3Prefix ?? `plugins/${cleanPlugin}`).replace(/^\/+|\/+$/g, '');
  if (!rawPluginPrefix || rawPluginPrefix.includes('..') || rawPluginPrefix.includes('\\')) {
    throw new Error('Ungültiger Plugin-S3-Präfix im Manifest.');
  }
  return `teams/${cleanTeam}/${rawPluginPrefix}/`;
}

/**
 * Validiert und normalisiert einen S3-Objektschlüssel strikt auf das eigene Team-/Plugin-Präfix.
 * Verhindert Path-Traversal (`..`) sowie Mandanten- oder Plugin-übergreifenden Zugriff.
 */
export function normalisiereUndPruefeS3Key(params: {
  teamId: string;
  pluginId: string;
  s3Prefix?: string;
  objectPath: string;
}): { prefix: string; key: string } {
  const prefix = ermittleTeamPluginPrefix(params.teamId, params.pluginId, params.s3Prefix);
  const roh = params.objectPath.trim().replace(/^\/+/, '');
  if (!roh || roh.includes('\\') || /[\u0000-\u001f]/.test(roh)) {
    throw new Error('Ungültiger S3-Objektpfad.');
  }

  const ohnePrefix = roh.startsWith(prefix) ? roh.slice(prefix.length) : roh;
  const segmente = ohnePrefix.split('/').filter((s) => s.length > 0);
  if (segmente.length === 0 || segmente.some((s) => s === '.' || s === '..')) {
    throw new Error('S3-Objektpfad enthält ungültige Segmente.');
  }

  const key = `${prefix}${segmente.join('/')}`;
  if (!key.startsWith(prefix)) {
    throw new Error('S3-Zugriff außerhalb des Plugin-Präfixes verweigert.');
  }

  return { prefix, key };
}

export function baueS3ClientKonfig(konfig: VollS3Konfiguration) {
  return {
    region: konfig.region || 'eu-central-1',
    ...(konfig.endpoint ? { endpoint: konfig.endpoint } : {}),
    forcePathStyle: konfig.forcePathStyle,
    // Verhindert automatische CRC32-Header in Presigned PUT-URLs (z. B. bei Cloudflare R2 Browser-Uploads)
    requestChecksumCalculation: 'WHEN_REQUIRED' as const,
    responseChecksumValidation: 'WHEN_REQUIRED' as const,
    credentials: {
      accessKeyId: konfig.accessKey,
      secretAccessKey: konfig.secretKey,
    },
    requestHandler: {
      requestTimeout: 5000,
    },
  };
}

function defaultClientFactory(konfig: VollS3Konfiguration): S3ClientAdapter {
  return new S3Client(baueS3ClientKonfig(konfig)) as unknown as S3ClientAdapter;
}

async function defaultPresigner(
  client: S3ClientAdapter,
  command: PutObjectCommand | GetObjectCommand | UploadPartCommand,
  options: { expiresIn: number }
): Promise<string> {
  const s3 = client as unknown as S3Client;
  if (command instanceof UploadPartCommand) {
    return getSignedUrl(s3, command, options);
  }
  if (command instanceof GetObjectCommand) {
    return getSignedUrl(s3, command, options);
  }
  return getSignedUrl(s3, command, options);
}

export class S3BrokerService {
  private readonly clientFactory: S3ClientFactory;
  private readonly presigner: S3PresignerFn;

  constructor(
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig,
    optionen: { clientFactory?: S3ClientFactory; presigner?: S3PresignerFn } = {}
  ) {
    this.clientFactory = optionen.clientFactory ?? defaultClientFactory;
    this.presigner = optionen.presigner ?? defaultPresigner;
  }

  async holeEffektiveKonfig(): Promise<VollS3Konfiguration> {
    const gespeichert = await this.repo.holeSystemSetting<StoredS3Setting>(SETTING_KEY_S3);
    if (!gespeichert) {
      return { ...this.config.s3 };
    }
    const entschluesselt = gespeichert.secretKeyEncrypted
      ? entschluesseleGeheimnis(gespeichert.secretKeyEncrypted, this.config.sessionSecret)
      : '';

    return {
      endpoint: gespeichert.endpoint ?? this.config.s3.endpoint,
      region: gespeichert.region || this.config.s3.region || 'eu-central-1',
      bucket: gespeichert.bucket ?? this.config.s3.bucket,
      accessKey: gespeichert.accessKey ?? this.config.s3.accessKey,
      secretKey: entschluesselt || this.config.s3.secretKey,
      forcePathStyle:
        typeof gespeichert.forcePathStyle === 'boolean'
          ? gespeichert.forcePathStyle
          : this.config.s3.forcePathStyle,
      cleanupRetentionDays:
        Number(gespeichert.cleanupRetentionDays) > 0
          ? Number(gespeichert.cleanupRetentionDays)
          : this.config.s3.cleanupRetentionDays,
    };
  }

  async holeMaskierteKonfig(): Promise<S3Konfiguration> {
    const voll = await this.holeEffektiveKonfig();
    const konfiguriert = Boolean(voll.bucket && voll.accessKey && voll.secretKey);
    return {
      endpoint: voll.endpoint,
      region: voll.region,
      bucket: voll.bucket,
      accessKey: voll.accessKey,
      forcePathStyle: voll.forcePathStyle,
      cleanupRetentionDays: voll.cleanupRetentionDays,
      hatSecretKey: Boolean(voll.secretKey),
      konfiguriert,
    };
  }

  async speichereKonfig(input: S3UpdatePayload): Promise<S3Konfiguration> {
    const endpoint = input.endpoint.trim();
    const urlCheck = validiereS3EndpointUrl(endpoint);
    if (!urlCheck.ok) {
      throw new Error(urlCheck.fehler);
    }

    const region = input.region.trim() || 'eu-central-1';
    const bucket = input.bucket.trim();
    const accessKey = input.accessKey.trim();
    const retentionRaw = Number(input.cleanupRetentionDays);
    const cleanupRetentionDays =
      retentionRaw > 0 && retentionRaw <= 365 ? Math.floor(retentionRaw) : 14;

    const aktuell = await this.holeEffektiveKonfig();
    let naechstesSecret = aktuell.secretKey;
    if (input.clearSecretKey) {
      naechstesSecret = '';
    } else if (typeof input.secretKey === 'string' && input.secretKey.trim().length > 0) {
      naechstesSecret = input.secretKey.trim();
    }

    const zuSpeichern: StoredS3Setting = {
      endpoint,
      region,
      bucket,
      accessKey,
      secretKeyEncrypted: naechstesSecret
        ? verschluesseleGeheimnis(naechstesSecret, this.config.sessionSecret)
        : '',
      forcePathStyle: Boolean(input.forcePathStyle),
      cleanupRetentionDays,
    };

    await this.repo.speichereSystemSetting(SETTING_KEY_S3, zuSpeichern);
    return this.holeMaskierteKonfig();
  }

  async testeVerbindung(override?: Partial<S3UpdatePayload>): Promise<{
    ok: boolean;
    nachricht: string;
  }> {
    const basis = await this.holeEffektiveKonfig();
    const kandidat: VollS3Konfiguration = {
      endpoint: typeof override?.endpoint === 'string' ? override.endpoint.trim() : basis.endpoint,
      region:
        typeof override?.region === 'string' && override.region.trim()
          ? override.region.trim()
          : basis.region,
      bucket: typeof override?.bucket === 'string' ? override.bucket.trim() : basis.bucket,
      accessKey:
        typeof override?.accessKey === 'string' ? override.accessKey.trim() : basis.accessKey,
      secretKey:
        typeof override?.secretKey === 'string' && override.secretKey.trim()
          ? override.secretKey.trim()
          : basis.secretKey,
      forcePathStyle:
        typeof override?.forcePathStyle === 'boolean'
          ? override.forcePathStyle
          : basis.forcePathStyle,
      cleanupRetentionDays: basis.cleanupRetentionDays,
    };

    const urlCheck = validiereS3EndpointUrl(kandidat.endpoint);
    if (!urlCheck.ok) {
      return { ok: false, nachricht: urlCheck.fehler! };
    }
    if (!kandidat.bucket || !kandidat.accessKey || !kandidat.secretKey) {
      return {
        ok: false,
        nachricht: 'Bucket, Access Key ID und Secret Access Key müssen ausgefüllt sein.',
      };
    }

    try {
      const client = this.clientFactory(kandidat);
      await client.send(new HeadBucketCommand({ Bucket: kandidat.bucket }));
      return {
        ok: true,
        nachricht: `S3-Verbindung zu Bucket "${kandidat.bucket}" (${kandidat.region}) erfolgreich.`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : 'Unbekannter S3-Fehler';
      return {
        ok: false,
        nachricht: `S3-Verbindung fehlgeschlagen: ${detail}`,
      };
    }
  }

  private async holeAktivenClient(): Promise<VollS3Konfiguration> {
    const konfig = await this.holeEffektiveKonfig();
    if (!konfig.bucket || !konfig.accessKey || !konfig.secretKey) {
      throw new Error(
        'S3 Object Storage ist noch nicht vollständig konfiguriert (Sysadmin -> S3 Object Storage).'
      );
    }
    return konfig;
  }

  async erzeugePresignedUploadUrl(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPath: string;
    contentType?: string;
    fileSizeBytes?: number;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; expiresIn: number }> {
    const { contentType } = validiereUploadMetadaten({
      contentType: params.contentType,
      fileSizeBytes: params.fileSizeBytes,
      maxUploadBytes: this.config.s3.maxUploadBytes,
    });
    const konfig = await this.holeAktivenClient();
    const { key } = normalisiereUndPruefeS3Key({
      teamId: params.teamId,
      pluginId: params.pluginId,
      s3Prefix: params.manifest.s3Prefix,
      objectPath: params.objectPath,
    });
    const expiresIn = clampAblaufzeit(params.expiresInSeconds, 900);
    const client = this.clientFactory(konfig);
    const cmd = new PutObjectCommand({
      Bucket: konfig.bucket,
      Key: key,
      ...(contentType ? { ContentType: contentType } : {}),
    });
    const url = await this.presigner(client, cmd, { expiresIn });
    return { url, key, expiresIn };
  }

  async starteMultipartUpload(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPath: string;
    contentType?: string;
    fileSizeBytes?: number;
  }): Promise<{ uploadId: string; key: string; maxFileSizeBytes: number }> {
    const { contentType } = validiereUploadMetadaten({
      contentType: params.contentType,
      fileSizeBytes: params.fileSizeBytes,
      maxUploadBytes: this.config.s3.maxUploadBytes,
    });
    const konfig = await this.holeAktivenClient();
    const { key } = normalisiereUndPruefeS3Key({
      teamId: params.teamId,
      pluginId: params.pluginId,
      s3Prefix: params.manifest.s3Prefix,
      objectPath: params.objectPath,
    });
    const client = this.clientFactory(konfig);
    const antwort = (await client.send(
      new CreateMultipartUploadCommand({
        Bucket: konfig.bucket,
        Key: key,
        ...(contentType ? { ContentType: contentType } : {}),
      })
    )) as { UploadId?: string };

    if (!antwort?.UploadId) {
      throw new Error('S3 hat keine UploadId für den Multipart-Upload zurückgegeben.');
    }
    return {
      uploadId: antwort.UploadId,
      key,
      maxFileSizeBytes: this.config.s3.maxUploadBytes,
    };
  }

  async erzeugeMultipartPartUploadUrl(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPath: string;
    uploadId: string;
    partNumber: number;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; partNumber: number; expiresIn: number }> {
    const uploadId = validiereUploadId(params.uploadId);
    const partNumber = validierePartNumber(params.partNumber);
    const konfig = await this.holeAktivenClient();
    const { key } = normalisiereUndPruefeS3Key({
      teamId: params.teamId,
      pluginId: params.pluginId,
      s3Prefix: params.manifest.s3Prefix,
      objectPath: params.objectPath,
    });
    const expiresIn = clampAblaufzeit(params.expiresInSeconds, 900);
    const client = this.clientFactory(konfig);
    const cmd = new UploadPartCommand({
      Bucket: konfig.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await this.presigner(client, cmd, { expiresIn });
    return { url, key, partNumber, expiresIn };
  }

  async schliesseMultipartUploadAb(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPath: string;
    uploadId: string;
    parts: S3MultipartPartRef[];
  }): Promise<{ key: string; etag?: string; location?: string }> {
    const uploadId = validiereUploadId(params.uploadId);
    if (!Array.isArray(params.parts) || params.parts.length === 0) {
      throw new Error('Mindestens ein hochgeladener Part (parts) ist erforderlich.');
    }
    const bereinigteParts = params.parts
      .map((p) => ({
        PartNumber: validierePartNumber(p.partNumber),
        ETag: typeof p.etag === 'string' && p.etag.trim() ? p.etag.trim() : '',
      }))
      .sort((a, b) => a.PartNumber - b.PartNumber);

    if (bereinigteParts.some((p) => !p.ETag)) {
      throw new Error('Jeder Multipart-Part benötigt ein gültiges ETag.');
    }

    const konfig = await this.holeAktivenClient();
    const { key } = normalisiereUndPruefeS3Key({
      teamId: params.teamId,
      pluginId: params.pluginId,
      s3Prefix: params.manifest.s3Prefix,
      objectPath: params.objectPath,
    });
    const client = this.clientFactory(konfig);
    const antwort = (await client.send(
      new CompleteMultipartUploadCommand({
        Bucket: konfig.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: bereinigteParts },
      })
    )) as { ETag?: string; Location?: string };

    return {
      key,
      ...(antwort?.ETag ? { etag: antwort.ETag } : {}),
      ...(antwort?.Location ? { location: antwort.Location } : {}),
    };
  }

  async brecheMultipartUploadAb(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPath: string;
    uploadId: string;
  }): Promise<void> {
    const uploadId = validiereUploadId(params.uploadId);
    const konfig = await this.holeAktivenClient();
    const { key } = normalisiereUndPruefeS3Key({
      teamId: params.teamId,
      pluginId: params.pluginId,
      s3Prefix: params.manifest.s3Prefix,
      objectPath: params.objectPath,
    });
    const client = this.clientFactory(konfig);
    await client.send(
      new AbortMultipartUploadCommand({
        Bucket: konfig.bucket,
        Key: key,
        UploadId: uploadId,
      })
    );
  }

  async erzeugePresignedDownloadUrl(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPath: string;
    expiresInSeconds?: number;
  }): Promise<{ url: string; key: string; expiresIn: number }> {
    const konfig = await this.holeAktivenClient();
    const { key } = normalisiereUndPruefeS3Key({
      teamId: params.teamId,
      pluginId: params.pluginId,
      s3Prefix: params.manifest.s3Prefix,
      objectPath: params.objectPath,
    });
    const expiresIn = clampAblaufzeit(params.expiresInSeconds, 900);
    const client = this.clientFactory(konfig);
    const cmd = new GetObjectCommand({
      Bucket: konfig.bucket,
      Key: key,
    });
    const url = await this.presigner(client, cmd, { expiresIn });
    return { url, key, expiresIn };
  }

  async loescheObjekt(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPath: string;
  }): Promise<void> {
    const konfig = await this.holeAktivenClient();
    const { key } = normalisiereUndPruefeS3Key({
      teamId: params.teamId,
      pluginId: params.pluginId,
      s3Prefix: params.manifest.s3Prefix,
      objectPath: params.objectPath,
    });
    const client = this.clientFactory(konfig);
    await client.send(new DeleteObjectCommand({ Bucket: konfig.bucket, Key: key }));
  }

  /**
   * Interne Core-Methode ausschließlich für `S3CleanupService` (nie direkt an Plugins durchreichen).
   */
  async loescheDirektenKey(s3Key: string): Promise<void> {
    const konfig = await this.holeAktivenClient();
    const client = this.clientFactory(konfig);
    await client.send(new DeleteObjectCommand({ Bucket: konfig.bucket, Key: s3Key }));
  }

  erstellePluginScope(teamId: string, manifest: PluginManifest): PluginS3Scope {
    const prefix = ermittleTeamPluginPrefix(teamId, manifest.id, manifest.s3Prefix);
    return {
      prefix,
      getSignedUploadUrl: ({ objectPath, contentType, fileSizeBytes, expiresInSeconds }) =>
        this.erzeugePresignedUploadUrl({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPath,
          contentType,
          fileSizeBytes,
          expiresInSeconds,
        }),
      getSignedDownloadUrl: ({ objectPath, expiresInSeconds }) =>
        this.erzeugePresignedDownloadUrl({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPath,
          expiresInSeconds,
        }),
      initiateMultipartUpload: ({ objectPath, contentType, fileSizeBytes }) =>
        this.starteMultipartUpload({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPath,
          contentType,
          fileSizeBytes,
        }),
      getSignedMultipartPartUrl: ({ objectPath, uploadId, partNumber, expiresInSeconds }) =>
        this.erzeugeMultipartPartUploadUrl({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPath,
          uploadId,
          partNumber,
          expiresInSeconds,
        }),
      completeMultipartUpload: ({ objectPath, uploadId, parts }) =>
        this.schliesseMultipartUploadAb({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPath,
          uploadId,
          parts,
        }),
      abortMultipartUpload: ({ objectPath, uploadId }) =>
        this.brecheMultipartUploadAb({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPath,
          uploadId,
        }),
      deleteObject: (objectPath) =>
        this.loescheObjekt({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPath,
        }),
    };
  }
}

function validiereUploadId(raw: string): string {
  const bereinigt = typeof raw === 'string' ? raw.trim() : '';
  if (!bereinigt || /[\u0000-\u001f]/.test(bereinigt)) {
    throw new Error('Ungültige Multipart-UploadId.');
  }
  return bereinigt;
}

function validierePartNumber(raw: number): number {
  if (!Number.isInteger(raw) || raw < 1 || raw > 10_000) {
    throw new Error('Part-Nummer (partNumber) muss eine Ganzzahl zwischen 1 und 10000 sein.');
  }
  return raw;
}

function clampAblaufzeit(raw: number | undefined, fallback: number): number {
  if (!raw || !Number.isFinite(raw)) return fallback;
  return Math.max(60, Math.min(3600, Math.floor(raw)));
}

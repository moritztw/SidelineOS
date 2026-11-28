import type {
  PluginManifest,
  PluginStorageScope,
  StorageMultipartPartRef,
  StorageProviderAdapter,
} from '../../sdk/plugin.ts';
import type { ClubKontext, TeamKontext } from '../../shared/types.ts';
import type { CoreServerConfig } from '../config.ts';
import type { CoreRepository } from '../db/coreRepository.ts';

export class StoragePolicyError extends Error {
  constructor(
    public readonly status: number,
    public readonly code:
      | 'NO_STORAGE_PROVIDER'
      | 'TEAM_ARCHIVED_READ_ONLY'
      | 'STORAGE_QUOTA_EXCEEDED'
      | 'INVALID_STORAGE_INPUT',
    message: string
  ) {
    super(message);
    this.name = 'StoragePolicyError';
  }
}

const GUELTIGER_MIME_TYP =
  /^[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&^_.+-]*(\s*;[^\u0000-\u001f]*)?$/;

export function validiereUploadMetadaten(params: {
  contentType?: string;
  fileSizeBytes?: number;
  maxUploadBytes: number;
}): { contentType?: string; fileSizeBytes: number } {
  let bereinigterTyp: string | undefined;
  if (typeof params.contentType === 'string' && params.contentType.trim().length > 0) {
    const typ = params.contentType.trim();
    if (!GUELTIGER_MIME_TYP.test(typ)) {
      throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Ungültiger Content-Type.');
    }
    bereinigterTyp = typ;
  }

  let groesse = 0;
  if (params.fileSizeBytes !== undefined) {
    if (
      typeof params.fileSizeBytes !== 'number' ||
      !Number.isFinite(params.fileSizeBytes) ||
      params.fileSizeBytes <= 0
    ) {
      throw new StoragePolicyError(
        400,
        'INVALID_STORAGE_INPUT',
        'Dateigröße (fileSizeBytes) muss größer als 0 sein.'
      );
    }
    if (params.fileSizeBytes > params.maxUploadBytes) {
      throw new StoragePolicyError(
        413,
        'INVALID_STORAGE_INPUT',
        `Datei überschreitet das maximale Upload-Limit (${params.maxUploadBytes} Bytes).`
      );
    }
    groesse = Math.floor(params.fileSizeBytes);
  }

  return { contentType: bereinigterTyp, fileSizeBytes: groesse };
}

export function ermittleStoragePrefix(params: {
  clubId: string;
  teamId?: string;
  pluginId: string;
  storagePrefix?: string;
}): string {
  const club = params.clubId.trim();
  const plugin = params.pluginId.trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(club)) {
    throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Ungültige Club-ID.');
  }
  if (!/^[a-z0-9-]+$/.test(plugin)) {
    throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Ungültige Plugin-ID.');
  }
  const rawPluginPrefix = (params.storagePrefix ?? `plugins/${plugin}`).replace(/^\/+|\/+$/g, '');
  if (!rawPluginPrefix || rawPluginPrefix.includes('..') || rawPluginPrefix.includes('\\')) {
    throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Ungültiges Plugin-Storage-Präfix.');
  }
  if (params.teamId) {
    const team = params.teamId.trim();
    if (!/^[a-zA-Z0-9_-]+$/.test(team)) {
      throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Ungültige Team-ID.');
    }
    return `clubs/${club}/teams/${team}/${rawPluginPrefix}/`;
  }
  return `clubs/${club}/${rawPluginPrefix}/`;
}

export function normalisiereUndPruefeStorageKey(params: {
  clubId: string;
  teamId?: string;
  pluginId: string;
  storagePrefix?: string;
  objectPath: string;
}): { prefix: string; key: string } {
  const prefix = ermittleStoragePrefix(params);
  const roh = params.objectPath.trim().replace(/^\/+/, '');
  if (!roh || roh.includes('\\') || /[\u0000-\u001f]/.test(roh)) {
    throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Ungültiger Objektpfad.');
  }

  const ohnePrefix = roh.startsWith(prefix) ? roh.slice(prefix.length) : roh;
  const segmente = ohnePrefix.split('/').filter((s) => s.length > 0);
  if (segmente.length === 0 || segmente.some((s) => s === '.' || s === '..')) {
    throw new StoragePolicyError(
      400,
      'INVALID_STORAGE_INPUT',
      'Objektpfad enthält ungültige Pfadsegmente.'
    );
  }

  const key = `${prefix}${segmente.join('/')}`;
  if (!key.startsWith(prefix)) {
    throw new StoragePolicyError(
      403,
      'INVALID_STORAGE_INPUT',
      'Zugriff außerhalb des Plugin-Präfixes verweigert.'
    );
  }
  return { prefix, key };
}

function clampAblaufzeit(raw: number | undefined, fallback = 900): number {
  if (!raw || !Number.isFinite(raw)) return fallback;
  return Math.max(60, Math.min(3600, Math.floor(raw)));
}

/**
 * Abstrakter, speicherort-agnostischer Core-Storage-Broker (v0.2.0):
 * - Keine direkten AWS-/S3-Abhängigkeiten im Core.
 * - Erzwingt Mandanten-/Plugin-Präfixe, Team-Archiv-Schreibsperre (#25)
 *   und das 100 %-Hard-Limit des Vereins-Speicherpools (#24).
 * - Routet transparent über `club.speicher.nodeId` an den registrierten Provider (#22).
 */
export class StorageBroker {
  private activeProvider: { pluginId: string; adapter: StorageProviderAdapter } | null = null;

  constructor(
    private readonly repo: CoreRepository,
    private readonly config: CoreServerConfig
  ) {}

  registriereProvider(pluginId: string, adapter: StorageProviderAdapter): void {
    this.activeProvider = { pluginId, adapter };
  }

  entferneProviderFallsVon(pluginId: string): void {
    if (this.activeProvider?.pluginId === pluginId) {
      this.activeProvider = null;
    }
  }

  holeProviderInfo(): { konfiguriert: boolean; pluginId?: string; providerId?: string; label?: string } {
    if (!this.activeProvider) {
      return { konfiguriert: false };
    }
    return {
      konfiguriert: true,
      pluginId: this.activeProvider.pluginId,
      providerId: this.activeProvider.adapter.providerId,
      label: this.activeProvider.adapter.label,
    };
  }

  private holeAktivenAdapter(): StorageProviderAdapter {
    if (!this.activeProvider) {
      throw new StoragePolicyError(
        503,
        'NO_STORAGE_PROVIDER',
        'Kein Storage-Provider-Plugin (z. B. SidelineOS-storage-s3) installiert und freigegeben.'
      );
    }
    return this.activeProvider.adapter;
  }

  private async pruefeSchreibBerechtigung(params: {
    clubId: string;
    team?: TeamKontext | null;
    additionalBytes?: number;
  }): Promise<ClubKontext> {
    if (params.team && params.team.status === 'ARCHIVED') {
      throw new StoragePolicyError(
        409,
        'TEAM_ARCHIVED_READ_ONLY',
        'Dieses Team ist archiviert. Neue Uploads oder Löschungen sind im Lesemodus gesperrt.'
      );
    }

    const club = await this.repo.findeClubNachId(params.clubId);
    if (!club) {
      throw new StoragePolicyError(404, 'INVALID_STORAGE_INPUT', 'Verein nicht gefunden.');
    }

    const extra = Math.max(0, Math.floor(params.additionalBytes ?? 0));
    if (club.speicher.quotaBytes !== null) {
      if (club.speicher.hardLimitErreicht || club.speicher.usedBytes + extra > club.speicher.quotaBytes) {
        throw new StoragePolicyError(
          413,
          'STORAGE_QUOTA_EXCEEDED',
          'Speicherlimit des Vereins erreicht (100 % Upload-Stopp). Lese- und Analysefunktionen bleiben verfügbar.'
        );
      }
    }

    return club;
  }

  erstellePluginScope(params: {
    club: ClubKontext;
    team?: TeamKontext | null;
    manifest: PluginManifest;
  }): PluginStorageScope {
    const prefix = ermittleStoragePrefix({
      clubId: params.club.id,
      teamId: params.team?.id,
      pluginId: params.manifest.id,
      storagePrefix: params.manifest.storagePrefix,
    });

    const resolveKey = (objectPath: string) =>
      normalisiereUndPruefeStorageKey({
        clubId: params.club.id,
        teamId: params.team?.id,
        pluginId: params.manifest.id,
        storagePrefix: params.manifest.storagePrefix,
        objectPath,
      }).key;

    return {
      prefix,
      getSignedUploadUrl: async ({ objectPath, contentType, fileSizeBytes, expiresInSeconds }) => {
        const adapter = this.holeAktivenAdapter();
        const meta = validiereUploadMetadaten({
          contentType,
          fileSizeBytes,
          maxUploadBytes: this.config.maxUploadBytes,
        });
        const aktuellerClub = await this.pruefeSchreibBerechtigung({
          clubId: params.club.id,
          team: params.team,
          additionalBytes: meta.fileSizeBytes,
        });
        const key = resolveKey(objectPath);
        const ergebnis = await adapter.presignUpload({
          nodeId: aktuellerClub.speicher.nodeId,
          key,
          contentType: meta.contentType,
          expiresInSeconds: clampAblaufzeit(expiresInSeconds),
        });
        if (meta.fileSizeBytes > 0) {
          await this.repo.passeClubSpeicherVerbrauchAn(aktuellerClub.id, meta.fileSizeBytes);
        }
        return ergebnis;
      },

      // Downloads bleiben bei 100 % Quota (#24) und archivierten Teams (#25) ausdrücklich erlaubt!
      getSignedDownloadUrl: async ({ objectPath, expiresInSeconds }) => {
        const adapter = this.holeAktivenAdapter();
        const aktuellerClub = (await this.repo.findeClubNachId(params.club.id)) ?? params.club;
        const key = resolveKey(objectPath);
        return adapter.presignDownload({
          nodeId: aktuellerClub.speicher.nodeId,
          key,
          expiresInSeconds: clampAblaufzeit(expiresInSeconds),
        });
      },

      initiateMultipartUpload: async ({ objectPath, contentType, fileSizeBytes }) => {
        const adapter = this.holeAktivenAdapter();
        const meta = validiereUploadMetadaten({
          contentType,
          fileSizeBytes,
          maxUploadBytes: this.config.maxUploadBytes,
        });
        const aktuellerClub = await this.pruefeSchreibBerechtigung({
          clubId: params.club.id,
          team: params.team,
          additionalBytes: meta.fileSizeBytes,
        });
        const key = resolveKey(objectPath);
        const init = await adapter.initiateMultipartUpload({
          nodeId: aktuellerClub.speicher.nodeId,
          key,
          contentType: meta.contentType,
        });
        if (meta.fileSizeBytes > 0) {
          await this.repo.passeClubSpeicherVerbrauchAn(aktuellerClub.id, meta.fileSizeBytes);
        }
        return {
          uploadId: init.uploadId,
          key: init.key,
          maxFileSizeBytes: this.config.maxUploadBytes,
        };
      },

      getSignedMultipartPartUrl: async ({ objectPath, uploadId, partNumber, expiresInSeconds }) => {
        const adapter = this.holeAktivenAdapter();
        if (!uploadId?.trim() || !Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
          throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Ungültige Multipart-Parameter.');
        }
        const aktuellerClub = await this.pruefeSchreibBerechtigung({
          clubId: params.club.id,
          team: params.team,
        });
        const key = resolveKey(objectPath);
        return adapter.presignMultipartPart({
          nodeId: aktuellerClub.speicher.nodeId,
          key,
          uploadId: uploadId.trim(),
          partNumber,
          expiresInSeconds: clampAblaufzeit(expiresInSeconds),
        });
      },

      completeMultipartUpload: async ({ objectPath, uploadId, parts }) => {
        const adapter = this.holeAktivenAdapter();
        if (!uploadId?.trim() || !Array.isArray(parts) || parts.length === 0) {
          throw new StoragePolicyError(400, 'INVALID_STORAGE_INPUT', 'Multipart-Parts fehlen.');
        }
        const aktuellerClub = await this.pruefeSchreibBerechtigung({
          clubId: params.club.id,
          team: params.team,
        });
        const key = resolveKey(objectPath);
        return adapter.completeMultipartUpload({
          nodeId: aktuellerClub.speicher.nodeId,
          key,
          uploadId: uploadId.trim(),
          parts: parts as StorageMultipartPartRef[],
        });
      },

      abortMultipartUpload: async ({ objectPath, uploadId }) => {
        const adapter = this.holeAktivenAdapter();
        const aktuellerClub = (await this.repo.findeClubNachId(params.club.id)) ?? params.club;
        const key = resolveKey(objectPath);
        await adapter.abortMultipartUpload({
          nodeId: aktuellerClub.speicher.nodeId,
          key,
          uploadId: uploadId.trim(),
        });
      },

      deleteObject: async (objectPath, estimatedBytes) => {
        const adapter = this.holeAktivenAdapter();
        if (params.team && params.team.status === 'ARCHIVED') {
          throw new StoragePolicyError(
            409,
            'TEAM_ARCHIVED_READ_ONLY',
            'Archivierte Teams sind schreibgeschützt.'
          );
        }
        const aktuellerClub = (await this.repo.findeClubNachId(params.club.id)) ?? params.club;
        const key = resolveKey(objectPath);
        await adapter.deleteObject({
          nodeId: aktuellerClub.speicher.nodeId,
          key,
        });
        if (typeof estimatedBytes === 'number' && estimatedBytes > 0) {
          await this.repo.passeClubSpeicherVerbrauchAn(aktuellerClub.id, -Math.floor(estimatedBytes));
        }
      },
    };
  }
}

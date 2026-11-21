import crypto from 'node:crypto';
import type { PluginCleanupQueueScope, PluginManifest } from '../../sdk/plugin.ts';
import type { CoreDatabaseClient } from '../db/client.ts';
import { normalisiereUndPruefeS3Key, type S3BrokerService } from './s3Broker.ts';

export interface S3CleanupStatistik {
  wartendeObjekte: number;
  faelligeObjekte: number;
  gesamtBytes: number;
  faelligeBytes: number;
  schonfristTage: number;
  naechsterLoeschzeitpunkt: string | null;
}

export interface S3CleanupLaufErgebnis {
  geloescht: number;
  fehler: number;
  freigegebeneBytes: number;
  statistik: S3CleanupStatistik;
}

/**
 * Verwaltet die S3-Cleanup-Queue mit konfigurierbarer Schonfrist.
 * Der Sysadmin sieht ausschließlich anonymisierte Aggregatzahlen (keine Dateinamen oder Team-Inhalte).
 */
export class S3CleanupService {
  constructor(
    private readonly db: CoreDatabaseClient,
    private readonly s3Broker: S3BrokerService
  ) {}

  async reiheVerwaisteObjekteEin(params: {
    teamId: string;
    pluginId: string;
    manifest: PluginManifest;
    objectPaths: string[];
    reason?: string;
    sizeBytesPerObject?: number;
  }): Promise<{ queued: number }> {
    const bereinigtePfade = params.objectPaths
      .map((p) => (typeof p === 'string' ? p.trim() : ''))
      .filter(Boolean)
      .slice(0, 200);

    if (bereinigtePfade.length === 0) {
      return { queued: 0 };
    }

    const s3Konfig = await this.s3Broker.holeEffektiveKonfig();
    const schonfristTage = Math.max(1, Math.min(365, s3Konfig.cleanupRetentionDays || 14));
    const deleteAfter = new Date(Date.now() + schonfristTage * 86400 * 1000).toISOString();
    const reason = (params.reason ?? 'orphaned').trim().slice(0, 120) || 'orphaned';
    const sizeBytes = Math.max(0, Math.floor(params.sizeBytesPerObject ?? 0));

    let queued = 0;
    for (const pfad of bereinigtePfade) {
      const { key } = normalisiereUndPruefeS3Key({
        teamId: params.teamId,
        pluginId: params.pluginId,
        s3Prefix: params.manifest.s3Prefix,
        objectPath: pfad,
      });
      const res = await this.db.query<{ id: string }>(
        `INSERT INTO core.s3_cleanup_queue (
           id, team_id, plugin_id, s3_key, size_bytes, reason, delete_after
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (s3_key) WHERE deleted_at IS NULL DO NOTHING
         RETURNING id`,
        [`cln-${crypto.randomUUID()}`, params.teamId, params.pluginId, key, sizeBytes, reason, deleteAfter]
      );
      if (res.rows.length > 0) {
        queued += 1;
      }
    }

    return { queued };
  }

  erstellePluginScope(teamId: string, manifest: PluginManifest): PluginCleanupQueueScope {
    return {
      enqueueOrphanedObjects: (objectPaths, reason) =>
        this.reiheVerwaisteObjekteEin({
          teamId,
          pluginId: manifest.id,
          manifest,
          objectPaths,
          reason,
        }),
    };
  }

  async holeAnonymisierteStatistik(): Promise<S3CleanupStatistik> {
    const s3Konfig = await this.s3Broker.holeEffektiveKonfig();
    const res = await this.db.query<{
      wartende: string | number;
      faellige: string | number;
      gesamt_bytes: string | number;
      faellige_bytes: string | number;
      naechster: unknown;
    }>(
      `SELECT
         COUNT(*)::int AS wartende,
         COUNT(*) FILTER (WHERE delete_after <= NOW())::int AS faellige,
         COALESCE(SUM(size_bytes), 0)::bigint AS gesamt_bytes,
         COALESCE(SUM(size_bytes) FILTER (WHERE delete_after <= NOW()), 0)::bigint AS faellige_bytes,
         MIN(delete_after) AS naechster
       FROM core.s3_cleanup_queue
       WHERE deleted_at IS NULL`
    );

    const row = res.rows[0];
    const naechsterRaw = row?.naechster;
    const naechster =
      naechsterRaw instanceof Date
        ? naechsterRaw.toISOString()
        : naechsterRaw
          ? String(naechsterRaw)
          : null;

    return {
      wartendeObjekte: Number(row?.wartende ?? 0),
      faelligeObjekte: Number(row?.faellige ?? 0),
      gesamtBytes: Number(row?.gesamt_bytes ?? 0),
      faelligeBytes: Number(row?.faellige_bytes ?? 0),
      schonfristTage: s3Konfig.cleanupRetentionDays || 14,
      naechsterLoeschzeitpunkt: naechster,
    };
  }

  async bereinigeFaellige(optionen: { auchVorfristig?: boolean } = {}): Promise<S3CleanupLaufErgebnis> {
    const auchVorfristig = Boolean(optionen.auchVorfristig);
    const eintraege = await this.db.query<{ id: string; s3_key: string; size_bytes: string | number }>(
      `SELECT id, s3_key, size_bytes
       FROM core.s3_cleanup_queue
       WHERE deleted_at IS NULL
         AND ($1::boolean = TRUE OR delete_after <= NOW())
       ORDER BY delete_after ASC
       LIMIT 200`,
      [auchVorfristig]
    );

    let geloescht = 0;
    let fehler = 0;
    let freigegebeneBytes = 0;

    for (const row of eintraege.rows) {
      try {
        await this.s3Broker.loescheDirektenKey(row.s3_key);
        await this.db.query(`UPDATE core.s3_cleanup_queue SET deleted_at = NOW() WHERE id = $1`, [
          row.id,
        ]);
        geloescht += 1;
        freigegebeneBytes += Number(row.size_bytes ?? 0);
      } catch {
        fehler += 1;
      }
    }

    return {
      geloescht,
      fehler,
      freigegebeneBytes,
      statistik: await this.holeAnonymisierteStatistik(),
    };
  }
}

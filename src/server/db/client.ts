import crypto from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import type { CoreServerConfig } from '../config.ts';

export interface SqlQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface SqlExecutor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface CoreDatabaseClient extends SqlExecutor {
  readonly dialekt: 'postgres' | 'pglite';
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Erzeugt einen validierten PostgreSQL-Schema-Namen für ein Plugin (`plugin_<slug>`).
 * Verhindert SQL-Injection bei dynamischen `CREATE SCHEMA` / `search_path`-Aufrufen.
 */
export function pluginSchemaName(pluginId: string): string {
  const roh = pluginId.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,46}[a-z0-9]$/.test(roh)) {
    throw new Error(`Ungültige Plugin-ID für Datenbankschema: "${pluginId}"`);
  }
  return `plugin_${roh.replace(/-/g, '_')}`;
}

/**
 * Erstellt entweder einen produktiven `pg.Pool` (bei gesetzter `DATABASE_URL`)
 * oder fällt im Dev-/Testbetrieb automatisch auf eingebettetes `PGlite` zurück.
 */
export async function erstelleDatenbankClient(
  config: Pick<CoreServerConfig, 'databaseUrl' | 'pgliteDataDir'>
): Promise<CoreDatabaseClient> {
  if (config.databaseUrl) {
    const pool = new Pool({ connectionString: config.databaseUrl });
    // Schneller Verbindungstest beim Start
    await pool.query('SELECT 1');

    return {
      dialekt: 'postgres',
      async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
        const res = await pool.query(sql, params);
        return { rows: res.rows as T[], rowCount: res.rowCount ?? res.rows.length };
      },
      async exec(sql: string) {
        await pool.query(sql);
      },
      async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const tx: SqlExecutor = {
            async query<R = Record<string, unknown>>(sql: string, params: unknown[] = []) {
              const res = await client.query(sql, params);
              return { rows: res.rows as R[], rowCount: res.rowCount ?? res.rows.length };
            },
            async exec(sql: string) {
              await client.query(sql);
            },
          };
          const ergebnis = await fn(tx);
          await client.query('COMMIT');
          return ergebnis;
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      },
      async close() {
        await pool.end();
      },
    };
  }

  const pglite = config.pgliteDataDir
    ? new PGlite(config.pgliteDataDir)
    : new PGlite();
  await pglite.waitReady;

  return {
    dialekt: 'pglite',
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      const res = await pglite.query<T>(sql, params);
      return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
    },
    async exec(sql: string) {
      await pglite.exec(sql);
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T> {
      return pglite.transaction(async (pgTx) => {
        const tx: SqlExecutor = {
          async query<R = Record<string, unknown>>(sql: string, params: unknown[] = []) {
            const res = await pgTx.query<R>(sql, params);
            return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
          },
          async exec(sql: string) {
            await pgTx.exec(sql);
          },
        };
        return fn(tx);
      });
    },
    async close() {
      await pglite.close();
    },
  };
}

/**
 * Erstellt für ein Plugin einen isolierten SQL-Executor, der ausschließlich im
 * eigenen Schema `plugin_<slug>` operiert.
 */
export function erstellePluginDbScope(
  db: CoreDatabaseClient,
  pluginId: string
): { schemaName: string; query: CoreDatabaseClient['query']; transaction: CoreDatabaseClient['transaction'] } {
  const schemaName = pluginSchemaName(pluginId);

  return {
    schemaName,
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
      return db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL search_path TO "${schemaName}"`);
        return tx.query<T>(sql, params);
      });
    },
    async transaction<T>(fn: (tx: SqlExecutor) => Promise<T>) {
      return db.transaction(async (tx) => {
        await tx.exec(`SET LOCAL search_path TO "${schemaName}"`);
        return fn(tx);
      });
    },
  };
}

/**
 * Führt eine Plugin-SQL-Migration idempotent im eigenen Schema `plugin_<slug>` aus
 * und protokolliert sie unter `core.plugin_migrations`.
 */
export async function fuehrePluginMigrationAus(
  db: CoreDatabaseClient,
  pluginId: string,
  migrationName: string,
  sql: string
): Promise<{ ausgefuehrt: boolean; schemaName: string }> {
  const schemaName = pluginSchemaName(pluginId);
  const checksum = crypto.createHash('sha256').update(sql).digest('hex');

  return db.transaction(async (tx) => {
    const bereits = await tx.query<{ checksum: string }>(
      `SELECT checksum FROM core.plugin_migrations WHERE plugin_id = $1 AND migration_name = $2`,
      [pluginId, migrationName]
    );
    if (bereits.rows.length > 0) {
      if (bereits.rows[0].checksum !== checksum) {
        throw new Error(
          `Prüfsummen-Konflikt für Plugin-Migration ${pluginId}/${migrationName}`
        );
      }
      return { ausgefuehrt: false, schemaName };
    }

    await tx.exec(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);
    await tx.exec(`SET LOCAL search_path TO "${schemaName}"`);
    await tx.exec(sql);
    await tx.exec(`SET LOCAL search_path TO core, public`);
    await tx.query(
      `INSERT INTO core.plugin_migrations (plugin_id, schema_name, migration_name, checksum)
       VALUES ($1, $2, $3, $4)`,
      [pluginId, schemaName, migrationName, checksum]
    );

    return { ausgefuehrt: true, schemaName };
  });
}

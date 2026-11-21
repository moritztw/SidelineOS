-- SidelineOS-Core Phase 3: Core-Migrations-Protokoll, Plugin-Installer-Metadaten & S3-Cleanup-Queue

CREATE TABLE IF NOT EXISTS core.schema_migrations (
  migration_name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE core.installed_plugins
  ADD COLUMN IF NOT EXISTS installed_version TEXT NOT NULL DEFAULT '';

ALTER TABLE core.installed_plugins
  ADD COLUMN IF NOT EXISTS previous_version TEXT;

ALTER TABLE core.installed_plugins
  ADD COLUMN IF NOT EXISTS install_mode TEXT NOT NULL DEFAULT 'CATALOG';

ALTER TABLE core.installed_plugins
  ADD COLUMN IF NOT EXISTS package_sha256 TEXT;

ALTER TABLE core.installed_plugins
  ADD COLUMN IF NOT EXISTS dev_branch TEXT;

ALTER TABLE core.installed_plugins
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE core.installed_plugins
SET installed_version = COALESCE(NULLIF(manifest_json->>'version', ''), '0.1.0')
WHERE installed_version = '';

CREATE TABLE IF NOT EXISTS core.s3_cleanup_queue (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES core.teams(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT 'orphaned',
  delete_after TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_s3_cleanup_active_key
  ON core.s3_cleanup_queue (s3_key)
  WHERE deleted_at IS NULL;

-- ============================================================================
-- SidelineOS-core v0.2.0 — Schlankes, sportartneutrales Core-Datenmodell
-- Deckt ab: #21 (Quota-API), #22 (Multi-Node), #23 (Club 1:n + Kaskade),
--           #24 (Vereins-Speicherpool 90%/100%), #25 (Team-Archivierung),
--           #26 (Getrennte Club-/Team-Mitgliedschaften + atomare Team-Invites)
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.schema_migrations (
  migration_name TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.plugin_migrations (
  plugin_id TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  migration_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plugin_id, migration_name)
);

CREATE TABLE IF NOT EXISTS core.users (
  uuid TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_sysadmin BOOLEAN NOT NULL DEFAULT FALSE,
  preferred_locale TEXT NOT NULL DEFAULT 'de',
  preferred_theme TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.sessions (
  token_hash TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL REFERENCES core.users(uuid) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_sessions_user ON core.sessions(user_uuid);

-- Zwingende oberste Mandanten-Ebene (#23) inkl. Vereins-Speicherpool (#21, #22, #24)
CREATE TABLE IF NOT EXISTS core.clubs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  storage_node_id TEXT NOT NULL DEFAULT 'default',
  storage_quota_bytes BIGINT,
  storage_used_bytes BIGINT NOT NULL DEFAULT 0,
  storage_soft_limit_percent INTEGER NOT NULL DEFAULT 90
    CHECK (storage_soft_limit_percent >= 50 AND storage_soft_limit_percent <= 99),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Jedes Team gehört zwingend zu genau einem Club (#23) und unterstützt Archivierung (#25)
CREATE TABLE IF NOT EXISTS core.teams (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES core.clubs(id) ON DELETE RESTRICT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  accent_color TEXT NOT NULL DEFAULT '#F59E0B',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (club_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_core_teams_club ON core.teams(club_id);

-- Getrennte Vereins-Mitgliedschaft (#23, #26)
CREATE TABLE IF NOT EXISTS core.club_memberships (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL REFERENCES core.users(uuid) ON DELETE CASCADE,
  club_id TEXT NOT NULL REFERENCES core.clubs(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'CLUB_MEMBER' CHECK (role IN ('CLUB_ADMIN', 'CLUB_MEMBER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_uuid, club_id)
);
CREATE INDEX IF NOT EXISTS idx_core_club_memberships_club ON core.club_memberships(club_id);

-- Operative Team-Mitgliedschaft mit flexiblen Gruppen/Tags (#26)
CREATE TABLE IF NOT EXISTS core.team_memberships (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL REFERENCES core.users(uuid) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES core.teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('TEAM_ADMIN', 'STAFF', 'MEMBER')),
  groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PENDING', 'SUSPENDED')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_uuid, team_id)
);
CREATE INDEX IF NOT EXISTS idx_core_team_memberships_team ON core.team_memberships(team_id);

-- Einladungs-Token-Kern (#26): Team-Link bindet automatisch Club + Team
CREATE TABLE IF NOT EXISTS core.invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  club_id TEXT NOT NULL REFERENCES core.clubs(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES core.teams(id) ON DELETE CASCADE,
  club_role TEXT NOT NULL DEFAULT 'CLUB_MEMBER' CHECK (club_role IN ('CLUB_ADMIN', 'CLUB_MEMBER')),
  team_role TEXT NOT NULL DEFAULT 'MEMBER' CHECK (team_role IN ('TEAM_ADMIN', 'STAFF', 'MEMBER')),
  groups JSONB NOT NULL DEFAULT '[]'::jsonb,
  target_email TEXT,
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at TIMESTAMPTZ NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_invitations_club ON core.invitations(club_id);

-- Plugin-Registry inkl. explizit freigegebener privilegierter Capabilities
CREATE TABLE IF NOT EXISTS core.installed_plugins (
  plugin_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  previous_version TEXT,
  manifest_json JSONB NOT NULL,
  enabled_globally BOOLEAN NOT NULL DEFAULT FALSE,
  approved_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_url TEXT,
  sha256 TEXT,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT
);

-- Modul-Freischaltung je Club oder Team
CREATE TABLE IF NOT EXISTS core.scope_modules (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('club', 'team')),
  scope_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL REFERENCES core.installed_plugins(plugin_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (scope_type, scope_id, plugin_id)
);

CREATE TABLE IF NOT EXISTS core.system_settings (
  setting_key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.notifications (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL REFERENCES core.users(uuid) ON DELETE CASCADE,
  club_id TEXT REFERENCES core.clubs(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES core.teams(id) ON DELETE CASCADE,
  source_plugin_id TEXT NOT NULL DEFAULT 'core',
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_path TEXT,
  priority TEXT NOT NULL DEFAULT 'info' CHECK (priority IN ('info', 'warning', 'urgent')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_core_notifications_user ON core.notifications(user_uuid, created_at DESC);

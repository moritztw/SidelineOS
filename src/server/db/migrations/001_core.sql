-- SidelineOS-Core Initial-Schema (PostgreSQL & PGlite kompatibel)
-- Strikte Schema-Trennung: Core-Tabellen liegen im Schema `core`,
-- externe Plugins erhalten jeweils ein eigenes isoliertes Schema `plugin_<slug>`.

CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.users (
  uuid TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  jersey_number TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  is_sysadmin BOOLEAN NOT NULL DEFAULT FALSE,
  custom_profile_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at DATE NOT NULL DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  active_season TEXT NOT NULL,
  primary_color TEXT NOT NULL DEFAULT '#F59E0B',
  custom_profile_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.team_seasons (
  team_id TEXT NOT NULL REFERENCES core.teams(id) ON DELETE CASCADE,
  season TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (team_id, season)
);

CREATE TABLE IF NOT EXISTS core.memberships (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL REFERENCES core.users(uuid) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES core.teams(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('TEAM_ADMIN', 'COACH', 'PLAYER')),
  units JSONB NOT NULL DEFAULT '["OFFENSE"]'::jsonb,
  status TEXT NOT NULL CHECK (status IN ('AKTIV', 'WARTET_AUF_FREIGABE')),
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  UNIQUE (user_uuid, team_id)
);

CREATE TABLE IF NOT EXISTS core.invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES core.teams(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('EMAIL', 'TEAM_LINK')),
  target_email TEXT,
  role TEXT NOT NULL CHECK (role IN ('TEAM_ADMIN', 'COACH', 'PLAYER')),
  units JSONB NOT NULL DEFAULT '["OFFENSE"]'::jsonb,
  token TEXT UNIQUE NOT NULL,
  path TEXT NOT NULL,
  expires_at DATE NOT NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS core.sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  user_uuid TEXT NOT NULL REFERENCES core.users(uuid) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.installed_plugins (
  plugin_id TEXT PRIMARY KEY,
  manifest_json JSONB NOT NULL,
  source TEXT NOT NULL,
  release_tag TEXT NOT NULL,
  enabled_globally BOOLEAN NOT NULL DEFAULT TRUE,
  installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS core.team_modules (
  team_id TEXT NOT NULL REFERENCES core.teams(id) ON DELETE CASCADE,
  plugin_id TEXT NOT NULL REFERENCES core.installed_plugins(plugin_id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (team_id, plugin_id)
);

CREATE TABLE IF NOT EXISTS core.plugin_migrations (
  plugin_id TEXT NOT NULL,
  schema_name TEXT NOT NULL,
  migration_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (plugin_id, migration_name)
);

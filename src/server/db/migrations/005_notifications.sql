-- Core-Benachrichtigungen (In-App-Standardkanal; externe Zustellwege über Plugins)

CREATE TABLE IF NOT EXISTS core.notifications (
  id TEXT PRIMARY KEY,
  user_uuid TEXT NOT NULL REFERENCES core.users(uuid) ON DELETE CASCADE,
  team_id TEXT REFERENCES core.teams(id) ON DELETE CASCADE,
  source_plugin_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link_path TEXT,
  priority TEXT NOT NULL DEFAULT 'info' CHECK (priority IN ('info', 'warning', 'urgent')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_core_notifications_user_created
  ON core.notifications (user_uuid, created_at DESC);

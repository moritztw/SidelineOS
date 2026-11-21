-- SidelineOS-Core Infrastruktur-Einstellungen (S3 & SMTP)
-- Secrets (secretAccessKey, smtpPass) werden ausschließlich AES-256-GCM-verschlüsselt gespeichert.

CREATE TABLE IF NOT EXISTS core.system_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

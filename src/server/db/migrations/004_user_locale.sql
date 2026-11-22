-- SidelineOS-Core R1: Persistente Sprachpräferenz pro Benutzerkonto (Standard: de)

ALTER TABLE core.users
  ADD COLUMN IF NOT EXISTS preferred_locale TEXT NOT NULL DEFAULT 'de';

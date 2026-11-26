-- SidelineOS-Core PR3: Persistente Theme-Präferenz pro Benutzerkonto (leer = Instanz-Standard)

ALTER TABLE core.users
  ADD COLUMN IF NOT EXISTS preferred_theme TEXT NOT NULL DEFAULT '';

<p align="left">
  <img src="docs/assets/sidelineos-logo.svg" alt="SidelineOS Logo" width="280" />
</p>

# SidelineOS-Core

**SidelineOS-Core** ist eine quelloffene, modulare und selbstgehostete Multi-Tenant-Plattform von Coaches für Coaches (American Football & andere Teamsportarten). Der schlanke **SidelineOS-Core** übernimmt Benutzerkonten, Teams/Saisons, Auth/Einladungen, S3-Infrastruktur und einen **Plugin Store**, über den eigenständige GitHub-Module (wie die Videoanalyse) unabhängig entwickelt und installiert werden.

> **Projektstatus:** **SidelineOS-Core** ist bereit für den **Alpha-Selbsttest (`v0.1.0-alpha.1`)**: Produktionsnahes Backend (`Express`, `PostgreSQL`/`PGlite`, `scrypt`-Auth, `HttpOnly`-Sessions, RBAC, isolierte `plugin_<slug>`-Schemas), **S3-Broker** inkl. Cloudflare-R2-Support (Presigned-URLs, Präfix-Isolation, AES-256-GCM, anonymisierte **S3-Cleanup-Queue**), **SMTP-Service**, `@sidelineos/plugin-sdk` samt Plugin-Installer, **Rebranding-Vorbereitung** & **i18n (DE/EN)** sowie **Proxmox-LXC-Deployment** (`systemd` + Cloudflare R2 + Multi-Arch-`Dockerfile`). Als nächstes folgt der Post-Alpha-Ausbau (**Upload & File-Handling**, **Benachrichtigungen**) für die **Closed Beta**.

---

## Kernfunktionen

* **Schlanker Core & GitHub Plugin Store:** SidelineOS-Core enthält nur Authentifizierung, Einladungen, Mandanten/Teams, S3/SMTP, i18n, Hub, Einstellungs-Hub und den **Plugin Store**. Fachmodule implementieren das verbindliche `@sidelineos/plugin-sdk` (`src/sdk/plugin.ts`), werden über den Store (inkl. eigener GitHub-URLs) installiert und pro Team freigeschaltet.
* **Aufgeräumte Startseite & Einstellungs-Hub:** Die Startseite zeigt ausschließlich Kacheln für die freigeschalteten Plugins des Teams sowie eine Kachel `Einstellungen`. Aktive Plugins klinken eigene Einstellungs-Kategorien dynamisch in die drei zentralen Einstellungsbereiche (`Persönliche Einstellungen`, `Team-Einstellungen`, `Sysadmin`) ein.
* **Zentrale Spracheinstellung (DE / EN):** Benutzer wählen ihre UI-Sprache einmalig in den persönlichen Einstellungen (`preferred_locale`). Core und alle installierten Plugins erhalten die gewählte Sprache einheitlich über den SDK-Kontext (`locale`).
* **Dauerhafte Multi-Saison-Teams:** Teams bleiben saisonübergreifend bestehen (`2026`, `2025`, `2024`, …). Alte Spielzeiten bleiben abrufbar, ohne Kader oder Einstellungen neu anzulegen.
* **Deployment-unabhängige Ersteinrichtung per `.env`:** Kein unsicherer UI-Installations-Wizard – Initial-Sysadmin, `APP_BRAND_NAME`, `DEFAULT_LOCALE`, `ENABLED_MODULES`, Datenbank, S3 und SMTP werden einheitlich über Umgebungsvariablen konfiguriert.
* **Spielerprofile, Multi-Units & Einladungen:** Spieler pflegen vollen Namen, Trikotnummer, Position, Kontakte und vom Team Admin definierte Custom-Felder. Two-Way-Spieler tragen mehrere Units (`Offense`, `Defense`, `Special Teams`). Team Admins laden per E-Mail (via SMTP oder Offline-Link-Fallback) oder teilbarem Team-Link inkl. Freigabe-Warteliste ein.
* **Gekapseltes Videoanalyse-Plugin (`src/plugins/video-analysis/`):**
  * **Frame-genauer Film Room:** Editierbares Vektor-Canvas mit strikter Bindung an **exakten 25fps-Frame und Kamerawinkel**, race-freiem Auto-Stop, Vollbildmodus, editierbaren Kommentaren in verschiebbarer Ecke und konfigurierbaren Nutzer-Hotkeys.
  * **Konfigurierbares Football-Tagging & Auto-Berechnung:** Vollständiger Football-Grundstock inkl. editierbarer `YD LN` ↔ `GN/LS` Automatik (pausiert bei `FLAG`), lernendem Team-Wörterbuch und Custom-Feldern.
  * **Hybrid-Video-Modell & `/share/`-Links:** Einzelclips, Einzeldatei-Tapes (`TIME_SLICE`), optionale Sync-Offsets, `sideline-bundle.json`-Import sowie granulare Team- und `/share/`-Download-Links.

---

## Quickstart (Lokal)

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen (inkl. Initial-Sysadmin & ENABLED_MODULES)
cp .env.example .env

# 3. Entwicklungsserver starten (Port 3000)
npm run dev
```

### Qualitätssicherung & Tests

```bash
# TypeScript-Prüfung
npm run lint

# Automatisierte Unit- & API-Tests
npm test

# Produktions-Build (Core & eigenständiges SDK-Paket)
npm run build
npm run build:sdk
```

---

## Verzeichnisstruktur

```text
sidelineos/
├── .env.example                       # ENV-Bootstrap (Sysadmin, Brand, Sprache, DB, S3, SMTP)
├── LICENSE                            # GNU AGPLv3
├── README.md                          # Projektübersicht & Quickstart
├── deploy/
│   ├── lxc/                           # Proxmox-LXC & Raspberry-Pi Installer, Updater & systemd-Unit
│   └── docker/                        # Optionales Multi-Arch-Dockerfile (amd64 & arm64)
├── docs/                              # Ausführliche Projektdokumentation
│   ├── architecture.md                # System-, Core/Plugin- & Storage-Architektur
│   ├── deployment-proxmox-lxc.md      # Deployment-Leitfaden (Proxmox LXC, Cloudflare R2, Backup)
│   ├── plugin-sdk.md                  # Strukturelle Voraussetzungen & SDK für externe Plugins
│   └── json-bundle-format.md          # Spezifikation sideline-bundle.json (v1.0)
├── src/
│   ├── sdk/
│   │   └── plugin.ts                  # Verbindlicher Plugin-Vertrag (@sidelineos/plugin-sdk)
│   ├── core/                          # Core-Hub, Auth/Invite, i18n, Plugin Store, SettingsShell, RBAC
│   ├── server/                        # Express API, PostgreSQL/PGlite, Plugin-Gateway, S3-Broker & SMTP
│   ├── plugins/
│   │   ├── pluginLoader.ts            # Lädt installierte Store-Plugins in den Core
│   │   ├── previewPlugins.tsx         # Vorschau-/Drittanbieter-Adapter für GitHub-Plugins
│   │   └── video-analysis/            # In sich gekapselt (bereit für eigenes GitHub-Repo)
│   │       ├── plugin.manifest.json   # Deklaratives Store-Manifest
│   │       ├── AI_HANDOFF.md          # Übergabe-Dokumentation für die Videoanalyse-Weiterentwicklung
│   │       ├── index.tsx              # SidelinePlugin-Einstiegspunkt (inkl. renderPublicShareView)
│   │       ├── locales/               # Sprachpakete (de.json, en.json)
│   │       ├── VideoAnalysisContext.tsx
│   │       ├── components/            # Dashboard, Film Room, Canvas, Breakdown, PublicShare, Settings
│   │       └── services/              # Tagging-Engine, Bundle-Schema, Frame-Math & Hotkeys
│   └── shared/                        # Übergreifende Core-Typen, Brand-Config & i18n-Helfer
└── tests/
    └── unit/                          # Automatisierte Unit- & API-Tests (node:test)
```

---

## Dokumentation

* [Proxmox-LXC & Cloudflare-R2 Deployment-Leitfaden](docs/deployment-proxmox-lxc.md)
* [Architektur- & Storage-Konzept](docs/architecture.md)
* [Plugin SDK & Voraussetzungen für eigene GitHub-Module](docs/plugin-sdk.md)
* [JSON-Bundle-Format (`sideline-bundle.json` v1.0)](docs/json-bundle-format.md)

---

## Roadmap (SidelineOS-Core)

> **Hinweis zur Modultrennung:** In diesem Repository wird **ausschließlich der Core** (Auth, Mandanten, Infrastruktur, `@sidelineos/plugin-sdk`, Plugin Store) weiterentwickelt. Fachliche Modul-Features (z. B. Cut & Multi-Angle Sync oder Smart Playlists in der Videoanalyse) liegen in der Roadmap der jeweiligen Plugin-Repositories (siehe [`src/plugins/video-analysis/AI_HANDOFF.md`](src/plugins/video-analysis/AI_HANDOFF.md)).

### Abgeschlossen (Core-Phasen 1–3, R1 & R2 → Alpha bereit)
- [x] **Core-Grundstruktur & Entkopplung:** SidelineOS-Hub, Einstellungs-Hub mit offenem Seitenmenü, dauerhafte Multi-Saison-Teams, Multi-Unit-Kader, Einladungsmanagement & `@sidelineos/plugin-sdk` (`v1.0`) inkl. GitHub Plugin Store
- [x] **Core-Auth & Öffentliche Routen:** Login-Maske (`/login`), Einladungs-Registrierung (`/invite/<token>` inkl. Bestätigungs-Warteliste) sowie SDK-Delegation für öffentliche Plugin-Routen (`/share/<token>`)
- [x] **Plugin-Migration vorbereitet:** Bisheriger Videoanalyse-Prototyp vollständig in `src/plugins/video-analysis/` gekapselt und für die Auslagerung nach `sidelineos-plugin-video` dokumentiert
- [x] **Core-Phase 1 – Backend-Fundament & `.env`-Bootstrap:** Stateless Node.js/Express-API (`/api/v1/*`), PostgreSQL-Schema (+ `PGlite`-Dev-Fallback) für Core-Tabellen & isolierte `plugin_<slug>`-Schemas, `scrypt`-Passwort-Hashing & Session-Auth, deployment-unabhängiges `.env`-Bootstrap (`INITIAL_SYSADMIN_*`, `ENABLED_MODULES`)
- [x] **Core-Phase 2 – S3-Broker & SMTP-Service:** Serverseitig signierte Presigned-URLs auf Team-/Plugin-Präfixe (`teams/{teamId}/plugins/{slug}/`, kompatibel mit Cloudflare R2, MinIO & Garage-S3), AES-256-GCM-verschlüsselte Infrastruktur-Einstellungen (`core.system_settings`), S3-/SMTP-Verbindungstests im Sysadmin-UI sowie E-Mail-Einladungsversand via `nodemailer` inkl. Offline-Link-Fallback
- [x] **Core-Phase 3 – Eigenständiges SDK & GitHub Plugin-Installer:** Auskopplung von `@sidelineos/plugin-sdk` (`packages/plugin-sdk/` inkl. `ExchangeTarget` & Scope-Export/Import-Vertrag), Dual-Mode Plugin-Installer (verifizierte GitHub-Releases + SHA-256, Offline-`.tar.gz`-Upload, Dev-Git-Clone mit `403`-Production-Sperre, `previous_version`-Rollback), Core-/Plugin-Update-Checker mit Sysadmin-Badge & Banner sowie `core.schema_migrations` + anonymisierte `core.s3_cleanup_queue` mit Schonfrist
- [x] **R1 – Rebranding-Vorbereitung & i18n-Fundament (DE/EN + Plugin-Sprachpakete):** Zentrale Brand-Konfiguration (`APP_BRAND_NAME` / `VITE_APP_BRAND_NAME`) für UI, E-Mails und Header ohne Umbau technischer IDs; typsicheres Core-i18n (`de` Standard, `en` erweiterbar), persistente Benutzer-Sprache (`preferred_locale`) sowie Weiterleitung über `@sidelineos/plugin-sdk` (`locale` + `createPluginTranslator`) inkl. vollständig lokalisierter Videoanalyse
- [x] **R2 – Basis-Deployment (Proxmox LXC, Cloudflare R2 & Multi-Arch):** Idempotenter Debian-/systemd-Installer (`deploy/lxc/install-core.sh`, `update-core.sh` für `amd64` & `arm64`), Cloudflare-R2-Presigned-Fix (`WHEN_REQUIRED`), optionales Multi-Arch-`Dockerfile` sowie Betriebsanleitung & Alpha-Checkliste (`docs/deployment-proxmox-lxc.md`)

### Aktuell: Alpha-Release (`v0.1.0-alpha.1` – Einzelnutzer-Selbsttest)
- [ ] **Einzelnutzer-Selbsttest im Proxmox-LXC** gemäß [Alpha-Checkliste](docs/deployment-proxmox-lxc.md#7-alpha-selbsttest-checkliste-v010-alpha1) durchführen

### Post-Alpha: Core-Ausbau vor Testnutzern → Closed Beta (`v0.1.0-beta.1`)
- [ ] **Zentrales Upload- & File-Handling:** Einheitlicher S3-Upload-Proxy / Presigned-Multipart-Service, Quotas/Limits, Upload-Fortschritt sowie sichere Datei-Validierung für alle Plugins
- [ ] **Benachrichtigungs-System:** In-App-Notification-Center, E-Mail-Versand via SMTP (z. B. Team-Freigaben, neue Einladungen, Updates) und `@sidelineos/plugin-sdk`-Hooks für Plugin-Benachrichtigungen

### Spätere `v1.x`-Meilensteine
- [ ] **Core-Phase 4 – Instanz-Federation (`team@instance`):** Gegenseitiges Sysadmin-Pairing zweier SidelineOS-Core-Instanzen per Pairing-Token (Ed25519-/HMAC-signierte Server-to-Server-API), Synchronisation minimaler Team-Metadaten und transparente SDK-Adressierung (`ExchangeTarget`: `LOCAL` | `REMOTE`)
- [ ] **Core-Phase 5 – Lokale Teamkopie & Camp-Modus (Offline / Raspberry Pi):** Selektive Teamkopie (Sysadmin / Team Admin) inkl. optionaler Passwort-Hashes, Modul-/S3-Medien-Filter sowie `.sideline-camp.tar`-Transfer & Delta-Rück-Sync (`origin_instance_id` + UUID-Merge)
- [ ] **Konto-Portabilität & Multi-Arch-Extras:** Export-/Migrations-Token für globale Benutzerkonten sowie optionale Mobile-/Desktop-Wrapper (Capacitor/Tauri)

### Später (ganz am Schluss)
- [ ] **Widgets (Dashboard & Extern):** Konfigurierbare Dashboard-Widgets im Hub sowie sicher signierte, extern einbettbare HTML-/iframe-Widgets für Vereinswebsites & Apps

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

<p align="left">
  <img src="docs/assets/sidelineos-logo.svg" alt="SidelineOS Logo" width="280" />
</p>

# SidelineOS-Core

**SidelineOS-Core** ist eine quelloffene, modulare und selbstgehostete Multi-Tenant-Plattform von Coaches für Coaches (American Football & andere Teamsportarten). Der schlanke **SidelineOS-Core** übernimmt Benutzerkonten, Teams/Saisons, Auth/Einladungen, S3-Infrastruktur und einen **Plugin Store**, über den eigenständige GitHub-Module (wie die Videoanalyse) unabhängig entwickelt und installiert werden.

> **Projektstatus:** **SidelineOS-Core** verfügt über ein produktionsnahes Backend-Fundament (`Express`, `PostgreSQL`/`PGlite`, `scrypt`-Auth, `HttpOnly`-Sessions, RBAC, isolierte `plugin_<slug>`-Schemas), einen **S3-Broker** (Presigned-URLs, Präfix-Isolation, AES-256-GCM-verschlüsselte Konfiguration, anonymisierte **S3-Cleanup-Queue** mit Schonfrist), einen **SMTP-Service** (`nodemailer` mit Offline-Link-Fallback) sowie das eigenständige `@sidelineos/plugin-sdk`-Paket samt Dual-Mode Plugin-Installer (verifizierte GitHub-Releases + SHA-256, Offline-`.tar.gz`-Upload, Dev-Git-Clone & Update-/Rollback-Center). Als nächstes folgt **Core-Phase 4** (Instanz-Federation `team@instance`).

---

## Kernfunktionen

* **Schlanker Core & GitHub Plugin Store:** SidelineOS-Core enthält nur Authentifizierung, Einladungen, Mandanten/Teams, S3/SMTP, Hub, Einstellungs-Hub und den **Plugin Store**. Fachmodule implementieren das verbindliche `@sidelineos/plugin-sdk` (`src/sdk/plugin.ts`), werden über den Store (inkl. eigener GitHub-URLs) installiert und pro Team freigeschaltet.
* **Aufgeräumte Startseite & Einstellungs-Hub:** Die Startseite zeigt ausschließlich Kacheln für die freigeschalteten Plugins des Teams sowie eine Kachel `Einstellungen`. Aktive Plugins klinken eigene Einstellungs-Kategorien dynamisch in die drei zentralen Einstellungsbereiche (`Persönliche Einstellungen`, `Team-Einstellungen`, `Sysadmin`) ein.
* **Dauerhafte Multi-Saison-Teams:** Teams bleiben saisonübergreifend bestehen (`2026`, `2025`, `2024`, …). Alte Spielzeiten bleiben abrufbar, ohne Kader oder Einstellungen neu anzulegen.
* **Deployment-unabhängige Ersteinrichtung per `.env`:** Kein unsicherer UI-Installations-Wizard – Initial-Sysadmin, `ENABLED_MODULES`, Datenbank, S3 und SMTP werden einheitlich über Umgebungsvariablen konfiguriert.
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
├── .env.example                       # ENV-Bootstrap (Sysadmin, ENABLED_MODULES, DB, S3, SMTP)
├── LICENSE                            # GNU AGPLv3
├── README.md                          # Projektübersicht & Quickstart
├── docs/                              # Ausführliche Projektdokumentation
│   ├── architecture.md                # System-, Core/Plugin- & Storage-Architektur
│   ├── plugin-sdk.md                  # Strukturelle Voraussetzungen & SDK für externe Plugins
│   └── json-bundle-format.md          # Spezifikation sideline-bundle.json (v1.0)
├── src/
│   ├── sdk/
│   │   └── plugin.ts                  # Verbindlicher Plugin-Vertrag (@sidelineos/plugin-sdk)
│   ├── core/                          # Core-Hub, Auth/Invite, Plugin Store, SettingsShell, RBAC
│   ├── server/                        # Express API, PostgreSQL/PGlite, Plugin-Gateway, S3-Broker & SMTP
│   ├── plugins/
│   │   ├── pluginLoader.ts            # Lädt installierte Store-Plugins in den Core
│   │   ├── previewPlugins.tsx         # Vorschau-/Drittanbieter-Adapter für GitHub-Plugins
│   │   └── video-analysis/            # In sich gekapselt (bereit für eigenes GitHub-Repo)
│   │       ├── plugin.manifest.json   # Deklaratives Store-Manifest
│   │       ├── AI_HANDOFF.md          # Übergabe-Dokumentation für die Videoanalyse-Weiterentwicklung
│   │       ├── index.tsx              # SidelinePlugin-Einstiegspunkt (inkl. renderPublicShareView)
│   │       ├── VideoAnalysisContext.tsx
│   │       ├── components/            # Dashboard, Film Room, Canvas, Breakdown, PublicShare, Settings
│   │       └── services/              # Tagging-Engine, Bundle-Schema, Frame-Math & Hotkeys
│   └── shared/                        # Übergreifende Core-Typen (Benutzer, Team, S3, SMTP)
└── tests/
    └── unit/                          # Automatisierte Unit- & API-Tests (node:test)
```

---

## Dokumentation

* [Architektur- & Storage-Konzept](docs/architecture.md)
* [Plugin SDK & Voraussetzungen für eigene GitHub-Module](docs/plugin-sdk.md)
* [JSON-Bundle-Format (`sideline-bundle.json` v1.0)](docs/json-bundle-format.md)

---

## Roadmap (SidelineOS-Core)

> **Hinweis zur Modultrennung:** In diesem Repository wird **ausschließlich der Core** (Auth, Mandanten, Infrastruktur, `@sidelineos/plugin-sdk`, Plugin Store) weiterentwickelt. Fachliche Modul-Features (z. B. Cut & Multi-Angle Sync oder Smart Playlists in der Videoanalyse) liegen in der Roadmap der jeweiligen Plugin-Repositories (siehe [`src/plugins/video-analysis/AI_HANDOFF.md`](src/plugins/video-analysis/AI_HANDOFF.md)).

### Abgeschlossen
- [x] **Core-Grundstruktur & Entkopplung:** SidelineOS-Hub, Einstellungs-Hub mit offenem Seitenmenü, dauerhafte Multi-Saison-Teams, Multi-Unit-Kader, Einladungsmanagement & `@sidelineos/plugin-sdk` (`v1.0`) inkl. GitHub Plugin Store
- [x] **Core-Auth & Öffentliche Routen:** Login-Maske (`/login`), Einladungs-Registrierung (`/invite/<token>` inkl. Bestätigungs-Warteliste) sowie SDK-Delegation für öffentliche Plugin-Routen (`/share/<token>`)
- [x] **Plugin-Migration vorbereitet:** Bisheriger Videoanalyse-Prototyp vollständig in `src/plugins/video-analysis/` gekapselt und für die Auslagerung nach `sidelineos-plugin-video` dokumentiert
- [x] **Core-Phase 1 – Backend-Fundament & `.env`-Bootstrap:** Stateless Node.js/Express-API (`/api/v1/*`), PostgreSQL-Schema (+ `PGlite`-Dev-Fallback) für Core-Tabellen & isolierte `plugin_<slug>`-Schemas, `scrypt`-Passwort-Hashing & Session-Auth, deployment-unabhängiges `.env`-Bootstrap (`INITIAL_SYSADMIN_*`, `ENABLED_MODULES`)
- [x] **Core-Phase 2 – S3-Broker & SMTP-Service:** Serverseitig signierte Presigned-URLs auf Team-/Plugin-Präfixe (`teams/{teamId}/plugins/{slug}/`, kompatibel mit MinIO & Garage-S3), AES-256-GCM-verschlüsselte Infrastruktur-Einstellungen (`core.system_settings`), S3-/SMTP-Verbindungstests im Sysadmin-UI sowie E-Mail-Einladungsversand via `nodemailer` inkl. Offline-Link-Fallback
- [x] **Core-Phase 3 – Eigenständiges SDK & GitHub Plugin-Installer:** Auskopplung von `@sidelineos/plugin-sdk` (`packages/plugin-sdk/` inkl. `ExchangeTarget` & Scope-Export/Import-Vertrag), Dual-Mode Plugin-Installer (verifizierte GitHub-Releases + SHA-256, Offline-`.tar.gz`-Upload, Dev-Git-Clone mit `403`-Production-Sperre, `previous_version`-Rollback), Core-/Plugin-Update-Checker mit Sysadmin-Badge & Banner sowie `core.schema_migrations` + anonymisierte `core.s3_cleanup_queue` mit Schonfrist

### Nächste Core-Meilensteine
- [ ] **Core-Phase 4 – Instanz-Federation (`team@instance`):** Gegenseitiges Sysadmin-Pairing zweier SidelineOS-Core-Instanzen per Pairing-Token (Ed25519-/HMAC-signierte Server-to-Server-API), Synchronisation minimaler Team-Metadaten und transparente SDK-Adressierung (`ExchangeTarget`: `LOCAL` | `REMOTE`), sodass fremde Teams wie lokale Teams angesprochen werden können
- [ ] **Core-Phase 5 – Lokale Teamkopie & Camp-Modus (Offline / Raspberry Pi):** Selektive Teamkopie (Sysadmin für alle Teams, Team Admin für eigenes Team) inkl. optionaler Mitnahme der Benutzer-Passwort-Hashes, granularer Modul-Auswahl (Alle / Gefiltert / Keine) und selektiver S3-Medienübertragung (Alle / Ausgewählte / Keine; fehlende Dateien sauber markiert). Unterstützt sowohl direkten Core-to-Core-Transfer als auch `.sideline-camp.tar`-Archive (USB/Air-Gapped) inklusive **Delta-Rück-Sync** (`origin_instance_id` + UUID-Merge) nach dem Trainingslager
- [ ] **Abschluss – Deployment & Konto-Portabilität:** Multi-Arch-Container (`linux/amd64` + `linux/arm64` für Raspberry Pi), `Docker Compose`-Setup, Export-/Migrations-Token für globale Benutzerkonten sowie Capacitor-/Tauri-Wrapper für Mobile & Desktop

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

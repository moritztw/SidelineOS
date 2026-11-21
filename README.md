<p align="left">
  <img src="docs/assets/sidelineos-logo.svg" alt="SidelineOS Logo" width="280" />
</p>

# SidelineOS-Core

**SidelineOS-Core** ist eine quelloffene, modulare und selbstgehostete Multi-Tenant-Plattform von Coaches für Coaches (American Football & andere Teamsportarten). Der schlanke **SidelineOS-Core** übernimmt Benutzerkonten, Teams/Saisons, Auth/Einladungen, S3-Infrastruktur und einen **Plugin Store**, über den eigenständige GitHub-Module (wie die Videoanalyse) unabhängig entwickelt und installiert werden.

> **Projektstatus:** Aktiver Core-Prototyp (**Core-UI & `@sidelineos/plugin-sdk` v1.0 vollständig entkoppelt** – inkl. Hub, Einstellungs-Shell, Plugin Store, `/login`, `/invite/<token>` sowie delegierter `/share/<token>`-Route). Ab sofort wird in diesem Repository **ausschließlich der SidelineOS-Core** weiterentwickelt; fachliche Module (wie die Videoanalyse unter `src/plugins/video-analysis/`) werden in eigenen Plugin-Repositories gepflegt. Als nächstes folgt die **Core-Backend-Umsetzung** (PostgreSQL, Auth, S3-Broker, SMTP & GitHub-Plugin-Installer).

---

## Kernfunktionen

* **Schlanker Core & GitHub Plugin Store:** SidelineOS-Core enthält nur Authentifizierung, Einladungen, Mandanten/Teams, S3/SMTP, Hub, Einstellungs-Hub und den **Plugin Store**. Fachmodule implementieren das verbindliche `@sidelineos/plugin-sdk` (`src/sdk/plugin.ts`), werden über den Store (inkl. eigener GitHub-URLs) installiert und pro Team freigeschaltet.
* **Aufgeräumte Startseite & Einstellungs-Hub:** Die Startseite zeigt ausschließlich Kacheln für die freigeschalteten Plugins des Teams sowie eine Kachel `Einstellungen`. Aktive Plugins klinken eigene Einstellungs-Kategorien dynamisch in die drei zentralen Einstellungsbereiche (`Persönliche Einstellungen`, `Team-Einstellungen`, `Sysadmin`) ein.
* **Dauerhafte Multi-Saison-Teams:** Teams bleiben saisonübergreifend bestehen (`2026`, `2025`, `2024`, …). Alte Spielzeiten bleiben abrufbar, ohne Kader oder Einstellungen neu anzulegen.
* **Deployment-unabhängige Ersteinrichtung per `.env`:** Kein unsicherer UI-Installations-Wizard – Initial-Sysadmin, `ENABLED_MODULES`, Datenbank, S3 und SMTP werden einheitlich über Umgebungsvariablen konfiguriert.
* **Spielerprofile, Multi-Units & Einladungen:** Spieler pflegen vollen Namen, Trikotnummer, Position, Kontakte und vom Team Admin definierte Custom-Felder. Two-Way-Spieler tragen mehrere Units (`Offense`, `Defense`, `Special Teams`). Team Admins laden per E-Mail oder teilbarem Team-Link inkl. Freigabe-Warteliste ein.
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

# Automatisierte Unit-Tests
npm test

# Produktions-Build
npm run build
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
    └── unit/                          # Automatisierte Unit-Tests (node:test)
```

---

## Dokumentation

* [Architektur- & Storage-Konzept](docs/architecture.md)
* [Plugin SDK & Voraussetzungen für eigene GitHub-Module](docs/plugin-sdk.md)
* [JSON-Bundle-Format (`sideline-bundle.json` v1.0)](docs/json-bundle-format.md)

---

## Roadmap (SidelineOS-Core)

> **Hinweis zur Modultrennung:** In diesem Repository wird **ausschließlich der Core** (Auth, Mandanten, Infrastruktur, `@sidelineos/plugin-sdk`, Plugin Store) weiterentwickelt. Fachliche Modul-Features (z. B. Cut & Multi-Angle Sync oder Smart Playlists in der Videoanalyse) liegen in der Roadmap der jeweiligen Plugin-Repositories (siehe [`src/plugins/video-analysis/AI_HANDOFF.md`](src/plugins/video-analysis/AI_HANDOFF.md)).

### Abgeschlossen (UI- & SDK-Architektur)
- [x] **Core-Grundstruktur & Entkopplung:** SidelineOS-Core-Hub, Einstellungs-Hub mit offenem Seitenmenü, dauerhafte Multi-Saison-Teams, Multi-Unit-Kader, Einladungsmanagement & `@sidelineos/plugin-sdk` (`v1.0`) inkl. GitHub Plugin Store
- [x] **Core-Auth & Öffentliche Routen:** Login-Maske (`/login`), Einladungs-Registrierung (`/invite/<token>` inkl. Bestätigungs-Warteliste) sowie SDK-Delegation für öffentliche Plugin-Routen (`/share/<token>`)
- [x] **Plugin-Migration vorbereitet:** Bisheriger Videoanalyse-Prototyp vollständig in `src/plugins/video-analysis/` gekapselt und für die Auslagerung nach `sidelineos-plugin-video` dokumentiert

### Nächste Core-Meilensteine
- [ ] **Core-Phase 1 – Backend-Fundament & `.env`-Bootstrap:** Stateless Node.js/Express-API (`/api/v1/*`), PostgreSQL-Schema für Core-Tabellen (Konten, Teams, Saisons, Mitgliedschaften, Einladungen), Passwort-Hashing (Argon2id/scrypt) & Session-Auth, deployment-unabhängiges `.env`-Bootstrap (`INITIAL_SYSADMIN_*`, `ENABLED_MODULES`) sowie Multi-Arch-Container (`linux/amd64` + `linux/arm64` für Raspberry Pi)
- [ ] **Core-Phase 2 – S3-Broker & SMTP-Service:** Serverseitig signierte Presigned-URLs auf Team-/Plugin-Präfixe (`teams/{teamId}/plugins/{slug}/`, kompatibel mit MinIO & ressourcenschonendem Garage-S3), anonymisierte Sysadmin-S3-Cleanup-Queue mit Schonfrist sowie E-Mail-Versand für Einladungen und Passwort-Zurücksetzungen
- [ ] **Core-Phase 3 – Eigenständiges SDK & GitHub Plugin-Installer:** Auskopplung von `@sidelineos/plugin-sdk` als eigenständiges Paket (inkl. Scope-Export/Import-Vertrag), Verifikation & Installation externer `sideline-plugin-v1`-Releases aus GitHub (Manifest-Prüfung, SHA256, isolierte `dbPrefix`-Migrationen, `403`-Scope-Enforcement) sowie `Docker Compose`-Setup
- [ ] **Core-Phase 4 – Instanz-Federation (`team@instance`):** Gegenseitiges Sysadmin-Pairing zweier SidelineOS-Core-Instanzen per Pairing-Token (Ed25519-/HMAC-signierte Server-to-Server-API), Synchronisation minimaler Team-Metadaten und transparente SDK-Adressierung (`ExchangeTarget`: `LOCAL` | `REMOTE`), sodass fremde Teams wie lokale Teams angesprochen werden können
- [ ] **Core-Phase 5 – Lokale Teamkopie & Camp-Modus (Offline / Raspberry Pi):** Selektive Teamkopie (Sysadmin für alle Teams, Team Admin für eigenes Team) inkl. optionaler Mitnahme der Benutzer-Passwort-Hashes, granularer Modul-Auswahl (Alle / Gefiltert / Keine) und selektiver S3-Medienübertragung (Alle / Ausgewählte / Keine; fehlende Dateien sauber markiert). Unterstützt sowohl direkten Core-to-Core-Transfer als auch `.sideline-camp.tar`-Archive (USB/Air-Gapped) inklusive **Delta-Rück-Sync** (`origin_instance_id` + UUID-Merge) nach dem Trainingslager
- [ ] **Später – Konto-Portabilität & Native Wrapper:** Export-/Migrations-Token für den Umzug globaler Benutzerkonten auf andere SidelineOS-Core-Instanzen sowie Capacitor-/Tauri-Builds für Mobile & Desktop

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

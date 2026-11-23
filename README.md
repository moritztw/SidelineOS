<p align="left">
  <img src="docs/assets/sidelineos-logo.svg" alt="SidelineOS Logo" width="280" />
</p>

# SidelineOS-Core

**SidelineOS-Core** ist eine quelloffene, modulare und selbstgehostete Multi-Tenant-Plattform von Coaches für Coaches (American Football & andere Teamsportarten). Der schlanke **SidelineOS-Core** übernimmt Benutzerkonten, Teams/Saisons, Auth/Einladungen, S3-Infrastruktur und einen **Plugin Store**, über den eigenständige GitHub-Module (wie die Videoanalyse) unabhängig entwickelt und installiert werden.

> **Projektstatus:** **SidelineOS-Core** ist bereit für den **Alpha-Selbsttest (`v0.1.0-alpha.1`)**: Produktionsnahes Backend (`Express`, `PostgreSQL`/`PGlite`, `scrypt`-Auth, `HttpOnly`-Sessions, RBAC, isolierte `plugin_<slug>`-Schemas), **S3-Broker** inkl. Multipart-Uploads & Cloudflare-R2-Support (Presigned-URLs, Größen-/MIME-Prüfung, Präfix-Isolation, AES-256-GCM, anonymisierte **S3-Cleanup-Queue**), **SMTP-Service**, **Notification-Endpunkt** (`in-app` & `smtp` + erweiterbare Channel-Plugins), `@sidelineos/plugin-sdk` samt **dynamischem Plugin-Runtime-Loader** (Client-ESM + Server-Backend-Bundles ohne Core-Rebuild), **Rebranding-Vorbereitung** & **i18n (DE/EN)** sowie **Proxmox-LXC-Deployment** (`systemd` + Multi-Arch-`Dockerfile`). Damit ist der funktionale Core-Unterbau vorerst abgeschlossen; weitere Zustellwege und Fachfunktionen folgen als eigenständige Plugins.

---

## Kernfunktionen

* **Schlanker Core & GitHub Plugin Store:** SidelineOS-Core ([`moritztw/SidelineOS-core`](https://github.com/moritztw/SidelineOS-core)) enthält ausschließlich Authentifizierung, Einladungen, Mandanten/Teams, S3/SMTP, i18n, Hub, Einstellungs-Hub und den **Plugin Store**. Fachmodule implementieren das verbindliche `@sidelineos/plugin-sdk` (`packages/plugin-sdk/`), werden über den Store installiert und pro Team freigeschaltet.
* **Aufgeräumte Startseite & Einstellungs-Hub:** Die Startseite zeigt ausschließlich Kacheln für die installierten und fürs Team freigeschalteten Plugins sowie eine Kachel `Einstellungen`. Aktive Plugins klinken eigene Einstellungs-Kategorien dynamisch in die drei zentralen Einstellungsbereiche (`Persönliche Einstellungen`, `Team-Einstellungen`, `Sysadmin`) ein.
* **Zentrale Spracheinstellung (DE / EN):** Benutzer wählen ihre UI-Sprache einmalig in den persönlichen Einstellungen (`preferred_locale`). Core und alle installierten Plugins erhalten die gewählte Sprache einheitlich über den SDK-Kontext (`locale`).
* **Dauerhafte Multi-Saison-Teams:** Teams bleiben saisonübergreifend bestehen (`2026`, `2025`, `2024`, …). Alte Spielzeiten bleiben abrufbar, ohne Kader oder Einstellungen neu anzulegen.
* **Deployment-unabhängige Ersteinrichtung per `.env`:** Kein unsicherer UI-Installations-Wizard – Initial-Sysadmin, `APP_BRAND_NAME`, `DEFAULT_LOCALE`, Datenbank, S3 und SMTP werden einheitlich über Umgebungsvariablen konfiguriert; Plugins werden nach dem Setup bequem im Sysadmin-Plugin-Store per GUI installiert.
* **Spielerprofile, Multi-Units & Einladungen:** Spieler pflegen vollen Namen, Trikotnummer, Position, Kontakte und vom Team Admin definierte Custom-Felder. Two-Way-Spieler tragen mehrere Units (`Offense`, `Defense`, `Special Teams`). Team Admins laden per E-Mail (via SMTP oder Offline-Link-Fallback) oder teilbarem Team-Link inkl. Freigabe-Warteliste ein.

---

## Offizielle Plugins

| Plugin | Repository | Beschreibung |
| :--- | :--- | :--- |
| **Videoanalyse (`video-analysis`)** | [`moritztw/SidelineOS-video`](https://github.com/moritztw/SidelineOS-video) | Multi-Angle Film Room, exakte Frame-Telestration (25fps), Hudl-kompatibles Breakdown-Tagging, Team-Sharing & `/share/`-Links (installierbar über den Sysadmin Plugin Store). |

---

## Quickstart (Lokal)

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen (inkl. Initial-Sysadmin)
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
│   │   └── pluginLoader.ts            # Loader-Schnittstelle für externe Store-Plugins
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

> **Hinweis zur Modultrennung:** In diesem Repository wird **ausschließlich der Core** (Auth, Mandanten, Infrastruktur, `@sidelineos/plugin-sdk`, Plugin Store) weiterentwickelt. Fachliche Modul-Features liegen in ihren eigenen Plugin-Repositories (z. B. [`moritztw/SidelineOS-video`](https://github.com/moritztw/SidelineOS-video)).

### Abgeschlossen (Core-Phasen 1–3, R1 & R2 → Alpha bereit)
- [x] **Core-Grundstruktur & Entkopplung:** SidelineOS-Hub, Einstellungs-Hub mit offenem Seitenmenü, dauerhafte Multi-Saison-Teams, Multi-Unit-Kader, Einladungsmanagement & `@sidelineos/plugin-sdk` (`v1.0`) inkl. GitHub Plugin Store
- [x] **Core-Auth & Öffentliche Routen:** Login-Maske (`/login`), Einladungs-Registrierung (`/invite/<token>` inkl. Bestätigungs-Warteliste) sowie SDK-Delegation für öffentliche Plugin-Routen (`/share/<token>`)
- [x] **Plugin-Auslagerung abgeschlossen:** Videoanalyse vollständig in [`moritztw/SidelineOS-video`](https://github.com/moritztw/SidelineOS-video) ausgelagert und Fake-Preview-Module aus dem Core entfernt
- [x] **Core-Phase 1 – Backend-Fundament & `.env`-Bootstrap:** Stateless Node.js/Express-API (`/api/v1/*`), PostgreSQL-Schema (+ `PGlite`-Dev-Fallback) für Core-Tabellen & isolierte `plugin_<slug>`-Schemas, `scrypt`-Passwort-Hashing & Session-Auth, deployment-unabhängiges `.env`-Bootstrap (`INITIAL_SYSADMIN_*`)
- [x] **Core-Phase 2 – S3-Broker & SMTP-Service:** Serverseitig signierte Presigned-URLs auf Team-/Plugin-Präfixe (`teams/{teamId}/plugins/{slug}/`, kompatibel mit Cloudflare R2, MinIO & Garage-S3), AES-256-GCM-verschlüsselte Infrastruktur-Einstellungen (`core.system_settings`), S3-/SMTP-Verbindungstests im Sysadmin-UI sowie E-Mail-Einladungsversand via `nodemailer` inkl. Offline-Link-Fallback
- [x] **Core-Phase 3 – Eigenständiges SDK & GitHub Plugin-Installer:** Auskopplung von `@sidelineos/plugin-sdk` (`packages/plugin-sdk/` inkl. `ExchangeTarget` & Scope-Export/Import-Vertrag), Dual-Mode Plugin-Installer (verifizierte GitHub-Releases + SHA-256, Offline-`.tar.gz`-Upload, Dev-Git-Clone mit `403`-Production-Sperre, `previous_version`-Rollback), Core-/Plugin-Update-Checker mit Sysadmin-Badge & Banner sowie `core.schema_migrations` + anonymisierte `core.s3_cleanup_queue` mit Schonfrist
- [x] **R1 – Rebranding-Vorbereitung & i18n-Fundament (DE/EN + Plugin-Sprachpakete):** Zentrale Brand-Konfiguration (`APP_BRAND_NAME` / `VITE_APP_BRAND_NAME`) für UI, E-Mails und Header ohne Umbau technischer IDs; typsicheres Core-i18n (`de` Standard, `en` erweiterbar), persistente Benutzer-Sprache (`preferred_locale`) sowie Weiterleitung über `@sidelineos/plugin-sdk` (`locale` + `createPluginTranslator`) inkl. vollständig lokalisierter Videoanalyse
- [x] **R2 – Basis-Deployment (Proxmox LXC, Cloudflare R2 & Multi-Arch):** Idempotenter Debian-/systemd-Installer (`deploy/lxc/install-core.sh`, `update-core.sh` für `amd64` & `arm64`), Cloudflare-R2-Presigned-Fix (`WHEN_REQUIRED`), optionales Multi-Arch-`Dockerfile` sowie Betriebsanleitung & Alpha-Checkliste (`docs/deployment-proxmox-lxc.md`)
- [x] **Dynamischer Plugin-Runtime-Loader:** Automatisches Laden installierter Server-Bundles (`dist/server.js`) beim Boot & live im Betrieb sowie Client-ESM-Bundles (`dist/client.js`, `dist/client.css`) über Browser-ImportMap & Core-Shims ohne Core-Rebuild
- [x] **Zentrales Upload- & File-Handling (Core-S3-Broker):** Presigned Single-PUT & S3-Multipart-Uploads (`init`, `sign-part`, `complete`, `abort`), MIME-Typ-Validierung sowie konfigurierbares Upload-Größenlimit (`S3_MAX_UPLOAD_BYTES`)
- [x] **Core-Notification-Endpunkt & erweiterbare Kanäle:** Zentraler Dispatcher (`/api/v1/notifications`, `/_notifications/send`) mit Core-Standardkanälen (`in-app`, `smtp`) sowie SDK-Vertrag (`notifications:channel` / `deliverNotification`) für nachgelieferte Channel-Plugins

### Aktuell: Alpha-Release (`v0.1.0-alpha.1` – Einzelnutzer-Selbsttest)
- [ ] **Einzelnutzer-Selbsttest im Proxmox-LXC** gemäß [Alpha-Checkliste](docs/deployment-proxmox-lxc.md#7-alpha-selbsttest-checkliste-v010-alpha1) durchführen

### Geplante Erweiterungen (aufgeteilt in Core vs. Plugin)

| Feature | Was gehört in **SidelineOS-Core** | Was wird als **Plugin** nachgeliefert |
| :--- | :--- | :--- |
| **Benachrichtigungs-Wege** | Zentraler Notification-Endpunkt, In-App-Posteingang & SMTP *(bereits umgesetzt)* | Zusätzliche Zustellwege über `notifications:channel` (z. B. Web-Push, Discord/Slack-Webhooks, Matrix, Telegram, SMS) |
| **Instanz-Federation (`team@instance`)** | Sysadmin-Pairing zweier Instanzen (Ed25519-/HMAC-Tokens), minimaler Team-Metadaten-Abgleich & `ExchangeTarget`-Routing | Umsetzung der SDK-Hooks (`listExportableItems`, `exportScope`, `importScope`) für die jeweiligen Fachdaten des Moduls |
| **Lokale Teamkopie & Camp-Modus** | Selektiver Team-/User-Export (inkl. optionaler Passwort-Hashes), `.sideline-camp.tar`-Container & UUID-Delta-Merge-Rahmen | Bereitstellung der modulbezogenen Scope-Exports & S3-Asset-Listen über die SDK-Scope-Schnittstelle |
| **Konto-Portabilität & Multi-Arch** | Signierter Account-Export-/Migrations-Token (Multi-Arch-`Dockerfile` bereits im Core) | Optionale native/Desktop-Client-Wrapper (z. B. Capacitor / Tauri) und modulspezifische Offline-Caches |
| **Widgets (Dashboard & Extern)** | Optionaler generischer SDK-Slot (`renderWidget?`) bzw. signierter Embed-Endpunkt im Core | Konkrete Widget-Darstellungen (z. B. Kader-Status, Film-Room-Aktivität, öffentliche Vereinswebsite-Embeds) |

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

---

## KI-Hinweis

Dieses Projekt wurde mithilfe von KI-Unterstützung (u. a. für Architektur-Entwürfe, Implementierung, Tests und Dokumentation) entwickelt und iterativ verfeinert. Trotz automatisierter TypeScript-Prüfungen und Unit-/API-Tests ersetzt KI-gestützte Generierung keine eigenverantwortliche Prüfung vor dem Produktiveinsatz (insbesondere hinsichtlich Sicherheit, Datenschutz, Backup-Strategie und Infrastruktur-Härtung). Sämtliche Inhalte stehen unter den Bedingungen der **GNU AGPLv3**.

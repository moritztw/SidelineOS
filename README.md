<p align="left">
  <img src="docs/assets/sidelineos-logo.svg" alt="SidelineOS Logo" width="280" />
</p>

# SidelineOS

**SidelineOS** ist eine quelloffene, modulare und selbstgehostete Multi-Tenant-Plattform von Coaches für Coaches (American Football & andere Teamsportarten). Der schlanke **SidelineOS Core** übernimmt Benutzerkonten, Teams/Saisons, S3-Infrastruktur und einen **Plugin Store**, über den eigenständige GitHub-Module (wie die Videoanalyse) unabhängig entwickelt und installiert werden.

> **Projektstatus:** Aktiver UI-Prototyp (**Option C abgeschlossen** – vollständige Entkopplung in **SidelineOS Core + `@sidelineos/plugin-sdk` + Plugin Store**, gekapseltes Videoanalyse-Plugin inkl. `AI_HANDOFF.md` für die Auslagerung ins eigene GitHub-Repo sowie zentrale Einstellungsseiten mit dynamischen Plugin-Sektionen). Als nächstes folgen Login/Invite/Share-Screens (Paket 2b-B) sowie Cut & Sync / Smart Playlists (Paket 3).

---

## Kernfunktionen

* **Schlanker Core & GitHub Plugin Store:** Der SidelineOS Core enthält nur Authentifizierung, Mandanten/Teams, S3/SMTP, Hub, Einstellungs-Hub und den **Plugin Store**. Fachmodule implementieren das verbindliche `@sidelineos/plugin-sdk` (`src/sdk/plugin.ts`), werden über den Store (inkl. eigener GitHub-URLs) installiert und pro Team freigeschaltet.
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
│   ├── core/                          # Core-Hub, Plugin Store, Registry, SettingsShell, RBAC
│   ├── plugins/
│   │   ├── pluginLoader.ts            # Lädt installierte Store-Plugins in den Core
│   │   ├── previewPlugins.tsx         # Vorschau-/Drittanbieter-Adapter für GitHub-Plugins
│   │   └── video-analysis/            # In sich gekapselt (bereit für eigenes GitHub-Repo)
│   │       ├── plugin.manifest.json   # Deklaratives Store-Manifest
│   │       ├── AI_HANDOFF.md          # Übergabe-Dokumentation für die Videoanalyse-Weiterentwicklung
│   │       ├── index.tsx              # SidelinePlugin-Einstiegspunkt
│   │       ├── VideoAnalysisContext.tsx
│   │       ├── components/            # Dashboard, Film Room, Canvas, Breakdown, SettingsPanels
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

## Roadmap

- [x] **Paket 1 & 2:** Videoanalyse-Dashboard, Film Room, Frame-Canvas, Breakdown-Tagging, `/share/`-Links
- [x] **Paket 2b-A:** SidelineOS Core-Hub, Plugin Store & `@sidelineos/plugin-sdk` Entkopplung, Multi-Saison-Teams, Einstellungs-Hub mit offenem Seitenmenü, Multi-Unit & Einladungen
- [ ] **Paket 2b-B:** Login-Maske, Einladungs-Registrierung (`/invite/<token>`) & öffentliche `/share/<token>`-Empfänger-Ansicht
- [ ] **Paket 3:** Cut & Multi-Angle Sync Editor (`Einzelclip-Sync` + `Fast-Cut Raw Tape`) & Smart Playlists (im Videoanalyse-Plugin)
- [ ] **Paket 4:** Stateless Backend (Express + PostgreSQL + S3-Broker + SMTP + ENV-Bootstrap + GitHub Plugin-Release-Installer + Docker Compose)
- [ ] **Später:** Portabler Konto-Umzug (Export/Migration eines Benutzerkontos auf einen anderen SidelineOS-Server)

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

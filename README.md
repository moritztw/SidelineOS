<p align="left">
  <img src="docs/assets/sidelineos-logo.svg" alt="SidelineOS Logo" width="280" />
</p>

# SidelineOS

**SidelineOS** ist eine quelloffene, modulare und selbstgehostete Multi-Tenant-Plattform von Coaches für Coaches (American Football & andere Teamsportarten). Sie bietet eine schlanke, datenschutzfreundliche Alternative zu kommerziellen Videoanalyse-Systemen.

> **Projektstatus:** Aktiver UI-Prototyp (**Paket 1, 2 & 2b-A abgeschlossen** – zentraler SidelineOS-Hub mit Modul-Registry, getrennte Modul- & Plattform-Navigation, zentrale Einstellungsseiten mit offenem Seitenmenü für Profil/Team/Sysadmin, Multi-Unit & Einladungs-Warteliste, Film Room mit exakter Frame-Bindung & konfigurierbaren Hotkeys). Als nächstes folgen Login/Invite/Share-Screens (Paket 2b-B) sowie Cut & Sync / Smart Playlists (Paket 3).

---

## Kernfunktionen

* **Zentraler SidelineOS-Hub & steckbare Module (`ENABLED_MODULES`):** Die Startseite bündelt alle für ein Team aktivierten Module (`Videoanalyse`, plus optionale Testmodule wie *Playbook* und *Roster & Anwesenheit*). Module werden per `.env` installiert/aktiviert und können vom Sysadmin zusätzlich pro Team freigeschaltet werden.
* **Zentrale Einstellungsseiten mit offenem Seitenmenü:** Alle Einstellungen laufen am Hub zusammen (`Einstellungen`, `Team-Einstellungen`, `Sysadmin`) und binden Optionen aktiver Module automatisch als eigene Kategorien ein. Ein Klick auf das `SidelineOS`-Logo führt jederzeit zurück zum Hub.
* **Deployment-unabhängige Ersteinrichtung per `.env`:** Kein unsicherer UI-Installations-Wizard – Initial-Sysadmin, aktivierte Module, Datenbank, S3 und SMTP werden einheitlich über Umgebungsvariablen konfiguriert.
* **Spielerprofile, Multi-Units & Einladungen:** Spieler pflegen vollen Namen, Trikotnummer, Position, Kontakte und vom Team Admin definierte Custom-Felder. Two-Way-Spieler tragen mehrere Units (`Offense`, `Defense`, `Special Teams`). Team Admins laden per E-Mail oder teilbarem Team-Link inkl. Freigabe-Warteliste ein. Konten bleiben bei Team-Austritt erhalten (vorbereitet für späteren Server-/Team-Umzug).
* **Frame-genauer Film Room:** Editierbares Vektor-Canvas (Pfeile, Spotlights, Text, Freihand) mit strikter Bindung an **exakten Frame und Kamerawinkel**, race-freiem Auto-Stop, Vollbildmodus inkl. Video-Overlays, editierbaren Kommentaren in verschiebbarer Ecke sowie konfigurierbaren Nutzer-Hotkeys.
* **Konfigurierbares Football-Tagging & Auto-Berechnung:** Vollständiger Football-Grundstock inkl. editierbarer `YD LN` ↔ `GN/LS` Automatik (pausiert bei `FLAG`), lernendem Team-Wörterbuch und Team-Admin-Verwaltung für Custom-Felder & Fehleinträge.
* **Hybrid-Video-Modell & Multi-Angle:** Unterstützt sowohl vorgeschnittene **Einzelclips** als auch lange **Einzeldatei-Tapes** (`TIME_SLICE`), optionale Sync-Offsets, `sideline-bundle.json`-Import sowie granulare `/share/`-Download-Links.
* **Strikte Rollen- & Mandantentrennung + S3-Cleanup:** Produktiver Ansichts-Umschalter für übergeordnete Rollen, strikte Isolation des Sysadmins von Team-Inhalten sowie S3-Cleanup-Queue mit Schonfrist.

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
├── .env.example                 # ENV-Bootstrap (Sysadmin, ENABLED_MODULES, DB, S3, SMTP)
├── LICENSE                      # GNU AGPLv3
├── README.md                    # Projektübersicht & Quickstart
├── docs/                        # Ausführliche Projektdokumentation
│   ├── architecture.md          # System-, Modul-, Daten- & Storage-Architektur
│   └── json-bundle-format.md    # Spezifikation sideline-bundle.json (v1.0)
├── src/
│   ├── core/                    # Hub, Modul-Registry, CoreTopBar, SettingsShell, Settings-Seiten
│   ├── modules/
│   │   └── video-analysis/      # Modul Videoanalyse (Bibliothek, Film Room, Tagging, Bundle)
│   └── shared/                  # Übergreifende Typen & Hilfsfunktionen
└── tests/
    └── unit/                    # Automatisierte Unit-Tests (node:test)
```

---

## Dokumentation

* [Architektur- & Storage-Konzept](docs/architecture.md)
* [JSON-Bundle-Format (`sideline-bundle.json` v1.0)](docs/json-bundle-format.md)

---

## Roadmap

- [x] **Paket 1:** Repository-Grundgerüst, Dashboard, Spieler-Freigaben, JSON-Bundle-Import & -Export
- [x] **Paket 2:** Film Room mit exakter Frame-Bindung, Vektor-Canvas, Breakdown-Data-Grid, `Draft / Publish`, granulare `/share/`-Links
- [x] **Paket 2b-A:** SidelineOS Core-Hub, Modul-Registry (`ENABLED_MODULES`), offene Seitenmenüs für Persönliche/Team-/Sysadmin-Einstellungen, Multi-Unit, Einladungen & Freigabe-Warteliste
- [ ] **Paket 2b-B:** Login-Maske, Einladungs-Registrierung (`/invite/<token>`) & öffentliche `/share/<token>`-Empfänger-Ansicht
- [ ] **Paket 3:** Cut & Multi-Angle Sync Editor (`Einzelclip-Sync` + `Fast-Cut Raw Tape`) & Smart Playlists
- [ ] **Paket 4:** Stateless Backend (Express + PostgreSQL + S3-Storage + SMTP + ENV-Bootstrap + Docker Compose)
- [ ] **Später:** Portabler Konto-Umzug (Export/Migration eines Benutzerkontos auf einen anderen SidelineOS-Server)

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

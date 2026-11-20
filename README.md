# SidelineOS

**SidelineOS** ist eine quelloffene, modulare und selbstgehostete Multi-Tenant-Plattform von Coaches für Coaches (American Football & andere Teamsportarten). Sie bietet eine schlanke, datenschutzfreundliche Alternative zu kommerziellen Videoanalyse-Systemen.

> **Projektstatus:** Aktiver UI-Prototyp (**Paket 1** – Core Shell, Videobibliothek, Spieler-Freigaben, JSON-Bundle-Import & Rollen-Trennung). Das Backend (PostgreSQL + S3-Grid) folgt nach Abschluss der UI-Abnahme.

---

## Kernfunktionen

* **Modulare Architektur:** Schlanker Core (Mandanten, Rollen, App-Shell) mit steckbaren Fachmodulen (Startfokus: **Modul A – Videoanalyse**).
* **Hybrid-Video-Modell:** Unterstützt sowohl vorgeschnittene **Einzelclips** (Kamera Start/Stop) als auch lange **Einzeldatei-Tapes** über Byte-Range-Time-Slices (`start_ms` / `end_ms`) im selben Schema.
* **Multi-Angle mit optionalem Offset:** Mehrere Kamerawinkel pro Play (`SIDELINE`, `ENDZONE`, `TIGHT`). Lücken und fehlende Clips pro Winkel sind nativ zulässig; Zeitversatz (`offset_ms`) ist vollständig optional.
* **Companion-App JSON-Import (`sideline-bundle.json`):** Importiert Clip-Zuordnungen, optionale Sync-Offsets, Breakdown-Tags und Coach-Notizen gebündelt in einem Schritt.
* **Strikte Rollen- & Mandantentrennung:** Team-interne Sichtbarkeit pro Reel (`Nur Coaches`, `Alle Spieler`, einzelne Units) sowie strikter Ausschluss des Sysadmins von Team-Inhalten.
* **S3-Cleanup mit Schonfrist:** Referenzbasiertes Teilen innerhalb einer Instanz inkl. konfigurierbarer Retention-Delay-Queue, Wiederherstellung und manuellem Cleanup-Trigger für Sysadmins.

---

## Quickstart (Lokal)

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen
cp .env.example .env

# 3. Entwicklungsserver starten (Port 3000)
npm run dev
```

### Qualitätssicherung & Tests

```bash
# TypeScript-Prüfung
npm run lint

# Automatisierte Unit-Tests (JSON-Bundle-Schema & Validierung)
npm test

# Produktions-Build
npm run build
```

---

## Verzeichnisstruktur

```text
sidelineos/
├── .env.example                 # Dokumentierte Umgebungsvariablen
├── LICENSE                      # GNU AGPLv3
├── README.md                    # Projektübersicht & Quickstart
├── docs/                        # Ausführliche Projektdokumentation
│   ├── architecture.md          # System-, Daten- & Storage-Architektur
│   └── json-bundle-format.md    # Spezifikation sideline-bundle.json (v1.0)
├── src/
│   ├── core/                    # App-Shell, Navigation, Rollen- & Team-Kontext
│   ├── modules/
│   │   └── video-analysis/      # Modul A: Dashboard, Uploader, Bundle-Parser, Demo-Daten
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

- [x] **Paket 1:** Repository-Grundgerüst, Core-Shell, Dashboard, Spieler-Freigaben, JSON-Bundle-Import & -Export, Rollenansichten (Coach / Spieler / Sysadmin)
- [ ] **Paket 2:** Interaktiver Film Room, Vektor-Canvas (normalisierte Koordinaten), Hudl-Breakdown-Data-Grid & `Draft / Publish Session`
- [ ] **Paket 3:** Cut & Multi-Angle Sync Editor (`Einzelclip-Sync` + `Fast-Cut Raw Tape`), Smart Playlists & Sysadmin-S3-Cleanup-Queue
- [ ] **Phase 4:** Stateless Backend (Express + PostgreSQL + S3-Storage + Docker Compose / Proxmox LXC)

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

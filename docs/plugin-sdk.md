# SidelineOS Plugin SDK — Strukturelle Voraussetzungen für externe Module

Dieses Dokument definiert alle verbindlichen technischen, strukturellen und sicherheitsrelevanten Vorgaben für **eigenständige SidelineOS-Plugins in separaten GitHub-Repositories**.

Ziel dieser Architektur (**Core + Plugin Store**) ist es, dass:
* **SidelineOS Core** dauerhaft schlank bleibt (Auth, Konten, Multi-Tenancy, dauerhafte Multi-Saison-Teams, S3-Broker, SMTP, Hub, Einstellungs-Shell und Plugin Store),
* jedes Fachmodul (z. B. `video-analysis`, `playbook`, `roster-attendance`, eigene Vereins-Tools) als **unabhängiges GitHub-Repository** entwickelt, versioniert und über den **Sysadmin Plugin Store** installiert werden kann.

---

## 1. Verbindliche Lizenz- & Repo-Konventionen

1. **Lizenz:** Jedes Plugin, das gegen `@sidelineos/plugin-sdk` linkt oder den Core erweitert, steht gemäß Core-Lizenz unter **GNU AGPLv3** (Datei `LICENSE` im Root des Plugin-Repos).
2. **Namenskonvention:** `sidelineos-plugin-<slug>` (z. B. `sidelineos-plugin-video`, `sidelineos-plugin-playbook`).
3. **Empfohlene Repo-Struktur:**

```text
sidelineos-plugin-<slug>/
├── LICENSE                    # GNU AGPLv3
├── README.md                  # Funktionsumfang, benötigte Permissions, Changelog
├── plugin.manifest.json       # Deklaratives Manifest (Single Source of Truth für den Store)
├── package.json               # PeerDependencies auf react / @sidelineos/plugin-sdk
├── src/
│   ├── index.tsx              # Exportiert `SidelinePlugin` (Default/Named)
│   ├── manifest.ts            # Typisierte Manifest-Konstante
│   ├── types.ts               # Plugin-interne Domain-Typen
│   ├── services/              # Headless Business-Logik (ohne Browser-DOM für Mobile/Desktop!)
│   ├── components/            # UI-Komponenten (Tailwind Dark-Slate/Amber Design Tokens)
│   └── backend/               # (Ab Paket 4) Express-Router + DB-Migrationen
└── tests/
    └── unit/                  # Automatisierte Tests für alle Services
```

---

## 2. Das deklarative Manifest (`plugin.manifest.json`)

Der SidelineOS Plugin Store liest **ausschließlich** `plugin.manifest.json`, bevor JavaScript-Code des Plugins geladen oder ausgeführt wird.

```json
{
  "id": "video-analysis",
  "name": "Videoanalyse",
  "kurzbeschreibung": "Multi-Angle Film Room, Frame-Telestration & Tagging.",
  "version": "0.2.0",
  "sdkVersion": "1.0",
  "autor": "SidelineOS Core Team",
  "repositoryUrl": "https://github.com/sidelineos/sidelineos-plugin-video",
  "icon": "film",
  "status": "AKTIV",
  "standardAktiviert": true,
  "permissions": [
    "team:read",
    "s3:team-rw",
    "s3:cleanup-queue",
    "db:plugin-tables",
    "share:public-links"
  ],
  "dbPrefix": "mod_video_",
  "s3Prefix": "plugins/video-analysis/",
  "settingsAnker": {
    "user": [
      { "id": "modul-video-hotkeys", "label": "Film-Room-Hotkeys" }
    ],
    "team": [
      { "id": "modul-video-tagging", "label": "Tagging-Schema & Wörterbuch" }
    ],
    "sysadmin": [
      { "id": "modul-video-cleanup", "label": "S3-Cleanup & Schonfrist" }
    ]
  }
}
```

### Pflichtfelder & Regeln
* `id`: Eindeutige Kebab-Case-ID (`^[a-z0-9-]+$`). Darf nicht mit Core-Routen (`hub`, `settings`, `sysadmin`, `invite`, `share`) kollidieren.
* `sdkVersion`: Aktuell `'1.0'`. Der Core verweigert inkompatible Major-Versionen beim Store-Install.
* `dbPrefix`: Zwingend `mod_<slug_snake_case>_`. Jede eigene Tabelle des Plugins muss dieses Präfix tragen (z. B. `mod_video_reels`).
* `s3Prefix`: Optionaler Pfad unterhalb der Team-Isolation: `teams/{teamId}/plugins/<slug>/`.
* `settingsAnker`: IDs der `<section id="...">`-Elemente, die das Plugin in die zentralen Core-Einstellungen (`Persönlich`, `Team`, `Sysadmin`) einhängt, damit das offene Seitenmenü direkt dorthin scrollen kann.

---

## 3. Das `SidelinePlugin`-SDK-Interface (`src/sdk/plugin.ts`)

Jedes Plugin exportiert ein Objekt vom Typ `SidelinePlugin`:

| Eigenschaft | Pflicht | Zweck |
| :--- | :--- | :--- |
| `manifest` | Ja | Metadaten, Berechtigungen, DB-/S3-Präfix, Settings-Anker |
| `Provider` | Nein | Optionaler React Context Provider zur vollständigen Zustandskapselung |
| `defaultTab` | Ja | Standard-Tab beim Öffnen der Kachel auf der Startseite |
| `getTabs({ teamRolle })` | Ja | Liefert rollenabhängige TopBar-Tabs für Zone 2 |
| `PrimaerAktion` | Nein | React-Komponente für den rechten Action-Button in Zone 3 der TopBar |
| `renderMainView(ctx)` | Ja | Hauptfläche des Plugins inkl. Team-, Saison-, Rollen- und Tab-Kontext |
| `settingsPanels` | Nein | Optionale UI-Panels `{ user, team, sysadmin }`, die automatisch in die Core-Einstellungen eingeblendet werden |

### Strikte Entkopplungsregel
* Plugins importieren **niemals** interne Core-Dateien (`src/core/*`) und der Core importiert **niemals** Plugin-Interna (`src/plugins/*`).
* Sämtliche Kommunikation zwischen Core und Plugin erfolgt über `@sidelineos/plugin-sdk` (`src/sdk/plugin.ts`).
* Saison-Filterung nutzt generische SDK-Helper (`filtereNachSaison`, `ermittleEintragSaison`).

---

## 4. Berechtigungsmodell (`permissions`) & Datensicherheit

Der Core arbeitet nach dem Prinzip der **minimalen Rechte (Least Privilege)**. Im Backend (Paket 4) werden folgende Scopes durch den Core-Broker erzwungen:

| Scope | Erlaubter Zugriff | Verboten |
| :--- | :--- | :--- |
| `team:read` | Aktive `teamId`, Name, Saisons, Rolle des aktuellen Nutzers | Zugriff auf andere Teams/Mandanten |
| `team:roster-read` | Kaderliste, Units, Trikotnummern & Positionen des Teams | Globale E-Mail-/Passwort-Tabellen |
| `s3:team-rw` | Signierte Presigned-URLs ausschließlich für `teams/{teamId}/${s3Prefix}*` | Rohe S3-Credentials oder fremde Bucket-Pfade |
| `s3:cleanup-queue` | Vormerken verwaister Assets mit Schonfrist in der Core-Queue | Direktes Löschen fremder S3-Objekte |
| `db:plugin-tables` | SQL-Queries auf Tabellen mit dem eigenen `dbPrefix` inkl. erzwungenem `team_id` | Lesen/Schreiben in Core-Auth-Tabellen oder Tabellen anderer Plugins |
| `share:public-links` | Erzeugen signierter `/share/<token>`-Tokens über den Core-Share-Broker | Direkte Umgehung der RBAC-Prüfung |

---

## 5. Sicherheits- & Build-Anforderungen für Store-Releases (Paket 4)

1. **Keine unkontrollierte Code-Ausführung im Server-Prozess:** Backend-Routen eines Plugins dürfen niemals über unsichere `eval()`/`Function()`-Konstrukte oder rohes SQL ohne Parameterbindung laufen. Externe Plugins werden als signiertes Release-Artefakt (`sideline-plugin-v1.tar.gz` + SHA256-Prüfsumme + `plugin.manifest.json`) über GitHub Releases verteilt.
2. **Kein Cross-Site-Scripting (XSS):** UI-Komponenten verwenden ausschließlich sicheres React-Binding (`{wert}` statt `dangerouslySetInnerHTML`) und validieren JSON/CSV-Imports strikt vor der Übernahme.
3. **Sichtbarkeit & Ausblendung:** Ist ein Plugin instanzweit (`ENABLED_MODULES`) oder für das gewählte Team deaktiviert, darf kein UI-Eintrag (weder Startseite noch Einstellungen) sichtbar sein und jeder API-/Routen-Zugriff liefert `403 Forbidden`.
4. **Cross-Platform-Fähigkeit:** Services müssen frei von Browser-DOM-APIs bleiben (`window`, `document`), damit Capacitor (Android/iOS) und Tauri (Linux/Windows/macOS) dieselbe Domänenlogik nutzen können.

---

## 6. Schritt-für-Schritt: Videoanalyse-Ordner in ein eigenes GitHub-Repo auslagern

Der Ordner `src/plugins/video-analysis/` ist bereits vollständig nach diesen Regeln vorbereitet:

1. Neues GitHub-Repository `sidelineos-plugin-video` mit GNU `AGPLv3` (`LICENSE`) anlegen.
2. Gesamten Inhalt von `src/plugins/video-analysis/` inkl. `plugin.manifest.json`, `AI_HANDOFF.md` und zugehöriger Tests aus `tests/unit/` übernehmen.
3. Importpfade von `../../../sdk/plugin.ts` auf das veröffentlichte Paket `@sidelineos/plugin-sdk` umstellen.
4. `AI_HANDOFF.md` mit in das neue Repo legen – damit verfügt jede weiterarbeitende KI sofort über alle Design-Entscheidungen, Frame-Math-Details und offenen Paket-3/4-Aufgaben.

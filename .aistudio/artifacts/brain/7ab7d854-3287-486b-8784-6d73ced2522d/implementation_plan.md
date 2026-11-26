# SidelineOS-Core DEV-Update: Browser-Navigation (#16), Dev-Plugin Git-Pull-Reload (#17) & End-to-End Plugin-Kontext (#18)

Dieses Update behebt zwei zentrale Bedien- und Entwicklungsprobleme der aktuellen DEV-Version (Browser-Zurück/Vorwärts-Navigation und ausbleibende Live-Aktualisierung nach Git Pull) und erweitert die Plugin-Laufzeit um zeitlos gültige Public-Share-S3-Downloads sowie Team-Unit-Kontext — vollständig rückwärtskompatibel für alle bestehenden Plugins unter SDK `1.0`.

---

## Benutzer-Freigabe & Kritische Entscheidungen

> [!IMPORTANT]
> Alle vier Richtungsentscheidungen wurden im Vorgespräch bestätigt und sind verbindlich in diesen Plan eingearbeitet:
> - **Umfang**: Gemeinsame Umsetzung aller drei offenen Issues (**#16**, **#17**, **#18**).
> - **URL-Schema (#16)**: Sprechende Pfade (`/`, `/settings`, `/settings/account`, `/settings/team`, `/sysadmin`, `/modules/<pluginId>` und `/modules/<pluginId>/<tabId>`).
> - **Fehlerbehandlung bei Git Pull (#17)**: Schlägt der Backend-Live-Reload fehl, wird der Fehler explizit an den Sysadmin gemeldet und niemals still ein veralteter Plugin-Stand im Speicher behalten.
> - **SDK-Kompatibilität (#18)**: Die unterstützte SDK-Version bleibt bei **`1.0`**, alle neuen Felder und Kontext-Helfer sind rein additiv/optional.

> [!WARNING]
> **Geprüfte Kompatibilitätsrisiken gegenüber bestehenden Plugins (`SidelineOS-video`, `SidelineOS-attendance`, `SidelineOS-themepack`, `SidelineOS-templateplugin`):**
> - **Dual-Signatur für Public-Share-S3 (#18)**: `SidelineOS-video` erwartet bereits vorwärtskompatibel `publicCtx.createTeamS3ReadScope(teamId)` und als Fallback `publicCtx.getSignedDownloadUrlForTeam({ teamId, objectPath, expiresInSeconds })` (Objekt-Argument), während Issue #18 Positionsparameter beschreibt. Der Core unterstützt daher **beide Aufrufvarianten** gleichzeitig.
> - **Fehlender SDK-Typexport (`SpielerUnit`)**: `SidelineOS-attendance` importiert `SpielerUnit` aus dem SDK; der Typ wird im Rahmen von #18 offiziell mit exportiert.
> - **Externe SDK-Referenzen in Plugin-Backends (#17)**: Da bestehende Plugin-Builds das SDK im Server-Bundle als extern markieren, stellt der Core das lokale SDK auch für das entpackte Plugin-Datenverzeichnis verfügbar, damit Laufzeit-Importe nicht still fehlschlagen.
> - **Plugin-interne Detailansichten & `routeArt` (#16)**: `routeArt` bleibt für alle authentifizierten Ansichten unverändert auf `'app'`, sodass bestehende Provider-Plugins unverändert funktionieren. Plugin-eigener React-Detailzustand (z. B. ein geöffnetes Event oder ausgewählter Clip) liegt weiterhin im Plugin selbst; „Browser Zurück“ kehrt zunächst zum vorherigen Core-Tab bzw. -Bereich zurück.

---

## 1. Überblick & Kernkonzept

- **Was diese Änderung liefert**:
  1. **Echte Browser-Navigation (#16)**: Jeder Wechsel zwischen Hub, Einstellungs-Hub, Benutzer-/Team-/Sysadmin-Einstellungen, geöffnetem Plugin und einzelnen Plugin-Tabs erzeugt einen sauberen History-Eintrag mit sprechender URL. Browser-„Zurück“, „Vorwärts“ und Seiten-Reloads (F5) landen zielgenau wieder in der jeweiligen Ansicht.
  2. **Echter End-to-End-Reload bei Dev-Git-Pull (#17)**: Ein Klick auf „Git Pull“ klont den neuesten Branch-Stand aus der tatsächlich installierten Repository-Quelle, ersetzt das Zielverzeichnis sauber, entlädt den alten Backend-Handler, lädt das neue Backend verbindlich (oder meldet Fehler statt Stille), schaltet Browser-/Proxy-Caching für Runtime-Manifeste ab und erzwingt das Neuladen und Remounten des neuen Frontend-Bundles inkl. CSS und Theme-Presets.
  3. **End-to-End Public-Share & Unit-Targeting (#18)**: Öffentliche `/share/<token>`-Endpunkte berechtigter Plugins erhalten einen gesicherten Read-Only-S3-Kontext zur Erzeugung frischer Presigned Download-URLs (unabhängig von der Link-Laufzeit). Gleichzeitig erhalten sowohl Frontend- als auch Backend-Laufzeitkontexte die `userUnits` (`OFFENSE` / `DEFENSE` / `SPECIAL_TEAMS`) der aktiven Team-Mitgliedschaft.
- **Zielgruppe**: Coaches, Spieler und Team-Admins (flüssige Browser-Navigation, zielgruppengenaue Inhalte nach Unit, dauerhaft lauffähige Share-Links) sowie Sysadmins und Plugin-Entwickler (verlässlicher 1-Klick-Git-Pull im Live-Betrieb).
- **Zentraler Mehrwert**: Kein unerwartetes Verlassen der App beim Klick auf „Zurück“, keine veralteten Geister-Stände mehr bei Dev-Plugins und vollständige End-to-End-Unterstützung für Video-Sharing und Unit-Filterung ohne Breaking Changes.

---

## 2. Benutzererfahrung & Visuelle Integration

- **Wesentliche Abläufe (User Flows)**:
  - **Navigation & Deep-Links (#16)**:
    1. Ein Benutzer startet im Hub (`/`), öffnet „Videoanalyse“ → URL wechselt auf `/modules/video-analysis/film-room`.
    2. Er wechselt in den Tab „Playlists“ → URL wechselt auf `/modules/video-analysis/playlists`.
    3. Er öffnet über die TopBar die Einstellungen (`/settings`) und dort „Team-Einstellungen“ (`/settings/team`).
    4. Klickt er auf „Browser Zurück“, springt die App schrittweise zurück: `/settings` → `/modules/video-analysis/playlists` → `/modules/video-analysis/film-room` → `/`. „Browser Vorwärts“ stellt jeden Schritt wieder her.
    5. Nach einem Reload (F5) oder beim direkten Aufruf eines Lesezeichens (z. B. `/sysadmin` oder `/modules/attendance/calendar`) prüft der Core Session, Rolle und Team-Freigabe: Ist der Zielbereich erlaubt, öffnet er direkt; fehlen Rechte oder ist das Plugin deaktiviert, fällt die App sicher auf den Hub (oder für reine Sysadmins auf `/sysadmin`) zurück und korrigiert die URL per `replaceState`.
    6. Nach dem Login kehrt der Benutzer automatisch zur ursprünglich angeforderten Ziel-URL zurück (statt immer blind auf `/` umgeleitet zu werden).
  - **Dev-Plugin Git Pull (#17)**:
    1. Der Sysadmin klickt im Plugin Store auf „Git Pull“ eines Dev-Plugins.
    2. Während Klonen, Build, Backend-Reload und Frontend-Bundle-Sync laufen, bleibt der Button deaktiviert und zeigt den aktiven Zustand.
    3. Bei Erfolg aktualisieren sich Commit-Anzeige, aktives Backend, geladenes Client-Bundle (inkl. CSS und Theme-Presets) und gemountete Plugin-Komponenten sofort ohne manuellen Browser-Refresh; die Erfolgsmeldung bestätigt den neuen Stand.
    4. Schlägt Klonen, Build oder der Backend-Live-Reload fehl, bleibt der alte Stand **nicht** still als „aktuell“ aktiv — der Sysadmin sieht unmittelbar die konkrete Fehlermeldung im Store-Banner.
  - **End-to-End Public-Share & Unit-Kontext (#18)**:
    - Empfänger eines `/share/<token>`-Links erhalten beim Abruf stets frisch signierte, kurzlebige Stream-/Download-URLs, auch wenn der Share-Link selbst 30 oder 90 Tage gültig ist.
    - Spieler sehen in Plugins mit Unit-Filterung automatisch die für ihre zugeordneten Units freigegebenen Inhalte.
- **Visuelle Konsistenz**:
  - Alle bestehenden semantischen `--sl-*`-Theme-Tokens, Typografie, Abstände und die bestehende SidelineOS-Shell bleiben vollständig erhalten — es werden keine konkurrierenden Designmuster eingeführt.
  - Alle Status-, Fehler- und Hinweisbanner im Plugin Store nutzen weiterhin die etablierten `bg-sl-surface`-, `border-sl-border`-, `text-sl-success-text`- und `text-sl-danger-text`-Tokens.

---

## 3. Zentrale Produktentscheidungen & Abwägungen

- **Entscheidung 1 — Sprechende Core-Pfade statt Hash/Query (#16)**:
  - *Gewählter Ansatz*: Klare Pfade (`/`, `/settings`, `/settings/account`, `/settings/team`, `/sysadmin`, `/modules/<pluginId>`, `/modules/<pluginId>/<tabId>`) zusätzlich zu `/login`, `/invite/<token>` und `/share/<token>`.
  - *Warum*: Ermöglicht echte Lesezeichen, nachvollziehbare Browser-Historie, direkte Wiederherstellung nach F5 und saubere Weiterleitung nach Login; das Server-SPA-Fallback und absolute Asset-Pfade im HTML unterstützen verschachtelte Routen bereits nativ.
  - *Verworfene Alternativen*: Query-Parameter oder rein unsichtbarer `history.state` wären schlechter lesbar und würden nach F5 bzw. beim Teilen interner Links schwächer funktionieren.
- **Entscheidung 2 — Versionierter Reload-Nonce + `no-store` statt reine Commit-SHA als Cache-Key (#17)**:
  - *Gewählter Ansatz*: Runtime-Manifest und Theme-Endpunkt liefern `Cache-Control: no-store` plus einen eindeutigen Build-/Installations-Zeitstempel (`cacheBuster` / `installedAt`) pro Plugin-Bundle; Client-Loader und Stylesheet-Sync hängen diesen Parameter an die ESM-Import-URL an, verwerfen veraltete Cache-Einträge pro Plugin, übernehmen das aktuelle Server-Manifest und erzwingen per versioniertem React-Key ein sauberes Remounting.
  - *Warum*: Selbst bei erneutem Git Pull auf demselben Commit (z. B. nach Core-SDK-Update oder Force-Push) umgeht ein eindeutiger Nonce sowohl Browser-HTTP-Caches als auch den persistenten ESM-Modulgraphen des Browsers.
  - *Verworfene Alternativen*: Sich allein auf die Commit-SHA zu verlassen schlägt fehl, sobald derselbe Commit neu gebaut oder der Client-Cache nicht bereinigt wird.
- **Entscheidung 3 — Striktes Backend-Entladen & sichtbare Fehler statt stillem Fallback (#17)**:
  - *Gewählter Ansatz*: Vor dem Neuladen eines aktualisierten Plugins wird der vorherige Backend-Handler gezielt entladen. Schlägt der Import/Start des neuen Backend-Bundles fehl, wird der Fehler protokolliert, im Plugin-Status als `last_error` festgehalten und als Fehlerantwort an die Sysadmin-UI zurückgegeben. Außerdem wird die tatsächlich installierte GitHub-Repository-URL bei Dev-Git-Installationen erhalten, damit „Git Pull“ auch bei Forks immer aus der richtigen Quelle zieht.
  - *Warum*: Verhindert das irreführende Fehlerbild aus Issue #17 („neuer Commit sichtbar, alter Code läuft weiter“).
  - *Verworfene Alternativen*: Fehler nur per `console.warn` zu loggen verdeckt kaputte Builds im Betrieb.
- **Entscheidung 4 — Dual-kompatibler `PluginPublicKontext` & additives `userUnits` unter SDK `1.0` (#18)**:
  - *Gewählter Ansatz*: `handlePublicRequest` erhält optional `publicCtx` mit `createTeamS3ReadScope(teamId)` sowie `getSignedDownloadUrlForTeam(...)` (akzeptiert sowohl Objekt- als auch Positionsparameter). `userUnits?: SpielerUnit[]` wird konsistent aus der aktiven Team-Mitgliedschaft an Frontend- und Backend-Kontext übergeben.
  - *Warum*: Maximale Kompatibilität mit `SidelineOS-video` (welches bereits vorwärtskompatibel implementiert ist), `SidelineOS-attendance` und zukünftigen Plugins ohne erzwungene Manifest-Migration auf `1.1`.

---

## 4. Technische Architektur & Datenstrategie *(Technische Referenz)*

### Architektur- & Datenflussdiagramm

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                           Browser (SidelineOS-Core SPA)                    │
│                                                                            │
│  ┌──────────────────────┐   pushState / popstate    ┌───────────────────┐  │
│  │ URL-Router & History │ ◄───────────────────────► │ Core-Shell State  │  │
│  │  /, /settings/*,     │   Deep-Link + Redirect    │ bereich, pluginId,│  │
│  │  /sysadmin,          │   nach Login              │ pluginTab,        │  │
│  │  /modules/:id/:tab   │                           │ aktiveMitglied-   │  │
│  └──────────────────────┘                           │ schaft.units      │  │
│                                                     └────────┬──────────┘  │
│                                                              │             │
│  ┌───────────────────────────────────────────────────────────▼──────────┐  │
│  │ Client Plugin-Runtime-Loader (versioniert + Cache-Buster-Nonce)      │  │
│  │  • Evict alter Cache-Einträge pro Plugin-ID                          │  │
│  │  • ESM-Import ?v=<version>&t=<reloadNonce> + CSS-Reload              │  │
│  │  • Mergt Server-Manifest (aktuelle Commit-Version)                   │  │
│  │  • Versionierter React-Key für Provider, MainView & Settings-Panels  │  │
│  └──────────────────────────────┬───────────────────────────────────────┘  │
└─────────────────────────────────┼──────────────────────────────────────────┘
                                  │  HTTP (no-store für /manifest & /themes)
┌─────────────────────────────────▼──────────────────────────────────────────┐
│                          SidelineOS-Core Backend                           │
│                                                                            │
│  ┌───────────────────────────┐       ┌──────────────────────────────────┐  │
│  │ Sysadmin Dev-Git Pull     │       │ Plugin-Runtime-Router            │  │
│  │  1. Clone + Build (frisch)│──────►│  • /manifest (no-store + Nonce)  │  │
│  │  2. Zielordner bereinigen │       │  • /themes   (no-store)          │  │
│  │  3. SDK für Backend bereit│       │  • /bundles/:id/:ver/* (no-cache)│  │
│  │  4. Alt-Backend entladen  │       └──────────────────────────────────┘  │
│  │  5. Neu-Backend laden     │                                             │
│  │     (Fehler sichtbar!)    │       ┌──────────────────────────────────┐  │
│  └───────────────────────────┘       │ Plugin-Gateway (Protected/Public)│  │
│                                      │  • Protected: übergibt userUnits │  │
│                                      │    aus aktiver Mitgliedschaft    │  │
│                                      │  • Public: übergibt publicCtx    │  │
│                                      │    (nur bei share:public-links   │  │
│                                      │    + s3:team-rw & aktivem Team)  │  │
│                                      └────────────────┬─────────────────┘  │
│                                                       ▼                    │
│                                      ┌──────────────────────────────────┐  │
│                                      │ S3-Broker (Read-Only Presigning) │  │
│                                      │  Prefix teams/<teamId>/<prefix>/ │  │
│                                      └──────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────┘
```

### Datenmodell & Zustandsstrategie

- **Routing-Zustand (#16)**:
  - Einheitlicher Parser/Serializer übersetzt zwischen Browser-Pfad und Core-Zielzustand (`routeModus`, `bereich`, `aktivesPluginId`, `aktiverPluginTab`).
  - Beim Initial-Load vor dem Ende des Session-Checks wird der angeforderte Zielpfad zwischengespeichert und nach erfolgreicher Anmeldung bzw. Plugin-Bundle-Synchronisation sauber angewandt (inkl. Rechte- und Modul-Validierung).
  - Ein Ref-Flag trennt History-Synchronisation durch `popstate` von Benutzerklicks, sodass niemals doppelte History-Einträge entstehen.
- **Plugin-Reload-Zustand (#17)**:
  - Jeder erfolgreiche Install-/Pull-/Rollback-Vorgang aktualisiert einen serverseitigen Reload-Zeitstempel/Nonce je Plugin (gespeichert oder abgeleitet aus dem Änderungszeitpunkt der Installation), der über das Runtime-Manifest an Clients ausgeliefert wird.
  - Bei gleicher oder neuer Commit-Version lädt der Client das frische ESM-Bundle und aktualisiert das verknüpfte CSS-`<link>`-Element; beim Remounten über versionierte React-Keys (`pluginId@version@nonce`) starten Provider, Hauptansicht und Settings-Panels garantiert mit dem neuen Code.
  - Das lokale `@sidelineos/plugin-sdk` wird sowohl beim Build im Staging-Ordner als auch für das Plugin-Datenverzeichnis verfügbar gehalten, sodass auch Backend-Plugins mit Laufzeit-SDK-Importen beim Live-Reload zuverlässig starten.
- **Kontext-Erweiterung (#18)**:
  - **Backend (`PluginBackendKontext`)**: Enthält `userUnits: [...aktiv.units]` aus der geprüften aktiven Team-Mitgliedschaft.
  - **Frontend (`PluginLaufzeitKontext`)**: Enthält `userUnits: [...(aktuelleMitgliedschaft?.units ?? [])]` aus der aktuellen Team-Mitgliedschaft.
  - **Public-Share (`PluginPublicKontext`)**: Optionales 3. Argument für `handlePublicRequest`, mit:
    - `createTeamS3ReadScope?(teamId)` → Read-Only-Scope (`prefix` + `getSignedDownloadUrl`),
    - `getSignedDownloadUrlForTeam?(...)` → unterstützt sowohl `{ teamId, objectPath, expiresInSeconds }` als auch `(teamId, objectPath, expiresInSeconds)`.

### Interaktive Komponenten & Zustandsübergänge

- **TopBar, Hub, Settings-Hub & Plugin-Tabs**: Jeder Navigations-Handler ruft eine zentrale Navigationsfunktion auf, die Core-State aktualisiert und synchron `history.pushState` (oder `replaceState` bei automatischen Fallbacks/Korrekturen) ausführt.
- **Browser-Zurück/Vorwärts (`popstate`)**: Rekonstruiert `routeModus`, `bereich`, `aktivesPluginId` und `aktiverPluginTab` direkt aus dem Pfad, prüft Rollen-/Team-Berechtigungen und verhindert Endlosschleifen.
- **Team-Wechsel & Rollen-Vorschau**: Beim Wechsel auf ein Team ohne das aktuell geöffnete Modul (oder beim Wechsel in eine Vorschau-Rolle ohne `team-settings`-Zugriff) wird sauber auf `/` zurücknavigiert und die URL per `replaceState` korrigiert.
- **Sysadmin Store „Git Pull“**: Zeigt Ladezustand, ruft den aktualisierten Dev-Git-Endpunkt auf, synchronisiert anschließend Sysadmin-Übersicht, Runtime-Manifest (mit Cache-Buster), Theme-Presets und meldet jeden Build- oder Live-Reload-Fehler unmittelbar im Store-Banner.

### Sicherheits- & Integritätsschutz

- **Abgesicherte Public-Share-S3-Signierung**: Der Read-Only-S3-Kontext in `handlePublicRequest` wird ausschließlich bereitgestellt, wenn das Plugin global aktiviert ist **und** im Manifest sowohl `share:public-links` als auch `s3:team-rw` deklariert hat. Vor jeder Signierung prüft der Core zusätzlich serverseitig, dass die angeforderte `teamId` existiert und das Plugin für genau dieses Team freigeschaltet ist; S3-Schlüssel werden strikt auf `teams/<teamId>/<pluginPrefix>/` eingegrenzt (Schutz vor Pfad-Ausbruch) und die Signatur-Gültigkeit auf ein sicheres Maximum (z. B. 3600 Sekunden) begrenzt.
- **Saubere Plugin-Isolation & Verifizierung bei Git Pull**: Alle Git- und Build-Befehle nutzen weiterhin feste Argument-Arrays ohne Shell-Interpolation, Zielpfade werden strikt gegen das Plugin-Datenverzeichnis geprüft, und ein fehlgeschlagenes Backend-Live-Reload wird explizit als Fehler gemeldet statt still veralteten Code aktiv zu halten.
- **Serverseitige Rechteprüfung bei Deep-Links**: Clientseitige URL-Pfade (`/sysadmin`, `/settings/team`, `/modules/<id>`) dienen ausschließlich der Navigation; alle sensiblen Daten und Aktionen bleiben serverseitig durch Session-, Rollen-, Team- und Modul-Checks geschützt, und unberechtigte Deep-Links fallen im UI sofort auf erlaubte Ansichten zurück.

### Verifikationsstrategie

- **Automatisierte Tests**:
  - Unit-Tests für URL-Parsing/Serialisierung & Fallback-Verhalten aller Core-Routen inkl. `/modules/<id>/<tab>` und Redirect-Erhalt (#16).
  - Integrationstests für Dev-Git-Update, Cache-Header (`no-store`), Nonce-Aktualisierung, Backend-Reload inkl. Fehler-Reporting bei defektem Backend-Bundle und Erhalt der installierten Repo-URL (#17).
  - Integrationstests für `handlePublicRequest` mit `publicCtx` (beide Aufruf-Signaturen, Blockierung ohne `s3:team-rw`, Blockierung für Teams mit deaktiviertem Modul, Path-Traversal-Abwehr) sowie `userUnits` im geschützten Plugin-Gateway (#18).
- **SDK- & Gesamt-Check**: SDK-Build (`build:sdk`), TypeScript-Prüfung, vollständige Test-Suite sowie Live-Server-Prüfung auf Port 3000.

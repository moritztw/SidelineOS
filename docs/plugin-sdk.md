# SidelineOS-Core Plugin SDK — Entwickler-Leitfaden & Spezifikation

Dieses Dokument beschreibt verbindlich, wie **eigenständige SidelineOS-Plugins** in separaten GitHub-Repositories programmiert, gebaut, getestet und über den **SidelineOS-Core Plugin Store** installiert werden.

Grundprinzip (**Core + Plugin Store**):
* **SidelineOS-Core** hält ausschließlich Auth, Konten, Einladungen, Multi-Tenancy, Teams/Saisons, S3-/SMTP-/Notification-Broker, Hub, Einstellungs-Shell sowie Installer + Runtime-Loader bereit.
* **Plugins** liefern komplette Fachmodule (z. B. Videoanalyse, Playbook, Anwesenheit) oder zusätzliche Notification-Zustellwege als eigenständig deploybare Pakete (`sideline-plugin-v1`) ohne Core-Rebuild.

---

## 1. Lizenz, Naming & Repository-Struktur

1. **Lizenz:** Jedes Plugin gegen `@sidelineos/plugin-sdk` steht unter **GNU AGPLv3** (`LICENSE` im Repo-Root).
2. **Repository-Namenskonvention:** `SidelineOS-<slug>` (z. B. `SidelineOS-video`, `SidelineOS-playbook`, `SidelineOS-discord-notifier`).
3. **Verbindliche Verzeichnisstruktur:**

```text
SidelineOS-<slug>/
├── LICENSE                    # GNU AGPLv3
├── README.md                  # Beschreibung, Permissions, Changelog
├── plugin.manifest.json       # Deklaratives Manifest (Pflicht im Paket-Root)
├── package.json               # Build-Skripte & PeerDependencies
├── vite.config.ts             # Baut dist/client.js (+ dist/client.css) und dist/server.js
├── migrations/                # Optionale PostgreSQL-Migrationen (alphabetisch ausgeführt)
│   └── 001_init.sql
├── src/
│   ├── manifest.ts            # Gemeinsames Manifest-Objekt für Client & Server
│   ├── client.tsx             # Default-Export eines `SidelinePlugin` (-> dist/client.js)
│   ├── server.ts              # Default-/Named-Export eines `SidelineBackendPlugin` (-> dist/server.js)
│   ├── services/              # Plattformneutrale Business-Logik (ohne window/document)
│   └── components/            # UI-Komponenten (Tailwind)
├── dist/                      # Gebaute Runtime-Artefakte (für Release & Dev-Git-Clone)
│   ├── client.js              # Pflicht für UI-Plugins (ESM)
│   ├── client.css             # Optional (wird automatisch eingebunden & bei Deinstall entfernt)
│   └── server.js              # Optional für Backend/DB/Notification-Channel (ESM)
└── tests/
    └── *.test.ts
```

> **Reine Backend- / Notification-Channel-Plugins:** Ein Plugin ohne UI benötigt kein `dist/client.js` – ein gültiges `dist/server.js` genügt.

---

## 2. Manifest (`plugin.manifest.json`) & Kompatibilitätsregeln

Der Plugin-Installer liest zuerst `plugin.manifest.json`, bevor Code entpackt oder geladen wird.

```json
{
  "id": "scouting",
  "name": "Scouting & Gegneranalyse",
  "kurzbeschreibung": "Tendenzen, Gegner-Breakdowns und Spielberichte pro Saison.",
  "version": "0.1.0",
  "sdkVersion": "1.0",
  "minCoreVersion": "0.1.0-alpha.1",
  "autor": "Dein Verein / Maintainer",
  "repositoryUrl": "https://github.com/dein-verein/SidelineOS-scouting",
  "icon": "clipboard-check",
  "status": "AKTIV",
  "standardAktiviert": false,
  "permissions": [
    "team:read",
    "team:roster-read",
    "db:plugin-tables",
    "s3:team-rw",
    "s3:cleanup-queue",
    "notifications:send"
  ],
  "dbPrefix": "mod_scouting_",
  "s3Prefix": "plugins/scouting/",
  "settingsAnker": {
    "user": [{ "id": "modul-scouting-prefs", "label": "Scouting-Voreinstellungen" }],
    "team": [{ "id": "modul-scouting-schema", "label": "Scouting-Felder" }],
    "sysadmin": []
  }
}
```

### Feldregeln
| Feld | Pflicht | Bedeutung |
| :--- | :--- | :--- |
| `id` | Ja | `^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$`, nicht reserviert (`hub`, `settings`, `sysadmin`, `invite`, `share`, `auth`, `login`, `api`, `plugins`) |
| `name` | Ja | Anzeigename auf Kachel, Hub und Freigabe-Matrix |
| `version` | Ja | Fallback-SemVer (z. B. für Offline-`.tar.gz`-Uploads). Bei Installation aus **GitHub Release** gewinnt automatisch das **Release-Tag** (ohne `v`), bei **GitHub Dev-Clone** automatisch **`<branch>-<short-sha>`** (analog zu `CORE_VERSION`). |
| `sdkVersion` | Ja | API-Vertrags-Version (`Major.Minor`, aktuell `"1.0"`). |
| `minCoreVersion` / `maxCoreVersion` | Nein | Optionale SemVer-Grenzen für die unterstützte SidelineOS-Core-Version (z. B. `"0.1.0-alpha.1"`). |
| `icon` | Ja | `'film' \| 'book-open' \| 'clipboard-check' \| 'layers' \| 'puzzle'` |
| `dbPrefix` | Ja | Zwingend `mod_<slug_snake_case>_` (Regex: `^mod_[a-z0-9_]+_$`) |
| `s3Prefix` | Nein | Relative S3-Ablage pro Team: `teams/<teamId>/<s3Prefix>` |
| `permissions` | Ja | Liste erlaubter Least-Privilege-Scopes (siehe Abschnitt 6) |
| `settingsAnker` | Ja | Objekt `{ user?, team?, sysadmin? }` mit `<section id="...">`-Ankern |
| `hideHubTile` | Nein | `true` blendet die Modul-Kachel auf der Hub-Startseite aus (ideal für Headless- oder Theme-Plugins ohne eigene Hauptansicht) |
| `themes` | Nein | Optionale Theme-Presets (`PluginThemePreset[]`) für das Core-Theme-Auswahlmenü (`#sys-theme` & Konto-Einstellungen) |

### Wann prüft der Core die Kompatibilität?
1. **`sdkVersion` (Major.Minor):**
   - Major muss exakt übereinstimmen (`pluginMajor === coreMajor`).
   - Minor darf nicht neuer sein als vom Core unterstützt (`pluginMinor <= coreMinor`, aktuell `1.0`).
2. **`minCoreVersion` / `maxCoreVersion` (SemVer):**
   - Bei Release- und Offline-`.tar.gz`-Installation prüft der Core `minCoreVersion <= coreVersion <= maxCoreVersion`. Läuft der Core auf einem Branch-Build (`dev-a918b95`), dient die SemVer-Basisversion aus `package.json` des Cores als Vergleichsbasis.
   - Bei Verstoß bricht die Installation mit `409 Conflict` ab; der Update-Checker markiert betroffene Updates über `sdkKompatibel: false` bzw. `coreKompatibel: false`.
3. **Ausnahme GitHub-Dev-Clone (`DEV_ALLOW_GIT_INSTALL=true`):**
   - Beim direkten Klonen über Git-Branch findet **bewusst kein** SDK-/Core-Kompatibilitätsabgleich statt, damit Plugin-Entwickler frei gegen Entwicklungsstände testen können.

---

## 3. SDK-Einbindung & Build-Konfiguration (`vite.config.ts`)

### `@sidelineos/plugin-sdk` einbinden
Die verbindlichen TypeScript-Verträge liegen im Core-Repository unter `packages/plugin-sdk` (kompiliert per `npm run build:sdk`).

> **Wichtiger Hinweis zur Paketauflösung:** `@sidelineos/plugin-sdk` ist aktuell **noch nicht auf `npmjs.org` veröffentlicht** und kann wegen der Monorepo-Struktur (Root-`package.json` ist `sidelineos-core`, `packages/plugin-sdk/dist/` ist in `.gitignore`) **nicht** direkt per `github:moritztw/SidelineOS-core#...` über `npm` installiert werden.

Empfohlenes Setup in `package.json`:
* `@sidelineos/plugin-sdk` (wie `react` / `react-dom` / `lucide-react`) als **`peerDependency`** deklarieren — **nicht** als `npm`-/`github:`-`dependency`.
* Beim **Dev-Git-Clone im Core** führt der Installer automatisch `npm install --include=dev --legacy-peer-deps` aus (verhindert `E404`-Lookups auf `npmjs.org` unter npm 10+) und kopiert vor `npm run build` das lokal gebaute `packages/plugin-sdk` direkt in `node_modules/@sidelineos/plugin-sdk`.
* Für **lokale IDE-Entwicklung & CI-Builds** ohne laufenden Core entweder eine lokale Typdatei `src/sdk.d.ts` im Plugin-Repo mitführen oder einen geklonten Core (`npm run build:sdk`) über `npm install --legacy-peer-deps` lokal verlinken (`npm link ../SidelineOS-core/packages/plugin-sdk`). *(Sobald `@sidelineos/plugin-sdk` als separates Paket veröffentlicht ist, wird dieser Abschnitt entsprechend aktualisiert.)*

```json
{
  "name": "sidelineos-scouting",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "build": "vite build && vite build --config vite.server.config.ts",
    "test": "tsx --test tests/**/*.test.ts"
  },
  "peerDependencies": {
    "@sidelineos/plugin-sdk": "^1.0.0",
    "lucide-react": "^0.546.0",
    "react": "^19.0.1",
    "react-dom": "^19.0.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.8.0",
    "vite": "^8.0.0"
  }
}
```

### Browser-ImportMap & Pflicht-`externals`
Der Browser lädt Plugins per `import('/api/v1/plugins/runtime/bundles/<pluginId>/<version>/client.js')`. Damit Plugins und Core **exakt dieselbe React-Instanz** und denselben SDK-Code teilen, injiziert der Core eine `<script type="importmap">` auf `/api/v1/plugins/runtime/_shared/*`.

Im **Client-Build (`dist/client.js`)** müssen daher genau diese 6 Pakete als `external` gesetzt sein:
* `react`
* `react/jsx-runtime`
* `react-dom`
* `react-dom/client`
* `lucide-react`
* `@sidelineos/plugin-sdk`

Beispiel `vite.config.ts` (Client-Bundle):
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/client.tsx',
      formats: ['es'],
      fileName: () => 'client.js',
      cssFileName: 'client',
    },
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        'lucide-react',
        '@sidelineos/plugin-sdk',
      ],
    },
  },
});
```

Beispiel `vite.server.config.ts` (Backend-Bundle `dist/server.js` für Node.js ESM):
```ts
import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    ssr: 'src/server.ts',
    lib: {
      entry: 'src/server.ts',
      formats: ['es'],
      fileName: () => 'server.js',
    },
    rollupOptions: {
      external: [...builtinModules, /^node:/],
    },
  },
});
```

---

## 4. Frontend programmieren (`SidelinePlugin`)

`src/client.tsx` exportiert per `export default` (alternativ `export const plugin` oder `export const frontendPlugin`) ein `SidelinePlugin`-Objekt:

```tsx
import type { SidelinePlugin, PluginLaufzeitKontext } from '@sidelineos/plugin-sdk';
import { createPluginTranslator } from '@sidelineos/plugin-sdk';
import manifest from '../plugin.manifest.json';

const t = createPluginTranslator({
  de: { tabOverview: 'Übersicht', newReport: 'Neuer Bericht' },
  en: { tabOverview: 'Overview', newReport: 'New Report' },
});

function MainView({ ctx }: { ctx: PluginLaufzeitKontext }) {
  // ctx.team, ctx.aktiveTeamAnsicht, ctx.gewaehlteSaison, ctx.benutzer, ctx.locale, ctx.aktuellerTab
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-sl-heading">
        {t(ctx.locale, 'tabOverview')} · {ctx.team.name} ({ctx.gewaehlteSaison})
      </h2>
    </div>
  );
}

const plugin: SidelinePlugin = {
  manifest: manifest as SidelinePlugin['manifest'],
  defaultTab: 'overview',
  getTabs: ({ teamRolle, locale }) => {
    // Beispiel: Spieler sehen nur bestimmte Tabs
    if (teamRolle === 'PLAYER') {
      return [{ id: 'overview', label: t(locale, 'tabOverview') }];
    }
    return [
      { id: 'overview', label: t(locale, 'tabOverview') },
      { id: 'editor', label: 'Scouting-Editor' },
    ];
  },
  PrimaerAktion: ({ ctx, className }) =>
    ctx.aktiveTeamAnsicht !== 'PLAYER' ? (
      <button type="button" onClick={() => ctx.onTabWechseln('editor')} className={className}>
        {t(ctx.locale, 'newReport')}
      </button>
    ) : null,
  renderMainView: (ctx) => <MainView ctx={ctx} />,
};

export default plugin;
```

### Headless- & Theme-Plugins (`hideHubTile`, `Provider` mit `PluginProviderKontext`)
`defaultTab`, `getTabs` und `renderMainView` sind im `SidelinePlugin`-Vertrag **optional**. Plugins ohne eigene Hauptansicht (z. B. reine Theme-, Branding- oder Hintergrund-Plugins) setzen `hideHubTile: true` im Manifest und implementieren stattdessen einen `Provider` (und bei Bedarf `settingsPanels`):

* Der Core hält `Provider` aller **global aktivierten** Plugins dauerhaft über alle Ansichten (`login`, `hub`, `modul`, `settings`, `sysadmin`) gemountet und übergibt den Live-Kontext `ctx: PluginProviderKontext` (`team`, `aktiveTeamAnsicht`, `bereich`, `routeArt`, `istGlobalAktiv`, `istFuerAktivesTeamAktiv`, `locale`, `benutzer`).
* Möchte ein Theme-Plugin eigene Akzentfarben setzen, setzt es `document.documentElement.dataset.slThemeAccentOverride = 'true'` (und entfernt das Attribut samt eigener CSS-Tokens sauber im `useEffect`-Cleanup).

```tsx
import { useEffect } from 'react';
import type { PluginProviderProps, SidelinePlugin } from '@sidelineos/plugin-sdk';
import manifest from '../plugin.manifest.json';

function ThemeProvider({ children, ctx }: PluginProviderProps) {
  useEffect(() => {
    const root = document.documentElement;
    if (!ctx?.istGlobalAktiv) return;
    root.dataset.slThemeAccentOverride = 'true';
    root.style.setProperty('--sl-accent', '#10B981');
    return () => {
      delete root.dataset.slThemeAccentOverride;
      root.style.removeProperty('--sl-accent');
    };
  }, [ctx?.istGlobalAktiv, ctx?.team?.id]);

  return <>{children}</>;
}

const themePlugin: SidelinePlugin = {
  manifest: manifest as SidelinePlugin['manifest'],
  Provider: ThemeProvider,
};

export default themePlugin;
```

### Deklarative Theme-Presets (`manifest.themes` / `SidelinePlugin.themes`)
Für klassische Farb- oder Light-/High-Contrast-Themes ist kein eigener `Provider` nötig: Ein Plugin kann ein oder mehrere `PluginThemePreset`-Einträge direkt in `plugin.manifest.json` (und/oder auf `SidelinePlugin.themes`) deklarieren. Der Core prüft und bereinigt alle Token-Werte automatisch gegen eine strikte `--sl-*`-Allowlist, stellt die Presets in der Sysadmin-Konfiguration (`#sys-theme`) sowie im persönlichen Konto (`#konto`) zur Auswahl bereit und wendet die Auflösung `Benutzer-Präferenz → Instanz-Standard → core:default` bereits beim Booten (inkl. `/login`, `/invite`, `/share`) an.

```json
{
  "id": "daylight-theme",
  "name": "SidelineOS Daylight",
  "kurzbeschreibung": "Helles Erscheinungsbild für Outdoor- und Tageslicht-Nutzung.",
  "version": "1.0.0",
  "sdkVersion": "1.0",
  "autor": "Dein Verein",
  "repositoryUrl": "https://github.com/dein-verein/SidelineOS-daylight-theme",
  "icon": "layers",
  "status": "AKTIV",
  "standardAktiviert": true,
  "hideHubTile": true,
  "permissions": [],
  "dbPrefix": "mod_daylight_theme_",
  "settingsAnker": {},
  "themes": [
    {
      "id": "daylight",
      "name": "Daylight (Hell)",
      "beschreibung": "Hoher Kontrast bei direktem Sonnenlicht",
      "colorScheme": "light",
      "overrideTeamAccent": false,
      "tokens": {
        "--sl-bg-canvas": "#F8FAFC",
        "--sl-bg-topbar": "#F1F5F9",
        "--sl-bg-surface": "#FFFFFF",
        "--sl-bg-elevated": "#E2E8F0",
        "--sl-border": "#CBD5E1",
        "--sl-border-strong": "#94A3B8",
        "--sl-text-heading": "#0F172A",
        "--sl-text-primary": "#1E293B",
        "--sl-text-muted": "#475569",
        "--sl-text-subtle": "#64748B"
      }
    }
  ]
}
```

* `tokens` akzeptiert ausschließlich gültige Hex-Farben (`#RGB`, `#RRGGBB`, `#RRGGBBAA`) sowie `'dark' | 'light'` für `--sl-color-scheme`.
* Mit `overrideTeamAccent: false` (Standard) bleibt die dynamische Team-Primärfarbe im Team-Kontext erhalten; `overrideTeamAccent: true` erzwingt die im Preset definierte `--sl-accent*`-Farbe.
* Reine deklarative Theme-Plugins benötigen weder `renderMainView` noch zwingend einen `Provider` – sofern `themes` in `plugin.manifest.json` hinterlegt sind.

### Frontend → Core/Backend-API aufrufen (wichtig: Routing & CSRF)
Alle geschützten Backend-Aufrufe eines Plugins laufen über das Core-Gateway:

```text
/api/v1/plugins/<pluginId>/teams/<teamId>/<dein-pfad>
```

Bei schreibenden Requests (`POST`, `PUT`, `PATCH`, `DELETE`) erzwingt der Core CSRF-Schutz über den Header `X-Requested-With: XMLHttpRequest` sowie Session-Cookies (`credentials: 'include'`):

```ts
async function pluginApi<T>(
  pluginId: string,
  teamId: string,
  pfad: string,
  init: RequestInit = {}
): Promise<T> {
  const cleanPath = pfad.startsWith('/') ? pfad : `/${pfad}`;
  const res = await fetch(`/api/v1/plugins/${pluginId}/teams/${teamId}${cleanPath}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { fehler?: string };
    throw new Error(body.fehler ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}
```

### Öffentliche `/share/<token>`-Ansicht
Möchte ein Plugin öffentliche Empfänger-Links unterstützen (`"share:public-links"`):
1. Im Frontend `renderPublicShareView({ token, locale, onSchliessen })` implementieren.
2. Im Backend `handlePublicRequest(req, db)` bereitstellen → erreichbar unter `/api/v1/public/plugins/<pluginId>/<subPfad>` (ohne Login, nur aktiv wenn das Plugin global aktiviert ist).

### Einstellungs-Panels einhängen
`settingsPanels` (`{ user?, team?, sysadmin? }`) wird automatisch auf der jeweiligen Core-Einstellungsseite gerendert. Die dort gerenderten `<section id="...">`-Elemente müssen den `id`s aus `manifest.settingsAnker` entsprechen, damit das sticky Seitenmenü direkt dorthin scrollt.

### Design-Tokens & Theme-Kompatibilität (`--sl-*` / Tailwind)
Der Core stellt auf `:root` semantische `--sl-*` CSS Custom Properties bereit (sowie Tailwind-Utilities `bg-sl-*`, `text-sl-*`, `border-sl-*`, `placeholder-sl-*`, `accent-sl-accent`). Plugins sollten auf hartkodierte Hex-Farben verzichten und stattdessen diese Tokens nutzen, damit sie automatisch auf Team-Akzentfarben und Theme-Anpassungen reagieren:

| CSS-Variable | Tailwind-Farbe | Standard (Dark) | Verwendung |
| :--- | :--- | :--- | :--- |
| `--sl-color-scheme` | — | `dark` | Natives `color-scheme` (`dark` / `light`) |
| `--sl-bg-canvas` | `sl-canvas` | `#0B0E11` | Seitenhintergrund & Eingabeflächen |
| `--sl-bg-topbar` | `sl-topbar` | `#0F1318` | Sub-Navigationsleiste |
| `--sl-bg-surface` | `sl-surface` | `#13171D` | Karten, Modals, Sidebars |
| `--sl-bg-elevated` | `sl-elevated` | `#1E2530` | Sekundäre Buttons & Hervorhebungen |
| `--sl-border` / `--sl-border-strong` | `sl-border` / `sl-border-strong` | `#232933` / `#36404F` | Rahmen, Trenner & aktive Segmente |
| `--sl-text-heading` / `--sl-text-primary` | `sl-heading` / `sl-primary` | `#FFFFFF` / `#E6EDF3` | Überschriften & Fließtext |
| `--sl-text-muted` / `--sl-text-subtle` | `sl-muted` / `sl-subtle` | `#8B949E` / `#6E7681` | Meta-Texte, Inaktiv-Labels & Platzhalter |
| `--sl-accent` / `--sl-accent-hover` / `--sl-accent-contrast` | `sl-accent` / `sl-accent-hover` / `sl-accent-contrast` | `#F59E0B` / `#FBBF24` / `#0B0E11` | Primäre Akzente & Kontrasttext auf Buttons |
| `--sl-danger` / `--sl-danger-text` | `sl-danger` / `sl-danger-text` | `#DC2626` / `#FCA5A5` | Fehler & Löschaktionen |
| `--sl-success` / `--sl-success-text` / `--sl-warning-text` | `sl-success` / `sl-success-text` / `sl-warning-text` | `#16A34A` / `#86EFAC` / `#FDE68A` | Status- und Warnhinweise |

* **Team-Primärfarbe automatisch aktiv:** Im aktiven Team-Kontext setzt der Core `--sl-accent`, `--sl-accent-hover` und WCAG-kontrastierendes `--sl-accent-contrast` dynamisch aus `aktivesTeam.primaerFarbe` (außerhalb des Team-Kontexts fallen die Werte auf die Standard-Defaults zurück).
* **Theme-Override-Schutz:** Setzt ein externes Theme-Plugin `document.documentElement.dataset.slThemeAccentOverride = 'true'`, überschreibt der Core `--sl-accent*` nicht mehr durch die Teamfarbe.
* **SDK-Typen & Helfer:** `SIDELINE_CSS_TOKENS`, `SIDELINE_STANDARD_THEME_TOKENS`, `normalisiereHexFarbe`, `ermittleKontrastTextFarbe`, `ermittleHoverAkzentFarbe` und `ermittleTeamAkzentTokens` stehen direkt über `@sidelineos/plugin-sdk` bereit.

---

## 5. Backend programmieren (`SidelineBackendPlugin`)

`src/server.ts` exportiert per `export default` (oder `export const backendPlugin`) ein `SidelineBackendPlugin`-Objekt. Der `PluginRuntimeLoader` lädt dieses Modul beim Core-Start sowie **live ohne Neustart** nach Installation/Rollback/Aktivierung.

**Voraussetzung für Registrierung:** Das Export-Objekt enthält `manifest` (`manifest.id` muss exakt zur installierten Plugin-ID passen) und mindestens eines der folgenden Felder:
* `handleRequest(req, ctx)`
* `handlePublicRequest(req, db)`
* `deliverNotification(event, ctx)`
* `migrations`
* `listExportableItems` / `exportScope` / `importScope`

### Datenbank-Isolation & Migrationen
* Der Core legt pro Plugin ein eigenes PostgreSQL-Schema **`plugin_<id_snake_case>`** an (z. B. `plugin_scouting_demo` für `scouting-demo`).
* Jeder Aufruf von `ctx.db.query(sql, params)` setzt automatisch `SET LOCAL search_path TO "plugin_<slug>"`. Das Plugin sieht **weder** `core.*`-Tabellen **noch** Tabellen anderer Plugins.
* Tabellen müssen mit `manifest.dbPrefix` beginnen (`mod_<slug>_*`) und bei teambezogenen Daten eine Spalte `team_id TEXT NOT NULL` enthalten.
* Migrationen können wahlweise als SQL-Dateien in `migrations/*.sql` (beim Installieren ausgeführt) **oder** als Array `migrations: [{ name, sql }]` am `SidelineBackendPlugin` (beim Laden ausgeführt) hinterlegt werden – jede Migration läuft transaktional und idempotent via `core.plugin_migrations`.

```ts
import type { SidelineBackendPlugin } from '@sidelineos/plugin-sdk';
import manifest from '../plugin.manifest.json' assert { type: 'json' };

export const backendPlugin: SidelineBackendPlugin = {
  manifest: manifest as SidelineBackendPlugin['manifest'],
  migrations: [
    {
      name: '001_scouting_reports.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS mod_scouting_reports (
          id TEXT PRIMARY KEY,
          team_id TEXT NOT NULL,
          season TEXT NOT NULL,
          title TEXT NOT NULL,
          created_by TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_mod_scouting_team
          ON mod_scouting_reports (team_id, season);
      `,
    },
  ],
  async handleRequest(req, ctx) {
    if (req.method === 'GET' && req.path === '/reports') {
      const season = typeof req.query.season === 'string' ? req.query.season : ctx.team.aktiveSaison;
      const rows = await ctx.db.query(
        `SELECT id, title, season, created_at FROM mod_scouting_reports
         WHERE team_id = $1 AND ($2 = 'ALL' OR season = $2)
         ORDER BY created_at DESC`,
        [ctx.team.id, season]
      );
      return { status: 200, body: { reports: rows.rows } };
    }

    if (req.method === 'POST' && req.path === '/reports') {
      if (ctx.teamRolle === 'PLAYER') {
        return { status: 403, body: { fehler: 'Nur Coaches oder Team Admins erlaubt.' } };
      }
      const title = String((req.body as { title?: string })?.title ?? '').trim();
      if (!title) return { status: 400, body: { fehler: 'Titel erforderlich.' } };

      const id = `rep-${Date.now()}`;
      await ctx.db.query(
        `INSERT INTO mod_scouting_reports (id, team_id, season, title, created_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, ctx.team.id, ctx.team.aktiveSaison, title, ctx.user.uuid]
      );

      // Optional: Benachrichtigung über Core-Dispatcher auslösen (Permission: notifications:send)
      await ctx.notifications?.send({
        eventType: 'scouting.report_created',
        title: `Neuer Scouting-Bericht: ${title}`,
        message: `${ctx.user.vollerName} hat einen neuen Bericht erstellt.`,
        linkPath: '/',
        priority: 'info',
      });

      return { status: 201, body: { id, title } };
    }

    return { status: 404, body: { fehler: 'Route nicht gefunden.' } };
  },
};

export default backendPlugin;
```

---

## 6. Eingebaute Core-Broker-Schnittstellen (`S3`, `Multipart`, `Notifications`, `Permissions`)

### Berechtigungsmodell (Least Privilege)
| Scope | Erlaubter Zugriff | Verboten |
| :--- | :--- | :--- |
| `team:read` | `ctx.team` (`id`, `name`, `saisons`, `aktiveSaison`), `ctx.teamRolle` | Zugriff auf andere Teams |
| `team:roster-read` | Kaderliste, Units, Trikotnummern & Positionen | Globale E-Mail-/Passwort-Tabellen |
| `s3:team-rw` | Signierte Single-PUT-, Multipart- & Download-URLs in `teams/<teamId>/<s3Prefix>*` | Rohe S3-Keys, fremde Teams |
| `s3:cleanup-queue` | Verwaiste S3-Pfade mit Schonfrist vormerken (`ctx.cleanupQueue`) | Direktes Löschen fremder Objekte |
| `db:plugin-tables` | SQL-Queries im eigenen Schema `plugin_<slug>` auf `dbPrefix`-Tabellen | Core-Tabellen oder fremde Plugins |
| `share:public-links` | Öffentliche `/share/<token>`-Ansicht + `handlePublicRequest` | Umgehung der Team-RBAC |
| `notifications:send` | Auslösen von Benachrichtigungen (`ctx.notifications` / `/_notifications/send`) | Direktes Auslesen von User-E-Mails |
| `notifications:channel` | Bereitstellen eigener Zustellwege (`notificationChannels` + `deliverNotification`) | Team-übergreifender Klartext-Zugriff |

### Core-S3-Broker direkt über Gateway (Frontend) oder `ctx.s3` (Backend)
Alle Pfade beginnen mit `/api/v1/plugins/<pluginId>/teams/<teamId>`:

* **Single-PUT Upload** *(nur `TEAM_ADMIN` / `COACH`)*: `POST /_s3/presign-upload` `{ objectPath, contentType, fileSizeBytes }` → `{ url, key, expiresIn }`
* **Multipart Upload** *(für große Dateien bis `S3_MAX_UPLOAD_BYTES`, nur `TEAM_ADMIN` / `COACH`)*:
  1. `POST /_s3/multipart/init` `{ objectPath, contentType, fileSizeBytes }` → `{ uploadId, key, maxFileSizeBytes }`
  2. `POST /_s3/multipart/sign-part` `{ objectPath, uploadId, partNumber }` → `{ url, key, partNumber, expiresIn }`
  3. `POST /_s3/multipart/complete` `{ objectPath, uploadId, parts: [{ partNumber, etag }] }` → `{ key, etag, location }`
  4. `POST /_s3/multipart/abort` `{ objectPath, uploadId }` → `{ ok: true }`
* **Download**: `POST /_s3/presign-download` `{ objectPath, expiresInSeconds? }` → `{ url, key, expiresIn }`
* **Löschen / Cleanup-Queue** *(nur `TEAM_ADMIN` / `COACH`)*: `DELETE /_s3/object` bzw. `POST /_s3/cleanup-queue` `{ objectPaths, reason? }`

Im Backend stehen identische Methoden direkt über `ctx.s3.*` und `ctx.cleanupQueue.enqueueOrphanedObjects(...)` bereit.

### Notification-Broker & eigene Zustellweg-Plugins
* **Benachrichtigung senden (`notifications:send`):** Über `ctx.notifications.send(payload)` im Backend oder `POST /api/v1/plugins/<pluginId>/teams/<teamId>/_notifications/send` im Frontend. Standardkanäle im Core sind `in-app` und `smtp`; alle aktiven Channel-Plugins des Teams sind über `GET /_notifications/channels` abrufbar.
* **Eigenen Zustellkanal bauen (`notifications:channel`):** Benötigt weder UI noch `handleRequest`:

```ts
import type { SidelineBackendPlugin } from '@sidelineos/plugin-sdk';
import manifest from '../plugin.manifest.json' assert { type: 'json' };

export default {
  manifest: manifest as SidelineBackendPlugin['manifest'],
  notificationChannels: [
    { id: 'discord-webhook', label: 'Discord Webhook', description: 'Sendet Team-Alerts an Discord.' },
  ],
  async deliverNotification(event, ctx) {
    // event: { title, message, priority, linkPath, teamId, teamName, recipients, metadata }
    // Beispiel: Webhook-URL aus ctx.db (plugin-isoliert) lesen und senden
    return { delivered: event.recipients.length };
  },
} satisfies SidelineBackendPlugin;
```

### Optionale Scope-Hooks (Federation / Export-Vorbereitung)
Auf `SidelineBackendPlugin` können optional drei Methoden für späteren Team-Austausch bereitgestellt werden (Signaturen exakt aus `@sidelineos/plugin-sdk`):
* `listExportableItems(ctx, options?: { season?: string }) => Promise<PluginScopeItem[]>`
* `exportScope(ctx, options?: { itemIds?: string[]; season?: string }) => Promise<PluginExportScopeResult>`
* `importScope(ctx, bundle: PluginExportScopeResult, options?: { mode: 'replace' | 'merge' }) => Promise<{ imported: number; skipped: number }>`

---

## 7. Sicherheits- & Qualitätsregeln

1. **Kein `eval` / dynamisches SQL-String-Bauen:** Immer Parameterbindung (`$1`, `$2`) in `ctx.db.query(...)` nutzen.
2. **Kein `dangerouslySetInnerHTML`:** Ausschließlich sicheres React-Binding (`{wert}`).
3. **Rollenprüfung auch im Plugin-Backend:** Das Core-Gateway prüft Team-Mitgliedschaft und Modul-Aktivierung; ob ein `PLAYER` bestimmte Schreibaktionen innerhalb des Plugins ausführen darf (`ctx.teamRolle`), prüft das Plugin in `handleRequest` selbst.
4. **Sichtbarkeit:** Ist ein Plugin global oder fürs Team deaktiviert, blendet Core alle UI-Einträge aus und blockiert Gateway-Requests mit `403 Forbidden`.
5. **Cross-Platform-Fähigkeit:** Domain-Services unter `src/services/` frei von `window` / `document` halten.

---

## 8. Release-Paket & GitHub Actions Vorlage

Für die produktive Installation per GitHub Release oder Offline-`.tar.gz`-Upload müssen `plugin.manifest.json`, `dist/` und optional `migrations/` **direkt im Root des `.tar.gz`-Archivs** liegen (keine verschachtelten Symlinks, max. 25 MB / 500 Dateien).

Vorlage `.github/workflows/release.yml`:

```yaml
name: SidelineOS Plugin Release
on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  build-and-release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npm test
      - run: npm run build
      - name: Plugin-Bundle packen & SHA-256 erzeugen
        run: |
          mkdir -p .bundle
          cp plugin.manifest.json .bundle/
          cp -r dist .bundle/dist
          if [ -d migrations ]; then cp -r migrations .bundle/migrations; fi
          tar -czf sideline-plugin-v1.tar.gz -C .bundle .
          sha256sum sideline-plugin-v1.tar.gz > sideline-plugin-v1.tar.gz.sha256
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            sideline-plugin-v1.tar.gz
            sideline-plugin-v1.tar.gz.sha256
            plugin.manifest.json
```

### Entwicklungs-Workflow gegen eine laufende Core-Instanz
1. Auf der Test-Instanz in `.env` setzen: `DEV_ALLOW_GIT_INSTALL="true"`.
2. Im Sysadmin-Plugin-Store den Tab **Dev: Git Clone & Build** öffnen.
3. Repo-URL `https://github.com/<org>/SidelineOS-<slug>` + Branch (z. B. `main` oder `dev`) angeben.
4. Core klont, installiert `devDependencies`, führt `npm run build` aus, setzt die Version automatisch auf `<branch>-<short-sha>` und lädt Backend + Frontend ohne Neustart live nach.

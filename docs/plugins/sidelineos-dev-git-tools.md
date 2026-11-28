# System-Plugin Blueprint: `SidelineOS-dev-git-tools`

- **Repository:** `SidelineOS-dev-git-tools`
- **Plugin-ID:** `dev-git-tools`
- **Ziel-SDK:** `@sidelineos/plugin-sdk` `2.0` (`minCoreVersion: '0.2.0'`)

---

## 1. Verantwortung & Sicherheits-Motivation

In v0.1.x enthielt `SidelineOS-core` produktive Child-Process-Pipelines (`git clone`, `git pull`, `npm ci`, `npm run build`), die in Produktionsinstanzen eine unnötige Angriffsfläche (RCE-Risiko + Abhängigkeiten auf `git`/`npm` im Container) darstellten.

In v0.2.0 wird diese Entwicklungs-Toolchain vollständig in das optionale Plugin `SidelineOS-dev-git-tools` ausgelagert. **Produktive Instanzen installieren dieses Plugin nicht.**

---

## 2. Manifest (`plugin.json` / `src/manifest.ts`)

```ts
export const manifest: PluginManifest = {
  id: 'dev-git-tools',
  name: 'Dev Git-Build-Tools',
  kurzbeschreibung: 'Klont, baut und aktualisiert Plugins direkt aus Git-Branches (nur Entwicklung).',
  version: '1.0.0',
  sdkVersion: '2.0',
  minCoreVersion: '0.2.0',
  icon: 'git-branch',
  permissions: [
    'db:plugin-schema',
    'ui:system-panel',
    'dev:git-install',
    'core:plugins-manage',
  ],
  navigation: {
    surface: 'system',
    scopes: ['global'],
    settingsPanels: [
      {
        id: 'dev-git',
        target: 'system',
        group: 'Entwicklung',
        label: 'Git-Build & Reload',
        routeSegment: 'dev-tools',
      },
    ],
  },
};
```

---

## 3. Doppelte Sicherheitsabsicherung

Das Plugin funktioniert ausschließlich, wenn **beide** Bedingungen erfüllt sind:
1. Auf dem Server ist explizit `ALLOW_DEV_PLUGINS=true` gesetzt (Core verweigert sonst bereits beim Start die Freigabe von `dev:git-install`).
2. Ein Sysadmin hat die Capability `dev:git-install` im Core-Notfall-Admin ausdrücklich freigegeben.

---

## 4. Build- & Hot-Reload-Pipeline

1. **Workspace-Verwaltung (`plugin_dev_git_tools.workspaces`):**
   - Speichert `plugin_id`, `repo_url` (strikte `https://`-Allowlist), `branch`, lokalen Arbeitsordner unter `PLUGIN_INSTALL_DIR/_dev_workspaces/<pluginId>` und letzten Commit-Hash.
2. **Isolierte Ausführung (`execFile` ohne Shell):**
   - `git clone --depth 1 --branch <branch> -- <repoUrl> <dir>` bzw. `git pull --ff-only`
   - `npm ci --ignore-scripts=false` (im isolierten Workspace)
   - `npm run build`
   - Paketierung des gebauten Plugin-Verzeichnisses (`plugin.json`, `dist/client.js`, `dist/server.mjs`, optional `dist/client.css`) als deterministisches `.tar.gz` im Speicher.
3. **Atomare Übergabe an den Core:**
   - Übergibt das erzeugte `.tar.gz` an `ctx.coreAdmin.plugins.installArchiveBuffer(tarGzBuffer, 'dev-git-tools')`.
   - Schlägt Build, Manifest-Prüfung oder Backend-Live-Reload fehl, meldet das Plugin den Fehler mit vollständiger Build-Ausgabe und lässt keinen defekten Zwischenstand still aktiv.

---

## 5. Admin-UI (`/admin/system/dev-tools`)

- Warnhinweis „Nur für lokale Entwicklung / Staging“.
- Formular: Git-Repository-URL + Branch -> **„Klonen, bauen & laden“**.
- Tabelle aller verknüpften Dev-Workspaces mit Commit-Hash, Branch, Button **„Git Pull & Rebuild“** und ausklappbarem Build-Log.

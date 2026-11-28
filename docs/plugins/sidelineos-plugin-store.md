# System-Plugin Blueprint: `SidelineOS-plugin-store`

- **Repository:** `SidelineOS-plugin-store`
- **Plugin-ID:** `plugin-store`
- **Ziel-SDK:** `@sidelineos/plugin-sdk` `2.0` (`minCoreVersion: '0.2.0'`)

---

## 1. Verantwortung & Abgrenzung

Während der Core im Notfall-Admin nur den nackten `.tar.gz`-Archiv-Installer und den Capability-Schalter mitbringt, liefert `SidelineOS-plugin-store` den komfortablen **Plugin-Katalog, GitHub-Release-Integration, Update-Checker, Rollback und die Club-/Team-Freigabematrix**.

---

## 2. Manifest (`plugin.json` / `src/manifest.ts`)

```ts
export const manifest: PluginManifest = {
  id: 'plugin-store',
  name: 'Plugin-Store & Updates',
  kurzbeschreibung: 'Katalog, GitHub-Release-Installation, Update-Prüfung und Scope-Freigaben.',
  version: '1.0.0',
  sdkVersion: '2.0',
  minCoreVersion: '0.2.0',
  icon: 'store',
  permissions: ['db:plugin-schema', 'ui:system-panel', 'core:plugins-manage'],
  navigation: {
    surface: 'system',
    scopes: ['global'],
    settingsPanels: [
      {
        id: 'store-catalog',
        target: 'system',
        group: 'Plugins',
        label: 'Plugin-Store',
        routeSegment: 'store',
      },
      {
        id: 'store-scopes',
        target: 'system',
        group: 'Plugins',
        label: 'Freigabematrix',
        routeSegment: 'scopes',
      },
    ],
  },
};
```

---

## 3. Funktionen & Core-Schnittstellen

Nutzt ausschließlich `ctx.coreAdmin.plugins`:

1. **Katalog-Quellen (`plugin_plugin_store.catalog_sources`):**
   - Standard-Katalog (JSON-Index offizieller SidelineOS-Plugins inkl. aller 5 System-Plugins + Fach-Plugins wie `SidelineOS-video`, `SidelineOS-attendance`, `SidelineOS-themepack`).
   - Optional eigene Vereins-/Partner-Katalog-URLs (strikte `https:`-Prüfung).
2. **Ein-Klick-Installation & Update-Checker:**
   - Vergleicht `ctx.coreAdmin.plugins.listInstalled()` mit den neuesten kompatiblen GitHub-Releases (`sdkVersion === '2.0'`), cached Ergebnisse in `plugin_plugin_store.release_cache` (TTL 30 min, ETag-Unterstützung gegen GitHub-Rate-Limits).
   - Löst die `.tar.gz`-Release-Asset-URL auf und ruft `ctx.coreAdmin.plugins.installArchiveUrl(assetUrl)` auf.
3. **Rollback:**
   - Merkt sich die vorherige Release-URL und erlaubt bei Bedarf das gezielte Zurückrollen auf die Vorgängerversion.
4. **Club-/Team-Freigabematrix:**
   - Aktiviert/deaktiviert Fach-Plugins gezielt pro Verein oder pro Team über `ctx.coreAdmin.plugins.setScopeModuleEnabled(scopeTyp, scopeId, pluginId, enabled)`.

---

## 4. Sicherheitsmodell

- Der Store kann niemals selbstständig privilegierte Capabilities freigeben — die Freigabe privilegierter Capabilities bleibt aus Sicherheitsgründen exklusiv im Core-Notfall-Admin (`/admin/system/recovery`) verankert.
- Alle Remote-Abrufe nutzen `https:` mit SSRF-Prüfung auf private IP-Bereiche.

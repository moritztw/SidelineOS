# Migrationsleitfaden: Plugin SDK v1.0 -> SDK v2.0

Mit **SidelineOS-core v0.2.0** erfolgt ein sauberer Schnitt auf `@sidelineos/plugin-sdk` **v2.0**. Der Core ist nun vollständig sportartagnostisch, speicherort-agnostisch und nutzt ein verbindliches 4-Ebenen-Navigationsmodell.

---

## 1. Übersicht der Breaking Changes

| Bereich | SDK v1.0 (alt) | SDK v2.0 (neu) |
|---|---|---|
| `manifest.sdkVersion` | `'1.0'` | `'2.0'` |
| `manifest.minCoreVersion` | `'0.1.0'` | `'0.2.0'` |
| Navigation im Manifest | `tabs: [...]` + `sichtbarAufHub` | `navigation: { surface, scopes, sidebarGroups, settingsPanels }` |
| Berechtigungen | `s3:team-rw` | `storage:team-rw` oder `storage:club-rw` |
| Backend Storage-Scope | `ctx.s3` | `ctx.storage` (virtuell über `nodeId` geroutet) |
| Gruppen / Units | `ctx.userUnits` (`'OFFENSE' \| 'DEFENSE' \| 'SPECIAL_TEAMS'`) | `ctx.userGroups` (`string[]`, frei definierbar pro Team) |
| Rollenkontext | `ctx.teamRolle` | `ctx.clubRolle`, `ctx.effektiveTeamRolle` (inkl. `CLUB_ADMIN -> TEAM_ADMIN`-Kaskade) |
| Team-Archivierung | nicht vorhanden | `ctx.isReadOnly` (`ctx.team?.status === 'ARCHIVED'`) |
| API-Basis-URL | `/api/v1/plugins/:id/teams/:teamId` | `/api/v2/plugins/:id/teams/:teamId` (oder `/clubs/:clubId`, `/system`) |
| Frontend-View-Props | `aktiveTabId`, `onTabWechsel` | `ctx.activeView`, `ctx.navigateToView(routeSegment)` |

---

## 2. Schritt-für-Schritt-Migration

### Schritt 1: `package.json` & Manifest aktualisieren

```json
{
  "dependencies": {
    "@sidelineos/plugin-sdk": "^2.0.0"
  }
}
```

```ts
export const manifest: PluginManifest = {
  id: 'video-analyse',
  name: 'Video-Analyse',
  kurzbeschreibung: 'Spiele und Trainings mit Timestamps auswerten.',
  version: '2.0.0',
  sdkVersion: '2.0',
  minCoreVersion: '0.2.0',
  icon: 'film',
  permissions: ['db:plugin-schema', 'storage:team-rw', 'notifications:send', 'share:public-links'],
  storagePrefix: 'video',
  navigation: {
    surface: 'app',
    scopes: ['team'],
    sidebarGroups: [
      {
        id: 'medien',
        label: 'Videothek',
        items: [
          { id: 'library', label: 'Alle Videos', routeSegment: 'library' },
          { id: 'playlists', label: 'Cutups & Playlists', routeSegment: 'playlists' },
        ],
      },
      {
        id: 'verwaltung',
        label: 'Team',
        items: [
          {
            id: 'upload',
            label: 'Upload',
            routeSegment: 'upload',
            requiredTeamRoles: ['TEAM_ADMIN', 'STAFF'],
          },
        ],
      },
    ],
  },
};
```

### Schritt 2: Backend-Handler anpassen

1. **`ctx.s3` -> `ctx.storage`:**
   - Upload-Presigning akzeptiert optional `fileSizeBytes` zur Vorabprüfung gegen den Vereins-Speicherpool (#24).
   - Bei `100 %` Auslastung wirft der Core `STORAGE_QUOTA_EXCEEDED` (`HTTP 413`); bei archivierten Teams `TEAM_ARCHIVED_READ_ONLY` (`HTTP 409`).
   - Downloads (`getSignedDownloadUrl`) bleiben in beiden Fällen offen.
2. **`ctx.userUnits` -> `ctx.userGroups`:**
   - Sportartspezifische Filter (z. B. `OFFENSE`, `U19`, `Torhüter`) vergleichen jetzt gegen `ctx.userGroups` (`string[]`).
3. **`ctx.teamRolle` -> `ctx.effektiveTeamRolle`:**
   - Ein `CLUB_ADMIN` erhält automatisch `effektiveTeamRolle === 'TEAM_ADMIN'` (#23).
4. **Saisons / Kategorien:**
   - Falls ein Plugin Saisons oder Spieltage nutzt, führt es diese als eigene Tabelle im isolierten Plugin-Schema (`plugin_<id>`) statt über Core-Felder.

### Schritt 3: Frontend-Komponenten anpassen

- `ctx.activeView` auswerten statt eigenem Tab-State.
- Für Wechsel zwischen Sidebar-Ansichten `ctx.navigateToView('playlists')` aufrufen (aktualisiert die Browser-URL auf `/modules/<id>/playlists`).
- Wenn `ctx.isReadOnly === true`, schreibende Aktionen (Upload, Löschen, Bearbeiten) deaktivieren oder ausblenden.

---

## 3. Hinweise für bestehende SidelineOS-Plugins

- **`SidelineOS-video`:** `s3:team-rw` -> `storage:team-rw`, `ctx.s3` -> `ctx.storage`, `fileSizeBytes` beim Presign übergeben, TopBar-Tabs in `sidebarGroups` verschieben, `ctx.isReadOnly` für Upload-Buttons respektieren.
- **`SidelineOS-attendance`:** `userUnits` -> `userGroups`, Anwesenheitsgruppen dynamisch aus `ctx.userGroups` bzw. eigener Plugin-Tabelle speisen, `tabs` in `sidebarGroups` überführen.
- **`SidelineOS-themepack`:** `navigation: { surface: 'headless', scopes: ['global'] }`, `permissions: ['theme:presets']`, `sdkVersion: '2.0'`. Keine UI-Komponenten erforderlich.
- **`SidelineOS-templateplugin`:** Manifest und Beispiel-Handler auf SDK v2.0 aktualisieren (`ctx.storage`, `ctx.effektiveTeamRolle`, `sidebarGroups`, `settingsPanels`).

# SidelineOS v0.2.0 — Verbindliche Navigations- & Menü-Richtlinien

Diese Richtlinie gilt verbindlich für den Core sowie alle System- und Fach-Plugins auf Basis von `@sidelineos/plugin-sdk` v2.0. Ziel ist ein konsistentes Navigations- und Bedienmodell über das gesamte Produkt hinweg.

---

## 1. Das 4-Ebenen-Navigationsmodell

| Ebene | Komponente | Verantwortung | URL-Muster | Plugin-Zugriff |
|---|---|---|---|---|
| **Ebene 0** | Feste `CoreTopBar` (56 px) | Wortmarke, globale Navigation (`Start`, `Verein`, `System`), Club-/Team-Wechsler, Posteingang, Benutzerkonto | bleibt in allen Ansichten stabil | **Kein Eingriff** (kein TopBar-Hijacking, keine Plugin-Tabs in der TopBar) |
| **Ebene 1** | `SidelineHubView` (Start-Hub) | Kacheln ausschließlich für aktive Fach-Plugins (`surface: 'app'`) | `/` | Automatisch über `manifest.navigation.surface = 'app'` |
| **Ebene 2** | Einheitliche linke `ContextSidebar` (248 px) | Bereichs- und Modul-Navigation mit echten Browser-Routen | `/modules/<id>/<view>`, `/settings/account/<panel>`, `/admin/club/<panel>`, `/admin/system/<panel>` | Deklarativ über `sidebarGroups` oder `settingsPanels` im Manifest |
| **Ebene 3** | In-Page Sub-Navigation & Aktionsleiste | Lokale Filter, Detail-Tabs innerhalb einer Ansicht, primäre Aktionen | Query-Parameter oder lokaler View-State | Frei innerhalb der eigenen Inhaltsfläche |

---

## 2. Regeln für Plugin-Manifeste (`manifest.navigation`)

```ts
navigation: {
  surface: 'app' | 'headless' | 'system',
  scopes: ['team'] | ['club'] | ['global'],
  sidebarGroups?: [
    {
      id: 'hauptgruppe',
      label: 'Analyse',
      items: [
        { id: 'overview', label: 'Übersicht', routeSegment: 'overview' },
        { id: 'manage', label: 'Verwaltung', routeSegment: 'manage', requiredTeamRoles: ['TEAM_ADMIN'] }
      ]
    }
  ],
  settingsPanels?: [
    {
      id: 'storage-nodes',
      target: 'system', // 'account' | 'club' | 'system'
      group: 'Infrastruktur',
      label: 'S3 & Storage-Nodes',
      routeSegment: 'storage'
    }
  ]
}
```

### Verbindliche Grenzen
- **Surface-Wahl:**
  - `app`: Fach-Plugins mit eigenem Arbeitsbereich (erscheinen als Kachel auf dem Start-Hub).
  - `system`: Reine Admin-Plugins (erscheinen ausschließlich über `settingsPanels` unter `/admin/club/*` oder `/admin/system/*`, niemals als Hub-Kachel).
  - `headless`: Hintergrund-Plugins ohne eigene Hauptansicht (z. B. `theme:presets` oder reine `notifications:channel`-Provider).
- **Maximal 3 `sidebarGroups` pro Plugin:** Der Core schneidet überzählige Gruppen ab und weist Manifeste mit mehr als 3 Gruppen bei der Installation ab.
- **Echte URL-Routen statt Scroll-Spy:** Jeder Sidebar-Eintrag besitzt ein eindeutiges `routeSegment` (`[a-z0-9-]`), das direkt auf `/modules/<pluginId>/<routeSegment>` bzw. `/admin/<target>/<routeSegment>` abgebildet wird.
- **Rollenfilterung:** Einträge mit `requiredClubRoles` oder `requiredTeamRoles` blendet der Core automatisch aus, falls der Benutzer die Rolle nicht besitzt (inkl. `CLUB_ADMIN -> TEAM_ADMIN`-Kaskade). Die zugehörigen API-Routen müssen die Berechtigung dennoch serverseitig prüfen.

---

## 3. Strikte Trennung der Administrations-Bereiche (#23)

| Bereich | URL-Präfix | Zielgruppe | Zweck |
|---|---|---|---|
| **Persönliches Konto** | `/settings/account/*` | Jeder angemeldete Benutzer | Profil, Sprache, Theme, Passwort, eigene Benachrichtigungspräferenzen |
| **Vereins-Administration** | `/admin/club/*` | `CLUB_ADMIN`, `TEAM_ADMIN` | Teams, Vereinsmitglieder, Einladungen, Gruppen, Vereins-Speicherpool, Modul-Freigaben |
| **System-Administration** | `/admin/system/*` | `istSysadmin = true` | Instanzstatus, Plugins, Storage-Nodes, SMTP, globale Quotas — **strikt ohne Zugriff auf Vereinsinhalte** |

---

## 4. Read-Only-Verhalten bei archivierten Teams (#25)

Ist `ctx.isReadOnly === true` (d. h. `ctx.team?.status === 'ARCHIVED'`):
- Der Core zeigt automatisch das globale Archiv-Banner an und blockiert alle schreibenden Gateway-Anfragen (`POST`, `PUT`, `PATCH`, `DELETE`) sowie Storage-Uploads mit `HTTP 409 TEAM_ARCHIVED_READ_ONLY`.
- Plugins **müssen** schreibende Buttons (Upload, Erstellen, Bearbeiten, Löschen) ausblenden oder deaktivieren, während Lese-, Filter- und Download-Ansichten vollständig bedienbar bleiben.

---

## 5. Styling & Design-System-Disziplin

- **Ausschließlich `--sl-*`-Tokens verwenden:** Keine hartkodierten Farben (`#...`, `bg-slate-*`), sondern semantische Utilities (`bg-sl-canvas`, `bg-sl-surface`, `border-sl-border`, `text-sl-heading`, `text-sl-muted`, `bg-sl-accent`), damit alle Theme-Plugins konsistent funktionieren.
- **Keine eigene Sidebar oder TopBar im Plugin rendern:** Ebene 0 und Ebene 2 gehören dem Core.
- **Zahlenformatierung:** Speichergrößen, Zähler und Zeitstempel stets mit `font-mono tabular-nums` darstellen.

# System-Plugin Blueprint: `SidelineOS-org-admin`

- **Repository:** `SidelineOS-org-admin`
- **Plugin-ID:** `org-admin`
- **Ziel-SDK:** `@sidelineos/plugin-sdk` `2.0` (`minCoreVersion: '0.2.0'`)
- **Abgedeckte Issues:** `#23`, `#24`, `#25`, `#26`

---

## 1. Verantwortung & Abgrenzung

`SidelineOS-org-admin` stellt die komplette grafische und fachliche Verwaltung für **Vereine (Clubs), Teams, Mitglieder, Rollen, flexible Gruppen/Tags und Einladungslinks** bereit. Es ersetzt die ehemaligen monolithischen Core-Seiten (`TeamSettingsPage.tsx`, `teams.ts`, Teile von `SysadminPage.tsx`).

- **Kein direkter SQL-Zugriff auf `core.*`:** Alle Mutationen erfolgen ausschließlich über die typisierten Core-Scopes `ctx.coreAdmin.org` und `ctx.coreAdmin.users`.
- **Sportartagnostisch:** Gruppen/Tags (z. B. `Offense`, `Defense`, `U19`, `Torwart`, `Vorstand`) werden als freie String-Arrays gespeichert; optionale Vorlagen-Sets pro Verein können im eigenen Plugin-Schema `plugin_org_admin` abgelegt werden.

---

## 2. Manifest (`plugin.json` / `src/manifest.ts`)

```ts
export const manifest: PluginManifest = {
  id: 'org-admin',
  name: 'Vereins- & Teamverwaltung',
  kurzbeschreibung: 'Verwaltet Vereine, Teams, Archivierung, Mitglieder, Gruppen und Einladungslinks.',
  version: '1.0.0',
  sdkVersion: '2.0',
  minCoreVersion: '0.2.0',
  icon: 'users',
  permissions: [
    'db:plugin-schema',
    'ui:club-panel',
    'ui:system-panel',
    'notifications:send',
    'core:org-manage',
    'core:users-manage',
  ],
  navigation: {
    surface: 'system',
    scopes: ['club', 'global'],
    settingsPanels: [
      {
        id: 'club-teams',
        target: 'club',
        group: 'Verein',
        label: 'Teams & Archiv',
        routeSegment: 'teams',
        requiredClubRoles: ['CLUB_ADMIN'],
      },
      {
        id: 'club-members',
        target: 'club',
        group: 'Verein',
        label: 'Vereinsmitglieder',
        routeSegment: 'members',
        requiredClubRoles: ['CLUB_ADMIN'],
      },
      {
        id: 'club-invites',
        target: 'club',
        group: 'Verein',
        label: 'Einladungen',
        routeSegment: 'invites',
        requiredTeamRoles: ['TEAM_ADMIN'],
      },
      {
        id: 'club-modules',
        target: 'club',
        group: 'Verein',
        label: 'Module',
        routeSegment: 'modules',
        requiredClubRoles: ['CLUB_ADMIN'],
      },
      {
        id: 'system-clubs',
        target: 'system',
        group: 'Mandanten',
        label: 'Vereine anlegen',
        routeSegment: 'clubs',
      },
    ],
  },
};
```

---

## 3. Verzeichnisstruktur

```text
SidelineOS-org-admin/
├── package.json
├── plugin.json
├── src/
│   ├── manifest.ts
│   ├── backend/
│   │   ├── index.ts              # definiereBackendPlugin(...)
│   │   ├── migrations.ts         # Optional: plugin_org_admin.group_templates
│   │   └── handlers.ts           # Routen für Teams, Mitglieder, Einladungen, Clubs
│   └── frontend/
│       ├── index.ts              # definierePlugin({ manifest, SettingsPanel })
│       ├── TeamsPanel.tsx        # Team CRUD + Archivieren/Reaktivieren (#23, #25)
│       ├── MembersPanel.tsx      # Zentrale Club-Mitgliederliste & Team-Zuweisung (#26)
│       ├── InvitesPanel.tsx      # Team- & Club-Einladungslinks (#26)
│       └── SystemClubsPanel.tsx  # Neues Club-Onboarding durch Sysadmin (#23)
└── tests/
    └── orgAdmin.test.ts
```

---

## 4. Backend-Endpunkte (über Plugin-Gateway)

Alle Pfade unter `/api/v2/plugins/org-admin/clubs/:clubId/*` (Club-Scope) bzw. `/system/*` (Sysadmin-Scope):

| Methode & Pfad | Rollenprüfung | Aktion |
|---|---|---|
| `GET /clubs/:clubId/teams?includeArchived=true` | `CLUB_ADMIN` oder `TEAM_ADMIN` | Ruft `ctx.coreAdmin.org.listTeams(...)` auf |
| `POST /clubs/:clubId/teams` | `CLUB_ADMIN` | Legt Team inkl. Akzentfarbe an |
| `PATCH /clubs/:clubId/teams/:teamId` | `CLUB_ADMIN` oder `TEAM_ADMIN` | Aktualisiert Name/Farbe/Metadaten |
| `POST /clubs/:clubId/teams/:teamId/archive` | `CLUB_ADMIN` | `setTeamStatus(teamId, 'ARCHIVED')` (#25) |
| `POST /clubs/:clubId/teams/:teamId/restore` | `CLUB_ADMIN` | `setTeamStatus(teamId, 'ACTIVE')` (#25) |
| `GET /clubs/:clubId/members` | `CLUB_ADMIN` | Zentrale Vereins-Mitgliederliste inkl. Team-Zuordnungen (#26) |
| `PUT /clubs/:clubId/members/:userUuid` | `CLUB_ADMIN` | Club-Rolle ändern (`CLUB_ADMIN` / `MEMBER`) |
| `PUT /clubs/:clubId/teams/:teamId/members/:userUuid` | `CLUB_ADMIN` oder `TEAM_ADMIN` | Bestehendes Vereinsmitglied direkt einem Team + `groups[]` zuweisen (#26) |
| `POST /clubs/:clubId/invitations` | `CLUB_ADMIN` oder `TEAM_ADMIN` | Erzeugt Club- oder Team-Einladungslink; sendet optional Einladungs-Event über `ctx.notifications.send` (sofern `channel-smtp` aktiv) |
| `DELETE /clubs/:clubId/invitations/:id` | `CLUB_ADMIN` oder `TEAM_ADMIN` | Widerruft offene Einladung |
| `GET /system/clubs` / `POST /system/clubs` | `ctx.user.istSysadmin` | Legt neue Vereine an und ordnet ersten `CLUB_ADMIN` zu (#23) |

---

## 5. Sicherheits- & Edge-Case-Regeln

- `TEAM_ADMIN` darf ausschließlich Teams innerhalb seines eigenen Vereins einladen/bearbeiten, für die er `effektiveTeamRolle === 'TEAM_ADMIN'` besitzt.
- Letzten aktiven `CLUB_ADMIN` eines Vereins niemals herabstufen, um Lockout zu verhindern.
- Sysadmins sehen im Panel `system-clubs` ausschließlich Vereins-Metadaten (Name, Slug, Anzahl Teams) — keine Vereinsinhalte (#23).

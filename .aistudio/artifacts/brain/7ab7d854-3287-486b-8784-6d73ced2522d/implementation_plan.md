# SidelineOS-core v0.2.0 — Micro-Kernel, SDK v2.0, Einheitliche Menü-Architektur & Issue-Abgleich (#21–#26)

SidelineOS-core wird von einem ~18.600-Zeilen-Monolithen auf einen schlanken, sportartneutralen Micro-Kernel (~5.000–6.000 LOC) verschlankt. Infrastruktur, Store/Dev-Tooling sowie Club-, Team- und Benutzerverwaltung wandern in fünf eigenständige System-Plugin-Repos mit klaren Spezifikationen, während ein verbindliches 4-Ebenen-Navigationsmodell (feste TopBar + Kontext-Sidebar) und alle offenen GitHub-Issues (`#21`–`#26`) sauber in Kernel-Primitive und Ziel-Module aufgeteilt werden.

---

## Benutzer-Review & Verbindliche Leitentscheidungen

> [!IMPORTANT]
> Alle sechs offenen GitHub-Issues (`#21`–`#26`) wurden eingearbeitet. Daraus ergeben sich vier gezielte Schärfungen gegenüber dem ersten Entwurf:
> 1. **Zwingende Club-Hierarchie + Rollenkaskade (`#23`):** Jedes Team gehört zwingend zu genau einem Club (`1:n`); ein `CLUB_ADMIN` ist im Core-RBAC automatisch und unveränderlich `TEAM_ADMIN` in allen (auch zukünftigen) Teams seines Clubs.
> 2. **Strikte Admin-Trennung (`#23`):** `/admin/system/*` (Instanzpflege ohne Vereinseinsicht) und `/admin/club/*` (Vereins-, Team-, Mitglieder- & Speicherverwaltung).
> 3. **Getrennte Club- & Team-Mitgliedschaften (`#26`) + Team-Archivierung (`#25`):** Saubere Trennung zwischen Vereinszugehörigkeit und Teamrollen sowie Read-Only-Archivstatus für Teams statt hartem Löschen.
> 4. **Vereins-Speicherpool + Multi-Storage-Routing (`#21`, `#22`, `#24`):** Speicher-Quotas liegen auf Club-Ebene (90 % Warnbanner, 100 % Upload-Stopp, per Plugin-Capability steuerbar für künftige Billing-Plugins), und der Core-Storage-Broker routet virtuell über eine `storage_node_id` pro Club an mehrere S3-Knoten.

- **Core-Zuschnitt (Bestätigt):** Hybrid-Micro-Kernel – Auth/Sessions, zwingendes Club→Team→Gruppen-Datenmodell, Plugin-Runtime & Gateway, generische Provider-Schnittstellen (Storage inkl. Quota & Node-Routing, Notifications, Settings-Slots) sowie In-App-Notifications bleiben im Core.
- **5 eigenständige System-Plugin-Repos (Bestätigt):** `SidelineOS-org-admin`, `SidelineOS-storage-s3`, `SidelineOS-channel-smtp`, `SidelineOS-plugin-store` und `SidelineOS-dev-git-tools` erhalten je eine eigene, vollständige Bau- und Schnittstellen-Dokumentation im Core-Projekt.
- **Datenmodell & SDK v2.0 (Bestätigt):** Direkter Schnitt auf SDK v2.0 ohne Altlasten (bestehende Fach-Plugins wie Video, Attendance, Themepack werden anhand des Migrationsleitfadens auf v2.0 gehoben).
- **Navigationsmodell (Bestätigt):** Feste TopBar plus einheitliche linke Kontext-Sidebar für alle Bereiche und Plugins.
- **Instanz-Bootstrapping (Bestätigt):** Notfall-Admin im Core plus ENV-Bootstrap (`CORE_BOOTSTRAP_PLUGINS`) für Standard-Plugins beim Erststart.

---

## 0. Abgleich der offenen GitHub-Issues (#21–#26) & Ziel-Module

| Issue | Thema | Was im `SidelineOS-core v0.2.0` liegt (Kernel-Basis) | Überführung in Ziel-Plugin / Repo |
|---|---|---|---|
| **#23** | Club-Mandantenmodell & Admin-Rollenkaskade | Zwingende `1:n`-Beziehung `Club → Team`, unveränderliche RBAC-Rollenkaskade (`CLUB_ADMIN` ⇒ `TEAM_ADMIN` in allen Teams), strikte UI-Host-Trennung `/admin/system/*` vs. `/admin/club/*`. | **`SidelineOS-org-admin`** (Club-Verwaltungs-UI, Team-Anlage, Rollenübersicht unter `/admin/club/*`). |
| **#25** | Lifecycle-Management: Teams archivieren statt löschen | `status ('ACTIVE' \| 'ARCHIVED')` an `core.teams`, Ausblendung im aktiven Team-Switcher, serverseitiger **Read-Only-Schutz** im Plugin-Gateway (`GET`/Download erlaubt, Schreib-/Upload-Requests geblockt) und `team.status` im SDK v2.0. | **`SidelineOS-org-admin`** (Archivieren-/Reaktivieren-Aktionen & Archiv-Filter unter `/admin/club/teams`). |
| **#26** | Mitglieder-Onboarding: Vereins-Mitgliederliste & Team-Einladungslinks | Trennung in `core.club_memberships` und `core.team_memberships` (Mehrfachrollen ohne Duplikate) sowie atomare Einlösung von Team-Einladungslinks (registriert automatisch Club- + Team-Mitgliedschaft). | **`SidelineOS-org-admin`** (Zentrale Vereins-Mitgliederliste, Team-Einladungslink-Generator, Freigabe-Warteliste & Registrierungs-UI) + **`SidelineOS-channel-smtp`** (optionaler Mailversand). |
| **#24** | Geteilter Vereins-Speicherpool (90 % Soft-Limit, 100 % Hard-Limit) | Club-Speicher-Ledger (`quota_bytes`, `used_bytes`, `soft_limit_percent`) im Core-Storage-Broker, harter Upload-Stopp ab 100 % (Lesen/Analyse bleibt frei) und globaler Core-Warnbanner-Slot ab 90 % für Club-/Team-Admins. | **`SidelineOS-org-admin`** (Vereins-Speicherüberblick unter `/admin/club/storage`) + **`SidelineOS-storage-s3`** (physischer Verbrauchsabgleich & Cleanup-Queue). |
| **#21** | Speicherplatz begrenzen (auch per Plugin steuerbar) | Konsolidiert mit `#24` auf Club-Ebene plus privilegierte Core-Capability **`core:storage-quota-manage`**, damit neben dem Sysadmin auch künftige Abrechnungs-/Tier-Plugins Quotas anpassen können. | **`SidelineOS-storage-s3`** (Sysadmin-Quota-Verwaltung) + perspektivisch eigenständiges **`SidelineOS-billing`**-Plugin (nutzt `core:storage-quota-manage`). |
| **#22** | Mehrere Speicherorte (Multi-S3 & Datenmigration) | Virtuelles `nodeId`-Routing im Core-`StorageProvider`-Interface und `storage_node_id` pro Club – Fach-Plugins bleiben 100 % speicherort-agnostisch. | **`SidelineOS-storage-s3`** (Verwaltung mehrerer S3-/Garage-/R2-Knoten, Club-Zuordnung, Datenmigration zwischen Nodes & Lösch-Workflows unter `/admin/system/storage`). |

> [!NOTE]
> **Einordnung zu `#21` vs. `#24`:** `#21` sprach ursprünglich von Limits pro Team, während `#24` das Zielmodell auf einen **geteilten Vereins-Pool** festlegt. Im Plan wird `#24` als verbindliches Pool-Modell umgesetzt und mit der entscheidenden Anforderung aus `#21` (Steuerbarkeit per Plugin-API für künftige Billing-Tiers) kombiniert.
> **Einordnung zu `#22` (S3 Garage):** Durch das virtuelle `nodeId`-Routing im Core funktionieren beide Betriebsarten nahtlos – sowohl ein extern vorgeschaltetes *Garage*-Cluster als einzelner Storage-Node als auch mehrere getrennte S3-/R2-/MinIO-Instanzen inklusive Umzugsfunktion im `storage-s3`-Plugin.

---

## 1. Überblick & Kernkonzept

### Was SidelineOS-core v0.2.0 leistet
Der Core agiert als **reines Betriebssystem für Vereins- und Team-Apps**: Er garantiert sichere Identitäten, zwingende Vereins- und Team-Mandantengrenzen (`Club → Team`), automatische Admin-Rollenkaskaden, isolierte Datenbank-Schemas (`plugin_<slug>`), zentrales Quota- & Read-Only-Enforcement im Plugin-Gateway sowie eine einheitliche UI-Shell. Fach-, Sportart- und Infrastruktur-Logik wird ausschließlich über SDK-v2.0-Verträge angedockt.

### Zielgruppen & Nutzen
- **Vereins- und Team-Mitglieder (Spieler, Coaches, Vorstände):** Konsistente Navigation über alle Module, Mehrfachrollen ohne Doppelerfassung (`#26`), Bewahrung historischer Daten archivierter Teams (`#25`) und transparenter Kontextwechsel zwischen Club und Teams.
- **Instanz-Betreiber / Sysadmins:** Keine Zwangsabhängigkeiten zu AWS S3, SMTP oder Git/npm im Produktions-Core, saubere Trennung zwischen Systempflege (`/admin/system`) und Vereinsdaten (`/admin/club`), Multi-Storage-Fähigkeit (`#22`) und verlässlicher Notfall-Zugang.
- **Plugin-Entwickler:** Verbindliche Menü-Ebenen, klare URL-Verträge, abstrahierter Speicherzugriff (unabhängig vom konkreten S3-Knoten) und automatisches Quota-/Archiv-Handling durch den Core.

---

## 2. User Experience, Menü-Architektur & Visuelles Design

### Verbindliche 4-Ebenen-Navigations- & Menü-Spezifikation

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ EBENE 0: FESTE TOPBAR (56px, sticky, in JEDER Ansicht unverändert)         │
│ [Wortmarke] / [Kontext-Breadcrumb]   │  [Club / Team-Wechsler]             │
│                                      │  [Glocke] [Admin/Konto]             │
├────────────────────────────────────────────────────────────────────────────┤
│ OPTIONALER CORE-SYSTEM-BANNER (z. B. ≥90 % Vereins-Speicherpool / Archiv)  │
├────────────────────┬───────────────────────────────────────────────────────┤
│ EBENE 2:           │ EBENE 3: ARBEITSBEREICH (Main Viewport)               │
│ KONTEXT-SIDEBAR    │                                                       │
│ (248px, sticky)    │  Kopfzeile: Seitentitel · Kontext · [1 Primäraktion]  │
│                    │  Optional: In-Page-Sub-Tabs / Filterleiste            │
│ Bereich / Plugin:  │  (max. 1 Ebene tief, reine Inhaltsfilterung)          │
│ ─────────────────  │                                                       │
│ Gruppe A           │  ┌─────────────────────────────────────────────────┐  │
│  • Ansicht 1       │  │ Hauptinhalt (Tabelle, Detailansicht, Formular,  │  │
│  • Ansicht 2       │  │ Video-Player, Editor – einzelne Elevation)      │  │
│                    │  └─────────────────────────────────────────────────┘  │
│ Gruppe B           │                                                       │
│  • Einstellungen   │                                                       │
│ ─────────────────  │                                                       │
│ [← Zum Start-Hub]  │                                                       │
└────────────────────┴───────────────────────────────────────────────────────┘
```

#### Verbindliche Regeln je Menü-Ebene (SDK v2.0 Contract)

| Ebene | Zuständigkeit | URL-Muster | Vorgabe für Plugins | Verboten |
|---|---|---|---|---|
| **Ebene 0: Feste TopBar** | Wortmarke (zurück zum Hub), Breadcrumb (`Club / Team / Modul`), Club/Team-Wechsler (filtert archivierte Teams im Normalbetrieb aus), Glocke (In-App-Notifications), Zugang zu Konto & berechtigten Admin-Ebenen. | Global persistent | Keine TopBar-Manipulation; Primäraktionen gehören in den Kopf des Arbeitsbereichs (Ebene 3). | Plugins dürfen globale TopBar-Elemente weder ersetzen noch eigene TopBar-Menüs einfügen. |
| **Ebene 1: Start-Hub & App-Launcher** | Kachel-Übersicht aller im aktiven Club/Team freigeschalteten App-Plugins plus Einstieg in Einstellungen/Admin. | `/` | Deklaration über `manifest.navigation.surface: 'app' \| 'headless' \| 'system'` und `scopes: ('club' \| 'team' \| 'global')[]`. | Keine doppelten Kacheln, keine Status-Ticker, keine Pill-Badges. |
| **Ebene 2: Einheitliche Kontext-Sidebar** | Hauptnavigation **innerhalb** eines Bereichs – identisch für Plugins, Konto, Club-Admin und System-Admin. Jeder Eintrag ist eine **echte URL-Route** (kein Scroll-Spy mehr!). Mobil als einblendbarer Drawer. | `/modules/<plugin>/<view>`, `/settings/account/<panel>`, `/admin/club/<panel>`, `/admin/system/<panel>` | Deklarative `sidebarGroups` (max. 3 Gruppen, 1–2-Wort-Labels, optionale `tabular-nums`-Zähler, Rollenfilter). | Keine eigenen Doppel-Sidebars innerhalb des Plugin-Canvas; keine Baumtiefen > 2 Ebenen. |
| **Ebene 3: In-Page-Sub-Navigation & Aktionen** | Detail-Tabs innerhalb einer einzelnen Ansicht (z. B. `Übersicht · Clips · Notizen`), Such-/Filterleisten und genau **eine** Primäraktion im Seitenkopf. Bei archivierten Teams (`status === 'ARCHIVED'`) zeigt der Core ein dezentes Lesemodus-Banner. | `/modules/<plugin>/<view>/<subId>?tab=...` | Freie Inhaltsgestaltung innerhalb der Core-UI-Konventionen (einzeilige Segmented Controls / Text-Tabs). | Keine zweite globale Navigationsleiste; keine konkurrierenden Primär-CTAs. |

#### Strikte 3-teilige Einstellungs- & Admin-Trennung (gemäß `#23`)
1. **Persönliches Konto (`/settings/account/*`):** Core liefert Profil-Basis, Sprache, Theme-Wahl und Passwort; Plugins können über `ui:account-panel` Benutzer-Präferenzen andocken.
2. **Vereins- & Team-Verwaltung (`/admin/club/*`):** Ausschließlich für `CLUB_ADMIN` (gesamter Verein) und `TEAM_ADMIN` (eigene Team-Ausschnitte). `SidelineOS-org-admin` registriert Clubs, Teams inkl. Archivierung (`#25`), zentrale Vereins-Mitgliederliste & Team-Einladungen (`#26`) sowie den Vereins-Speicherüberblick (`#24`); Fach-Plugins docken team-/clubspezifische Modul-Optionen über `ui:club-panel` an.
3. **System-Administration (`/admin/system/*`):** Ausschließlich für Sysadmins – strikt ohne Einblick in vereinsinterne Daten/Playbooks (`#23`). Der Core liefert den **Notfall-Admin** (`Systemstatus & Basis-Plugin-Installer`); `storage-s3`, `channel-smtp`, `plugin-store` und `dev-git-tools` docken ihre Panels über `ui:system-panel` in derselben Sidebar an.

### Visuelle Identität & Designsystem
- **Ästhetische Ausrichtung:** Ruhiges, präzises Operations-Interface im Stil professioneller SaaS-Konsolen – hohe Informationsdichte ohne visuelle Unruhe.
- **Farbpalette (60-30-10 & semantische `--sl-*`-Tokens):** Deep-Slate-Canvas (`#0B0E11`), abgesetzte TopBar (`#0F1318`), flache Surfaces (`#13171D`) mit 1px Hairline-Borders (`#232933`), Amber-Akzent (`#F59E0B`) strikt für aktive Navigation und die einzelne Primäraktion, semantische Farben (Grün/Amber/Rot) stets mit explizitem Textlabel (z. B. beim 90 %-Speicherwarnbanner und 100 %-Upload-Stopp). Dual-Theme-Fähigkeit über CSS-Variablen bleibt für Theme-Plugins voll erhalten.
- **Typografie & Hierarchie:** Beibehaltung der 2+1-Regel – `Plus Jakarta Sans` für Überschriften/Navigation (`text-wrap: balance`), `DM Sans` für Bedien- und Fließtext, `JetBrains Mono` mit striktem `tabular-nums` für Quoten, Bytes, Zähler und Daten.
- **Komponenten- & Abstandsgrundsätze:** Einzelne Elevationsebene (keine verschachtelten Karten in Karten), keine dicken linken Akzentbalken (`border-l-4`) auf Karten/Callouts, keine statischen Pill-Chips für Metadaten (sauberer Text mit `·`-Trennern), einzeilige Bedienelemente (`whitespace-nowrap shrink-0`) und mobile Sticky-Höhe ≤ 15 % des Viewports.
- **Zustandsvollständigkeit:** Jede Core-Ansicht deckt Populated-, Empty-, Loading-Skeleton-, Read-Only-Archiv- und Error-Boundary-Zustände ab (Routine-Feedback ≤ 200ms).

---

## 3. Zentrale Produktentscheidungen & Abwägungen

### Entscheidung 1: Zwingende 1:n-Club-Hierarchie mit dynamischer Rollenkaskade (`#23`, `#26`)
- **Gewählter Ansatz:** Jedes Team gehört zwingend zu einem Club; Club- und Team-Mitgliedschaften liegen in zwei getrennten Tabellen. Der Core-RBAC-Resolver gewährt jedem `CLUB_ADMIN` automatisch und unveränderlich `TEAM_ADMIN`-Rechte in allen (auch neu erstellten) Teams seines Clubs.
- **Warum:** Verhindert verwaiste Teams, doppelte Mitglieder-Datensätze bei Mehrfachrollen und vergessene Admin-Zuweisungen bei neuen Teams.
- **Verworfene Alternative:** Optionale Clubs oder manuelle Kopie von Admin-Einträgen pro Team – führt zu inkonsistenten Rechten und gebrochener Vereins-Speicherabrechnung.

### Entscheidung 2: Club-Speicherpool + Multi-Node-Routing im Core, physischer Betrieb im Plugin (`#21`, `#22`, `#24`)
- **Gewählter Ansatz:** Der Core verwaltet pro Club das Quota-Ledger (`quota_bytes`, `used_bytes`, `soft_limit_percent`) sowie eine `storage_node_id`, erzwingt den 100 %-Upload-Stopp zentral im Gateway und blendet ab 90 % den globalen Warnbanner ein. Die konkrete S3-/R2-/Garage-Anbindung, Multi-Node-Konfiguration, Datenmigration zwischen Nodes und Cleanup-Queue liegen komplett in `SidelineOS-storage-s3`.
- **Warum:** Kein Fach-Plugin muss wissen, auf welchem physischen Speicherort seine Dateien liegen; Quotas können zuverlässig nicht umgangen werden; künftige Billing-Plugins (`#21`) steuern einfach die Core-Capability `core:storage-quota-manage`.

### Entscheidung 3: 5 eigenständige System-Plugin-Repos mit verbindlichen Blueprints
1. **`SidelineOS-org-admin`** — Vereins- & Teamverwaltung unter `/admin/club/*` (`#23`), Team-Archivierung/Reaktivierung (`#25`), zentrale Vereins-Mitgliederliste, teambezogene Einladungslinks & Warteliste (`#26`), Custom-Profilfelder, Sportart-Gruppenvorlagen sowie Vereins-Speicherüberblick (`#24`).
2. **`SidelineOS-storage-s3`** — Multi-Node S3/R2/MinIO/Garage-Treiber (`storage:provider`, `#22`), Presigned Single- & Multipart-Uploads, Datenmigration zwischen Storage-Nodes, Sysadmin-Quota-Pflege (`#21`), Verbrauchsabgleich und Cleanup-Queue mit Schonfrist (im eigenen Schema `plugin_storage_s3`).
3. **`SidelineOS-channel-smtp`** — E-Mail-Versand als reguläres `notifications:channel`-Plugin (inkl. Einladungs- & Systemmails über Core-Events), verschlüsselte Zugangsdaten und Verbindungstest unter `/admin/system/smtp`.
4. **`SidelineOS-plugin-store`** — Plugin-Katalog, GitHub-Release-Abruf, Update-Checker, Rollback und Club-/Team-Freigabematrix über `core:plugins-manage` unter `/admin/system/store`.
5. **`SidelineOS-dev-git-tools`** — Isoliertes Dev-Plugin für `git clone/pull`, `npm ci` + Build & Hot-Reload (nur aktivierbar bei serverseitigem Flag `ALLOW_DEV_PLUGINS=true`).

### Entscheidung 4: Schlanker Notfall-Admin + ENV-Bootstrap
- **Gewählter Ansatz:** Der Core behält einen minimalen, nicht deaktivierbaren Recovery-Kern unter `/admin/system/recovery` (Archiv-Upload/URL-Install, Aktivieren/Deaktivieren/Entfernen) sowie automatische Erstinstallation per `CORE_BOOTSTRAP_PLUGINS`.
- **Warum:** Verhindert das Aussperren ohne Plugins, hält den Core aber frei von Store-, Update- und Git-Build-Ballast.

---

## 4. Technische Architektur, Datenstrategie & Sicherheitsmodell *(Technische Referenz)*

### Systemarchitektur (Micro-Kernel & 5 System-Plugin-Repos)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                         BROWSER SHELL (SidelineOS-core)                      │
│  ┌──────────────────────┐  ┌──────────────────────────────────────────────┐  │
│  │ Feste TopBar (Eb. 0) │  │ Einheitliche Kontext-Sidebar (Eb. 2)         │  │
│  │ Logo · Breadcrumb ·  │  │ • Plugin-Views (sidebarGroups)               │  │
│  │ Club/Team · Glocke   │  │ • /settings/account/* (ui:account-panel)     │  │
│  ├──────────────────────┤  │ • /admin/club/*       (ui:club-panel)        │  │
│  │ Core-Warnbanner      │  │ • /admin/system/*     (ui:system-panel)      │  │
│  │ (90%/100% · Archiv)  │  └──────────────────────┬───────────────────────┘  │
│  └──────────┬───────────┘                         │                          │
│             └──────────────────┬──────────────────┘                          │
│                                ▼                                             │
│   ┌──────────────────────────────────────────────────────────────────────┐   │
│   │ Core-Router · Theme-Token-Engine · i18n · ESM Plugin Runtime Loader  │   │
│   │ Core-Notfall-Admin (/admin/system/recovery) · In-App-Posteingang     │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────┬──────────────────────────────────────┘
                                        │ HTTPS + HttpOnly Session Cookie
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND MICRO-KERNEL (Express)                        │
│  ┌──────────────┐  ┌─────────────────────┐  ┌─────────────────────────────┐  │
│  │ Auth/Session │  │ Minimaler Archive-  │  │ Plugin-Gateway & Host       │  │
│  │ & Crypto     │  │ Installer (TAR/SHA) │  │ • RBAC + Club-Rollenkaskade │  │
│  │ + Invite-Tx  │  │ + ENV-Bootstrap     │  │ • Archiv-Read-Only-Gate     │  │
│  └──────┬───────┘  └──────────┬──────────┘  │ • Storage-Broker (Quota +   │  │
│         │                     │             │   virtuelles nodeId-Routing)│  │
│         │                     │             │ • Notification-Dispatcher   │  │
│         │                     │             │ • Core-Admin-Scopes (v2.0)  │  │
│         ▼                     ▼             └──────────────┬──────────────┘  │
│  ┌───────────────────────────────────────┐                 │                 │
│  │ PostgreSQL / PGlite Isolation Engine  │                 │                 │
│  │  • Schema `core` (minimal)            │                 │                 │
│  │  • Schema `plugin_<slug>` (isoliert)  │                 │                 │
│  └───────────────────────────────────────┘                 │                 │
└────────────────────────────────────────────────────────────┼─────────────────┘
                                                             │ SDK v2.0 Contracts
     ┌──────────────┬──────────────┬──────────────┬──────────┴───┬─────────────┐
     ▼              ▼              ▼              ▼              ▼             ▼
┌──────────┐  ┌───────────┐  ┌────────────┐  ┌───────────┐  ┌──────────┐  ┌─────────┐
│org-admin │  │storage-s3 │  │channel-smtp│  │plugin-    │  │dev-git-  │  │Fach-    │
│(Repo 1)  │  │(Repo 2)   │  │(Repo 3)    │  │store (4)  │  │tools (5) │  │Plugins  │
│#23 #25   │  │#21 #22 #24│  │SMTP Mail   │  │Katalog &  │  │Git Clone │  │(Video,  │
│#26 (#24) │  │Nodes/Clean│  │Channel     │  │Updates    │  │& Build   │  │Attend.) │
└──────────┘  └───────────┘  └────────────┘  └───────────┘  └──────────┘  └─────────┘
```

### Datenmodell v0.2.0 (Core-Schema `core`)
- **`core.users`:** `uuid`, `username`, `display_name`, `email`, `password_hash`, `is_sysadmin`, `preferred_locale`, `preferred_theme`, `metadata JSONB` (keine sportartspezifischen Festspalten mehr).
- **`core.sessions`:** Serverseitige Sessions mit Ablaufzeit und Rotation.
- **`core.clubs`:** `id`, `slug`, `name`, `storage_node_id` (Default `'default'`, `#22`), `storage_quota_bytes` (`NULL` = unbegrenzt, `#21`/`#24`), `storage_used_bytes`, `storage_soft_limit_percent` (Default `90`), `metadata JSONB`, `created_at`.
- **`core.teams`:** `id`, `club_id NOT NULL` (FK auf `core.clubs`, `#23`), `slug`, `name`, `status` (`'ACTIVE' | 'ARCHIVED'`, `#25`), `accent_color`, `metadata JSONB`.
- **`core.club_memberships`:** `id`, `user_uuid`, `club_id`, `role` (`'CLUB_ADMIN' | 'CLUB_MEMBER'`), `status` (`'ACTIVE' | 'PENDING' | 'SUSPENDED'`), `joined_at` (`#23`, `#26`).
- **`core.team_memberships`:** `id`, `user_uuid`, `team_id`, `role` (`'TEAM_ADMIN' | 'STAFF' | 'MEMBER'`), `groups JSONB` (beliebige Gruppen-/Tag-Slugs), `status` (`'ACTIVE' | 'PENDING' | 'SUSPENDED'`), `joined_at` (`#26`).
- **`core.invitations`:** `id`, `token_hash`, `club_id NOT NULL`, `team_id` (optional für reine Club-Einladung, gesetzt bei Team-Link `#26`), `role`, `groups JSONB`, `target_email`, `requires_approval`, `expires_at`, `active`. Beim Einlösen legt der Core in einer DB-Transaktion automatisch sowohl die Club- als auch (falls gesetzt) die Team-Mitgliedschaft an.
- **`core.installed_plugins` & `core.scope_modules`:** Globaler Plugin-Status, explizit freigegebene privilegierte Capabilities sowie Modul-Freischaltung je Club oder Team (`scope_type: 'club' | 'team'`).
- **`core.system_settings` & `core.notifications`:** Verschlüsselter Konfigurationsspeicher und In-App-Posteingang.
- **Entfernt aus `core`:** `core.s3_cleanup_queue` (wandert in `plugin_storage_s3`), `core.team_seasons`, Demo-Daten (wandern in ein separates Dev-Seed-Skript) sowie die Abhängigkeiten `@google/genai`, `motion`, `@aws-sdk/*` und `nodemailer`.

### Neue SDK-v2.0-Verträge & Interaktive Zustandsflüsse
1. **Navigations-Contract (`manifest.navigation`):** `surface`, `scopes`, `sidebarGroups` (echte Routen statt Scroll-Spy), `settingsPanels` (`account`, `club`, `system`).
2. **Storage-Provider-Contract (`storage:provider`):** Abstrakte Schnittstelle mit `nodeId`-Routing (`presignUpload`, `presignDownload`, `multipart*`, `deleteObject`, `getUsageDelta`, `healthCheck`). Der Core prüft vor jedem Schreib-/Upload-Aufruf: (a) ist das Ziel-Team `'ACTIVE'` (`#25`), (b) überschreitet der Club `storage_quota_bytes` (`#24` → `413 STORAGE_QUOTA_EXCEEDED`), (c) bleibt der Pfad strikt im Mandanten-/Plugin-Präfix. Downloads bleiben auch bei 100 % Quota und im Archiv-Lesemodus jederzeit erreichbar.
3. **Privilegierte Core-Scopes:** `core:org-manage` (Clubs, Teams, Archivierung, Mitgliedschaften, Einladungen im jeweiligen Berechtigungs-Scope), `core:users-manage` (Sysadmin), `core:plugins-manage` (Sysadmin), `core:storage-quota-manage` (Sysadmin + künftige Billing-Plugins, `#21`), `core:storage-nodes-manage` (Sysadmin + `storage-s3`, `#22`), `dev:git-install` (nur bei `ALLOW_DEV_PLUGINS=true`).
4. **Interaktive Komponenten-Zuordnung (Core-Shell):**
   - **Club/Team-Wechsler (TopBar):** Zeigt nur aktive Teams (plus optionalen „Archiv einblenden“-Schalter für berechtigte Admins/Coaches); beim Wechsel prüft der Host die Modul-Freischaltung und aktualisiert URL & Sidebar konsistent.
   - **Globaler System-Banner:** Reagiert automatisch auf die Club-Speicherquote (Gelb ab 90 % mit exakter Prozent-/GB-Anzeige in `tabular-nums`, Rot ab 100 % mit Hinweis auf Upload-Stopp) sowie auf den Archiv-Lesemodus eines Teams.
   - **Kontext-Sidebar & Notfall-Admin:** Bidirektionale URL-Synchronisation (`pushState`/`popstate`), Tastatur-Navigation, mobiler Drawer, Archiv-Upload/URL-Installation mit Validierungs- und Fehlerzuständen.

### Sicherheitsgrenzen & Schutzmechanismen
- **Serverseitige Mandanten-, Rollenkaskaden- und Archivprüfung:** Jede Route und jeder privilegierte Plugin-Scope validiert serverseitig Session, `CLUB_ADMIN`-Kaskade, Team-Archivstatus (Schreibsperre) und vom Sysadmin freigegebene Manifest-Capabilities; kein Plugin erhält direkten SQL-Zugriff auf das Schema `core`.
- **Vertrauliche Secrets, parametrisierte Abfragen & Pfad-Isolation:** Provider-Zugangsdaten bleiben verschlüsselt auf dem Server; alle Datenbankabfragen sind parametrisiert; Archiv-Entpacker und Storage-Präfixe blockieren Path-Traversal strikt.
- **Abgesicherte System-Endpunkte:** `dev-git-tools` ist in Produktion standardmäßig gesperrt (`ALLOW_DEV_PLUGINS=false`); URL-Downloads prüfen `https:` und blockieren interne/lokale Adressen; Session-Cookies nutzen `HttpOnly` plus Origin-Prüfung bei schreibenden Anfragen.

---

## 5. Umsetzungs-Fahrplan (Nach deinem Go)

1. **Paket 1 — Core-Aufräumaktion & Datenmodell v2.0:** Tote/Infra-Abhängigkeiten entfernen, Demo-Daten in ein Dev-Seed-Skript auslagern, neue Core-Migrationen für `clubs` (inkl. Quota & `storage_node_id`), `teams` (inkl. `ACTIVE/ARCHIVED`), `club_memberships`, `team_memberships` und atomare Team-Einladungen bauen.
2. **Paket 2 — SDK v2.0, RBAC-Kaskade, Storage-Broker & Privilegierte Scopes:** SDK v2.0 finalisieren, Rollenkaskade (`#23`), Archiv-Read-Only-Gate (`#25`), Club-Quota-Enforcement + `core:storage-quota-manage` (`#21`/`#24`), Multi-Node-Routing (`#22`), SMTP-Entkopplung und minimalen Archiv-Installer mit `CORE_BOOTSTRAP_PLUGINS` umsetzen.
3. **Paket 3 — Schlanke Core-Shell, 4-Ebenen-Navigation & Admin-Trennung:** Neue `App`-Shell mit fester TopBar, Club/Team-Wechsler, globalem Quota-/Archiv-Warnbanner, einheitlicher Kontext-Sidebar, strikt getrennten Settings-Hosts (`/settings/account/*`, `/admin/club/*`, `/admin/system/*`) und Notfall-Admin (`/admin/system/recovery`).
4. **Paket 4 — 5 Dedizierte Plugin-Repo-Spezifikationen + SDK-v2.0-Migrationsguide:** Je ein vollständiges Blueprint-Dokument für `SidelineOS-org-admin`, `SidelineOS-storage-s3`, `SidelineOS-channel-smtp`, `SidelineOS-plugin-store` und `SidelineOS-dev-git-tools` (mit explizitem Mapping auf `#21`–`#26`) sowie Migrationsleitfaden für bestehende Fach-Plugins und vollständige Testabdeckung.

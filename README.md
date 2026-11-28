<p align="left">
  <img src="docs/assets/sidelineos-logo.svg" alt="SidelineOS Logo" width="280" />
</p>

# SidelineOS-Core (`v0.2.0`)

**SidelineOS-Core** ist ein schlanker, sportart- und speicherort-agnostischer **Micro-Kernel** für selbstgehostete Vereins- und Team-Plattformen. Mit **v0.2.0** wurden S3, SMTP, Organisations-Verwaltung, Plugin-Store und Dev-Git-Tools konsequent in eigenständige System-Plugins ausgelagert (`@sidelineos/plugin-sdk` v2.0).

---

## Was im Core liegt (Micro-Kernel)

* **Auth, Sessions & Ersteinrichtung:** `scrypt`-Passwort-Hashing, `HttpOnly`-Sessions + Bearer-Support, einmalige Ersteinrichtung per ENV (`INITIAL_SYSADMIN_*`) oder Erst-Login sowie atomares Einladungs-Onboarding (`/invite/<token>`, `#26`).
* **Mandanten- & Rollenmodell (`Club -> Team -> Gruppen`):** Verbindliche 1:n-Hierarchie (`#23`), unveränderliche Kaskade (`CLUB_ADMIN -> TEAM_ADMIN`), sportartneutrale Gruppen/Tags, Team-Archivierung im Read-Only-Modus (`#25`) sowie gemeinsamer Vereins-Speicherpool (`#21`, `#24`).
* **Plugin-Runtime & Gateway (`/api/v2/plugins/*`):** Isolierte `plugin_<slug>`-DB-Schemas, dynamischer ESM-/Backend-Loader, explizite Freigabe privilegierter Capabilities, minimaler `.tar.gz`-Archiv-Installer und `CORE_BOOTSTRAP_PLUGINS`.
* **Abstrakter Storage-Broker & Notification-Dispatcher:** Speicherort-agnostisches Multi-Node-Routing über `nodeId` (`#22`), 90 %-Warnung / 100 %-Upload-Stopp bei offenen Downloads (`#24`), In-App-Posteingang und einheitlicher Kanal-Dispatcher für `notifications:channel`-Plugins.
* **Verbindliche 4-Ebenen-Navigation:** Feste TopBar (Ebene 0), Start-Hub (Ebene 1), einheitliche linke Kontext-Sidebar mit echten URL-Routen (Ebene 2) und getrennte Administrationsbereiche (`/settings/account/*`, `/admin/club/*`, `/admin/system/*`, `#23`).

---

## Offizielle System-Plugins (separate Repositories)

| System-Plugin | Zweck | Blueprint |
| :--- | :--- | :--- |
| **`SidelineOS-org-admin`** | Vereine, Teams, Archivierung (`#25`), zentrale Mitgliederliste & Einladungen (`#23`, `#26`) | [Blueprint](docs/plugins/sidelineos-org-admin.md) |
| **`SidelineOS-storage-s3`** | Multi-Node S3 / R2 / MinIO / Garage (`#22`), Club-Quotas (`#21`) & Cleanup-Queue (`#24`) | [Blueprint](docs/plugins/sidelineos-storage-s3.md) |
| **`SidelineOS-channel-smtp`** | E-Mail-Versand als reguläres `notifications:channel`-Plugin (`nodemailer`) | [Blueprint](docs/plugins/sidelineos-channel-smtp.md) |
| **`SidelineOS-plugin-store`** | Katalog, GitHub-Releases, Update-Checker, Rollback & Scope-Freigabematrix | [Blueprint](docs/plugins/sidelineos-plugin-store.md) |
| **`SidelineOS-dev-git-tools`** | Isolierte Git-Clone-/Pull-/Build-Toolchain (nur mit `ALLOW_DEV_PLUGINS=true`) | [Blueprint](docs/plugins/sidelineos-dev-git-tools.md) |

Siehe [System-Plugin-Übersicht](docs/plugins/README.md).

---

## Quickstart (Lokal)

```bash
# 1. Abhängigkeiten installieren
npm install

# 2. Umgebungsvariablen anlegen
cp .env.example .env

# 3. Optional: Lokale Dev-Testdaten (Club, Teams, User) anlegen
npm run seed:dev

# 4. Entwicklungsserver starten (Port 3000)
npm run dev
```

### Qualitätssicherung & Build

```bash
npm run lint       # TypeScript-Prüfung
npm test           # Unit- & API-Tests (node:test)
npm run build      # Frontend-Produktions-Build
npm run build:sdk  # @sidelineos/plugin-sdk v2.0 bauen
```

---

## Dokumentation

* [Verbindliche Navigations- & Menü-Richtlinien (v0.2.0)](docs/navigation-guidelines.md)
* [SDK-Migrationsleitfaden (v1.0 -> v2.0)](docs/sdk-v2-migration.md)
* [Blueprints der 5 System-Plugin-Repositories](docs/plugins/README.md)
* [Proxmox-LXC Deployment-Leitfaden](docs/deployment-proxmox-lxc.md)

---

## Lizenz

Lizenziert unter der **GNU Affero General Public License v3.0 (AGPLv3)** – siehe [LICENSE](LICENSE).

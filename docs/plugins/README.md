# Offizielle SidelineOS System-Plugins (v0.2.0)

Mit v0.2.0 enthält `SidelineOS-core` ausschließlich den schlanken Micro-Kernel (Auth/Sessions, `Club -> Team -> Gruppen`-Modell, Plugin-Runtime & Gateway, virtueller Storage-Broker, Notification-Dispatcher, minimaler `.tar.gz`-Archiv-Installer und Notfall-Admin).

Alle Infrastruktur- und Verwaltungsfunktionen liegen in **5 eigenständigen Plugin-Repositories**:

| Repository | Plugin-ID | Privilegierte Capabilities | Ziel-UI | Abgedeckte Issues |
|---|---|---|---|---|
| [`SidelineOS-org-admin`](./sidelineos-org-admin.md) | `org-admin` | `core:org-manage`, `core:users-manage` | `/admin/club/*` | `#23`, `#24`, `#25`, `#26` |
| [`SidelineOS-storage-s3`](./sidelineos-storage-s3.md) | `storage-s3` | `storage:provider`, `core:storage-quota-manage`, `core:storage-nodes-manage` | `/admin/system/storage` | `#21`, `#22`, `#24` |
| [`SidelineOS-channel-smtp`](./sidelineos-channel-smtp.md) | `channel-smtp` | *(keine — nur `notifications:channel`)* | `/admin/system/smtp` | — |
| [`SidelineOS-plugin-store`](./sidelineos-plugin-store.md) | `plugin-store` | `core:plugins-manage` | `/admin/system/store` | — |
| [`SidelineOS-dev-git-tools`](./sidelineos-dev-git-tools.md) | `dev-git-tools` | `dev:git-install`, `core:plugins-manage` | `/admin/system/dev-tools` | — |

---

## Automatisches Bootstrapping per Umgebungsvariable

Eine frisch installierte Core-Instanz kann die gewünschten System-Plugins direkt beim ersten Start automatisch installieren und freigeben:

```env
CORE_BOOTSTRAP_PLUGINS=https://github.com/moritztw/SidelineOS-org-admin/releases/latest/download/org-admin.tar.gz,https://github.com/moritztw/SidelineOS-storage-s3/releases/latest/download/storage-s3.tar.gz,https://github.com/moritztw/SidelineOS-channel-smtp/releases/latest/download/channel-smtp.tar.gz,https://github.com/moritztw/SidelineOS-plugin-store/releases/latest/download/plugin-store.tar.gz
```

Alternativ lassen sich beliebige `.tar.gz`-Archive jederzeit ohne vorinstallierten Store über den eingebauten **Notfall-Admin** (`/admin/system/recovery`) hochladen oder per `https://`-URL installieren.

---

## Zuordnung der offenen GitHub-Issues (#21–#26)

- **`#21` (Storage-Limit pro Club, perspektivisch über Payment-Plugin):** Core hält `storage_quota_bytes` + Capability `core:storage-quota-manage`; Pflege-UI in `SidelineOS-storage-s3`; spätere Billing-Plugins nutzen dieselbe Capability.
- **`#22` (Multi-Storage / S3 Garage / Migration):** Core routet über virtuelles `nodeId`; konkrete S3/Garage/R2-Node-Konfiguration und Objekt-Migration liegen in `SidelineOS-storage-s3`.
- **`#23` (Club 1:n, `CLUB_ADMIN -> TEAM_ADMIN`-Kaskade, strikte Admin-Trennung):** Datenmodell & Kaskade im Core; Vereins- und Team-Verwaltungs-UI in `SidelineOS-org-admin`.
- **`#24` (Shared Club Pool, 90 %-Warnung, 100 %-Upload-Stopp, Downloads offen):** Quota-Durchsetzung & Banner im Core; Vereins-Auslastungsansicht in `SidelineOS-org-admin`; Verbrauchsabgleich & Cleanup-Queue in `SidelineOS-storage-s3`.
- **`#25` (Team-Archivierung Read-Only):** Status `ACTIVE | ARCHIVED` & Gateway-Schreibsperre im Core; Archivierungs-/Reaktivierungs-Aktion in `SidelineOS-org-admin`.
- **`#26` (Zentrale Vereins-Mitgliederliste & atomare Team-Einladungen):** Getrennte Tabellen `club_memberships` / `team_memberships` & atomarer `/invite/:token/accept`-Endpoint im Core; Mitglieder- & Einladungs-UI in `SidelineOS-org-admin`.

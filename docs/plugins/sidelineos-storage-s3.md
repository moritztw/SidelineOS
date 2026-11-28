# System-Plugin Blueprint: `SidelineOS-storage-s3`

- **Repository:** `SidelineOS-storage-s3`
- **Plugin-ID:** `storage-s3`
- **Ziel-SDK:** `@sidelineos/plugin-sdk` `2.0` (`minCoreVersion: '0.2.0'`)
- **Abgedeckte Issues:** `#21`, `#22`, `#24`

---

## 1. Verantwortung & Abgrenzung

`SidelineOS-storage-s3` kapselt die gesamte S3-kompatible Speicherlogik (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) vollständig außerhalb des Cores. Es unterstützt **AWS S3, Cloudflare R2, MinIO und Garage** mit Multi-Node-Routing pro Verein (#22), Quota-Administration (#21), Verbrauchsabgleich und automatischer Cleanup-Queue (#24).

---

## 2. Manifest (`plugin.json` / `src/manifest.ts`)

```ts
export const manifest: PluginManifest = {
  id: 'storage-s3',
  name: 'S3 & Multi-Node Storage',
  kurzbeschreibung: 'Bindet S3-, R2-, MinIO- und Garage-Nodes an, verwaltet Club-Quotas und Cleanup-Jobs.',
  version: '1.0.0',
  sdkVersion: '2.0',
  minCoreVersion: '0.2.0',
  icon: 'hard-drive',
  permissions: [
    'db:plugin-schema',
    'ui:system-panel',
    'storage:provider',
    'core:storage-quota-manage',
    'core:storage-nodes-manage',
  ],
  navigation: {
    surface: 'system',
    scopes: ['global'],
    settingsPanels: [
      {
        id: 'storage-nodes',
        target: 'system',
        group: 'Infrastruktur',
        label: 'Storage-Nodes (S3)',
        routeSegment: 'storage-nodes',
      },
      {
        id: 'storage-quotas',
        target: 'system',
        group: 'Infrastruktur',
        label: 'Speicher-Quotas',
        routeSegment: 'storage-quotas',
      },
    ],
  },
};
```

---

## 3. Eigenes Datenbankschema (`plugin_storage_s3`)

```sql
CREATE TABLE IF NOT EXISTS storage_nodes (
  node_id TEXT PRIMARY KEY,              -- z. B. 'default', 'garage-eu-1', 'r2-archive'
  label TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'auto',
  bucket TEXT NOT NULL,
  access_key_enc TEXT NOT NULL,          -- AES-256-GCM verschlüsselt via SESSION_SECRET/KMS
  secret_key_enc TEXT NOT NULL,
  force_path_style BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE | DRAINING | READONLY
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cleanup_queue (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL,
  object_key TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Implementierung des `StorageProviderAdapter` (#22)

Der Core ruft für alle Fach-Plugins die Methoden von `storageProvider` mit der zuvor aus `core.clubs.storage_node_id` aufgelösten `nodeId` auf:

- `presignUpload({ nodeId, key, contentType, expiresInSeconds })`
- `presignDownload({ nodeId, key, expiresInSeconds })`
- `initiateMultipartUpload / presignMultipartPart / completeMultipartUpload / abortMultipartUpload`
- `deleteObject({ nodeId, key })` -> bei transientem S3-Fehler automatischer Eintrag in `plugin_storage_s3.cleanup_queue`
- `healthCheck(nodeId?)` -> `HeadBucketCommand` gegen den jeweiligen Node

Ein interner `Map<string, S3Client>`-Cache hält pro `nodeId` den konfigurierten `S3Client` bereit und invalidiert ihn sofort bei Konfigurationsänderungen.

---

## 5. Multi-Node-Migration & Verbrauchsabgleich (#21, #22, #24)

1. **Club-Quota-Verwaltung (#21):**
   - UI unter `/admin/system/storage-quotas` setzt `quotaBytes` (in GiB) und `softLimitPercent` (Standard `90 %`) über `ctx.coreAdmin.storageQuota.setClubQuota(...)`.
   - Zukünftige Payment-/Billing-Plugins fordern dieselbe Capability `core:storage-quota-manage` an und überschreiben Quotas automatisiert nach gebuchtem Tarif.
2. **Exakter Verbrauchsabgleich (#24):**
   - Periodischer oder manuell auslösbarer Job listet `ListObjectsV2` unter `clubs/<clubId>/` auf dem aktiven Node, summiert die exakten Bytes und ruft `ctx.coreAdmin.storageQuota.reconcileClubUsage(clubId, exactBytes)` auf.
3. **Node-Migration (#22):**
   - Kopiert alle Objekte unter `clubs/<clubId>/` von `sourceNodeId` nach `targetNodeId` (Stream-Copy + ETag/Größen-Verifikation), schaltet danach atomar über `ctx.coreAdmin.storageNodes.assignClubNode(clubId, targetNodeId)` um und stellt die alten Objekte verzögert in die `cleanup_queue`.

---

## 6. Sicherheit

- Zugangsdaten (`access_key_enc`, `secret_key_enc`) werden niemals im Klartext in der DB gespeichert und niemals an das Frontend zurückgegeben (nur maskierter Präfix).
- Nur ein aktives Plugin mit freigegebener Capability `storage:provider` kann sich am Core-`StorageBroker` registrieren.

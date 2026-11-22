# Deployment-Leitfaden: Proxmox LXC + Cloudflare R2 (+ Multi-Arch / Raspberry Pi)

Dieser Leitfaden beschreibt das produktionsnahe **Alpha- & Beta-Deployment** von **SidelineOS-Core** in einem kombinierten **Debian-12-LXC** unter **Proxmox VE** (PostgreSQL + Node.js 22 + systemd) mit **Cloudflare R2** als S3-Object-Storage – vollständig ohne Docker auf dem Host.

---

## 1. Proxmox LXC anlegen

Empfohlene Ressourcen für Alpha/Beta (1 kombinierter LXC auf einem deiner Proxmox-Nodes):

| Parameter | Empfehlung | Hinweis |
| :--- | :--- | :--- |
| **Template** | `debian-12-standard` (Bookworm) | `amd64` auf Proxmox; Skripte laufen genauso auf `arm64` |
| **Typ** | Unprivilegierter Container | `nesting=1` aktivieren (PVE-Standard; nötig für `systemd`-Härtung) |
| **CPU / RAM** | `2 vCPU` · `2048 MB RAM` · `512 MB Swap` | Ausreichend für PostgreSQL 16 + Node 22 + `vite build` |
| **Root-Disk** | `16 GB` | Videos liegen in Cloudflare R2, nicht im LXC |
| **Netzwerk** | DHCP oder statische LAN-IP (`Port 3000`) | Hinter deinem Reverse-Proxy / Cloudflare Tunnel |

> **Hinweis zu `nesting=1`:** Falls in einem sehr strikten LXC ohne Nesting der `systemd`-Start mit `226/NAMESPACE` fehlschlägt, entweder in Proxmox **Optionen → Features → Nesting** aktivieren oder in `/etc/systemd/system/sidelineos-core.service` die Direktiven `PrivateTmp=true`, `ProtectSystem=strict` und `ProtectHome=true` auskommentieren.

---

## 2. SidelineOS-Core im LXC installieren

Im frisch gestarteten Debian-LXC als `root`:

```bash
apt-get update && apt-get install -y curl git ca-certificates
git clone https://github.com/sidelineos/sidelineos-core.git /opt/sidelineos-core
cd /opt/sidelineos-core
bash deploy/lxc/install-core.sh
```

Das Skript richtet idempotent ein:
1. Systempakete + lokales **PostgreSQL** (`127.0.0.1:5432`, Rolle & DB `sidelineos` mit Zufallspasswort)
2. **Node.js 22.x** (architekturunabhängig für `amd64` & `arm64`)
3. Unprivilegierten Systembenutzer `sidelineos`
4. Sichere `.env` (`chmod 600`, zufälliges `SESSION_SECRET`, `NODE_ENV="production"`, `DEV_ALLOW_GIT_INSTALL="false"`)
5. Production-Build (`npm ci && npm run build && npm run build:sdk`)
6. `systemd`-Service `sidelineos-core` inkl. Healthcheck auf `http://127.0.0.1:3000/api/v1/health`

---

## 3. `.env` für Alpha-Test & Cloudflare R2 anpassen

Bearbeite `/opt/sidelineos-core/.env`:

```env
APP_URL="https://sideline.deine-domain.tld"
APP_BRAND_NAME="SidelineOS"
VITE_APP_BRAND_NAME="SidelineOS"
DEFAULT_LOCALE="de"

INITIAL_SYSADMIN_EMAIL="deine@email.tld"
INITIAL_SYSADMIN_USERNAME="sysadmin"
INITIAL_SYSADMIN_PASSWORD="SEHR_STARKES_PASSWORT_MIND_12_ZEICHEN"
```

### Cloudflare R2 anbinden

1. Lege im Cloudflare-Dashboard unter **R2 Object Storage** einen Bucket (z. B. `sidelineos-alpha`) an.
2. Erstelle einen **R2 API Token** mit Berechtigung *Object Read & Write* für diesen Bucket.
3. Trage die Werte entweder in `.env` **oder** nach dem Login unter **Einstellungen → Sysadmin → S3 Object Storage** ein:

```env
S3_ENDPOINT="https://<DEINE_CLOUDFLARE_ACCOUNT_ID>.r2.cloudflarestorage.com"
S3_REGION="auto"
S3_BUCKET="sidelineos-alpha"
S3_ACCESS_KEY="<R2_ACCESS_KEY_ID>"
S3_SECRET_KEY="<R2_SECRET_ACCESS_KEY>"
S3_FORCE_PATH_STYLE="true"
```

4. **Wichtig – CORS-Regel auf dem R2-Bucket setzen** (für direkte Browser-Uploads & -Streams über Presigned-URLs):

```json
[
  {
    "AllowedOrigins": [
      "https://sideline.deine-domain.tld"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "HEAD"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

> **Hinweis zu Brand-Änderungen (`VITE_APP_BRAND_NAME`):** `VITE_*`-Variablen werden beim `vite build` ins Frontend kompiliert. Nach Änderungen an `.env` einmal neu bauen und neu starten:
> ```bash
> cd /opt/sidelineos-core
> sudo -u sidelineos npm run build
> systemctl restart sidelineos-core
> ```

---

## 4. Reverse-Proxy & HTTPS

SidelineOS-Core lauscht im LXC auf `0.0.0.0:3000` und setzt `trust proxy = 1`. Dein bestehender Reverse-Proxy (z. B. Nginx Proxy Manager, Caddy, Traefik oder **Cloudflare Tunnel**) leitet HTTPS-Anfragen auf `http://<LXC-IP>:3000` weiter und setzt:

- `Host`
- `X-Forwarded-For`
- `X-Forwarded-Proto: https` (erforderlich, damit `HttpOnly; Secure`-Session-Cookies gesetzt werden)

---

## 5. Updates, Snapshots & Backup / Restore

### Vor jedem Update
1. In Proxmox einen **LXC-Snapshot** erstellen (bei 1-LXC-Setup inkl. DB in 5 Sekunden erledigt).
2. Update ausführen (erstellt zusätzlich ein `pg_dump` nach `/var/backups/sidelineos/`):

```bash
cd /opt/sidelineos-core
bash deploy/lxc/update-core.sh
# oder für ein bestimmtes Release-Tag:
bash deploy/lxc/update-core.sh v0.1.0-alpha.1
```

### Manuelles DB-Backup & Restore

```bash
# Backup
su - postgres -c "pg_dump sidelineos" | gzip -c > sidelineos_backup.sql.gz

# Restore (Dienst vorher stoppen)
systemctl stop sidelineos-core
gunzip -c sidelineos_backup.sql.gz | su - postgres -c "psql sidelineos"
systemctl start sidelineos-core
```

> **Späteres Wachstum (2-Node-Proxmox / externer Postgres):** Da ausschließlich `DATABASE_URL` in `.env` entscheidet, lässt sich PostgreSQL jederzeit auf einen separaten DB-LXC oder anderen Host auslagern, ohne am Core etwas zu ändern.

---

## 6. Multi-Arch-Ausblick (Raspberry Pi / Docker)

* **Raspberry Pi (`arm64` Debian / Raspberry Pi OS):** `deploy/lxc/install-core.sh` und `deploy/lxc/update-core.sh` erkennen `arm64` automatisch und installieren identisch ohne Docker.
* **Späteres Multi-Arch-Docker-Image (`linux/amd64` + `linux/arm64`):** Für spätere Community-/Camp-Deployments liegt ein passendes Template unter [`deploy/docker/Dockerfile`](../deploy/docker/Dockerfile):

```bash
docker buildx build --platform linux/amd64,linux/arm64 \
  -f deploy/docker/Dockerfile -t sidelineos-core:v0.1.0-alpha.1 .
```

---

## 7. Alpha-Selbsttest-Checkliste (`v0.1.0-alpha.1`)

Nach dem ersten Start im Proxmox-LXC der Reihe nach prüfen:

1. **Health & TLS:** `https://sideline.deine-domain.tld/api/v1/health` liefert `{"status":"ok","db":"postgres"}`.
2. **Sysadmin-Login:** Anmeldung mit `INITIAL_SYSADMIN_*` aus `.env`; Reload behält Session (`Secure`-Cookie hinter Proxy aktiv).
3. **Cloudflare R2:** Unter *Einstellungen → Sysadmin → S3 Object Storage* Verbindung testen (`HeadBucket` erfolgreich).
4. **SMTP (optional):** Unter *Sysadmin → E-Mail / SMTP* Testmail versenden (oder ohne SMTP Offline-Einladungslink prüfen).
5. **Sprache & Rebranding:** Unter *Persönliche Einstellungen* Sprache zwischen `Deutsch` und `English` umschalten – Core **und** Videoanalyse-Tabs/-Film-Room wechseln sofort mit.
6. **Team & Einladung:** Neues Team + Saison anlegen, Einladungslink generieren, in Inkognito-Fenster als Spieler registrieren und freischalten.
7. **Videoanalyse & `/share/`:** Companion-Demo oder Clip laden, Play taggen (`YD LN` ↔ `GN/LS`), Frame-Zeichnung setzen, Auto-Stop testen, `/share/`-Link generieren und im Inkognito-Browser öffnen.

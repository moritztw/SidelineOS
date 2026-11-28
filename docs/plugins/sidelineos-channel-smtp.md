# System-Plugin Blueprint: `SidelineOS-channel-smtp`

- **Repository:** `SidelineOS-channel-smtp`
- **Plugin-ID:** `channel-smtp`
- **Ziel-SDK:** `@sidelineos/plugin-sdk` `2.0` (`minCoreVersion: '0.2.0'`)

---

## 1. Verantwortung & Abgrenzung

`SidelineOS-channel-smtp` implementiert E-Mail-Zustellung über `nodemailer` als gewöhnliches **Notification-Channel-Plugin** (`notifications:channel`). Der Core enthält dadurch weder `nodemailer` noch SMTP-Spezialcode oder E-Mail-Templates.

- **Keine privilegierten Capabilities erforderlich:** Arbeitet rein mit `db:plugin-schema`, `notifications:channel` und `ui:system-panel`.
- **Austauschbar:** Parallel oder alternativ lassen sich weitere Channel-Plugins (z. B. Push, Matrix, Slack, WhatsApp/Signal-Bridge) nach identischem Vertrag betreiben.

---

## 2. Manifest (`plugin.json` / `src/manifest.ts`)

```ts
export const manifest: PluginManifest = {
  id: 'channel-smtp',
  name: 'E-Mail (SMTP)',
  kurzbeschreibung: 'Versendet SidelineOS-Benachrichtigungen und Einladungen per SMTP.',
  version: '1.0.0',
  sdkVersion: '2.0',
  minCoreVersion: '0.2.0',
  icon: 'mail',
  permissions: ['db:plugin-schema', 'notifications:channel', 'ui:system-panel'],
  navigation: {
    surface: 'system',
    scopes: ['global'],
    settingsPanels: [
      {
        id: 'smtp-config',
        target: 'system',
        group: 'Kommunikation',
        label: 'E-Mail (SMTP)',
        routeSegment: 'smtp',
      },
    ],
  },
};
```

---

## 3. Eigenes Datenbankschema (`plugin_channel_smtp`)

```sql
CREATE TABLE IF NOT EXISTS smtp_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  host TEXT NOT NULL DEFAULT '',
  port INTEGER NOT NULL DEFAULT 587,
  secure BOOLEAN NOT NULL DEFAULT FALSE,
  username TEXT NOT NULL DEFAULT '',
  password_enc TEXT NOT NULL DEFAULT '',
  from_name TEXT NOT NULL DEFAULT 'SidelineOS',
  from_email TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 4. Backend-Vertrag (`SidelineBackendPlugin`)

```ts
export default definiereBackendPlugin({
  manifest,
  migrations,
  notificationChannels: [
    {
      id: 'email',
      label: 'E-Mail (SMTP)',
      description: 'Zustellung an die im Benutzerkonto hinterlegte E-Mail-Adresse.',
    },
  ],
  async deliverNotification(event, { db }) {
    const cfg = await ladeSmtpKonfig(db);
    if (!cfg || !cfg.enabled || !cfg.host) {
      return { delivered: 0 };
    }
    const empfaenger = event.recipients.filter((r) => r.email.includes('@'));
    if (empfaenger.length === 0) return { delivered: 0 };

    const transporter = erstelleTransporter(cfg);
    let delivered = 0;
    for (const user of empfaenger) {
      await transporter.sendMail({
        from: `${cfg.fromName} <${cfg.fromEmail}>`,
        to: user.email,
        subject: event.title,
        text: bauePlaintextMail(event, user.preferredLocale),
      });
      delivered += 1;
    }
    return { delivered };
  },
  async handleRequest(req, ctx) {
    if (!ctx.user.istSysadmin) {
      return { status: 403, body: { fehler: 'Nur für Sysadmins.' } };
    }
    // GET /config, PUT /config, POST /test
  },
});
```

---

## 5. Admin-UI (`/admin/system/smtp`)

- Formular für Host, Port, TLS (`secure`), Benutzername, Passwort (Write-Only), Absendername, Absenderadresse und Aktiv-Schalter.
- Schaltfläche **„Test-E-Mail senden“** an die E-Mail-Adresse des angemeldeten Sysadmins (`POST /api/v2/plugins/channel-smtp/system/test`) mit klarer Rückmeldung (SMTP-Antwortcode / Fehlertext).

# SidelineOS-Core — System- & Architektur-Dokumentation

Dieses Dokument beschreibt die verbindliche Architektur von **SidelineOS-Core**: ein schlanker, mandantenfähiger **Core** (Auth, Einladungen, Teams/Saisons, S3-Broker, Plugin Store) kombiniert mit **unabhängigen GitHub-Plugins** über das `@sidelineos/plugin-sdk`.

---

## 1. Architekturprinzipien (KISS & Core/Plugin-Trennung)

1. **Schlanker Core statt fachlichem Monolith:** SidelineOS-Core stellt ausschließlich Startseite, Authentifizierung (`/login`), Einladungs-Registrierung (`/invite/<token>`), globale Benutzerkonten, dauerhafte Multi-Saison-Teams (Multi-Unit), zentrale Einstellungsseiten (`User`, `Team`, `Sysadmin`), S3-/SMTP-Infrastruktur sowie den **Plugin Store** bereit.
2. **Entkoppelte GitHub-Plugins (`@sidelineos/plugin-sdk`):** Fachmodule wie `video-analysis`, `playbook` oder `roster-attendance` werden als eigenständige Plugins gegen `src/sdk/plugin.ts` entwickelt. Sie können jeweils in eigenen GitHub-Repositories gepflegt, unabhängig versioniert und im Sysadmin-Plugin-Store installiert oder deinstalliert werden (Details siehe [Plugin SDK Spezifikation](plugin-sdk.md)).
3. **Zweistufige Freigabe & ENV-Bootstrap:** Die Ersteinrichtung erfolgt deployment-unabhängig ausschließlich über `.env` (`INITIAL_SYSADMIN_*`, `ENABLED_MODULES`, S3, SMTP) ohne Browser-Wizard. Installierte Plugins können vom Sysadmin zusätzlich pro Mandant/Team freigeschaltet oder ausgeblendet werden.
4. **Stateless Anwendungscontainer & S3 Object Storage:** Keine lokale Medienspeicherung im Container. Alle Dateien liegen in einem S3-kompatiblen Object Storage (MinIO, Hetzner Object Storage, Ceph, AWS S3) unter strikten team- und plugin-isolierten Präfixen (`teams/{teamId}/plugins/{pluginSlug}/`).
5. **Datenbank als Single Source of Truth:** Core-Tabellen und isolierte Plugin-Tabellen (`mod_<plugin>_*`) liegen in PostgreSQL – keine Manifest-Dateien auf S3 als Datenquelle.

---

## 2. Multi-Tenancy, Rollenmodell (RBAC) & Konto-Portabilität

| Rolle | Befugnisse | Datenzugriff |
| :--- | :--- | :--- |
| **Instance Admin (Sysadmin)** | Plugin Store (GitHub-Install), Team-Freigabe-Matrix, Teams/Mandanten, globale Benutzer, S3/SMTP, Plugin-Sysadmin-Panels (z. B. S3-Cleanup) | **Kein App-Zugriff** auf Team-Videos, Breakdowns, Notizen oder Kommentare |
| **Team Admin (Head Coach)** | Teammitglieder, Multi-Units, Einladungen (E-Mail & Team-Link inkl. Freigabe-Warteliste), Spieler-Custom-Felder, Plugin-Team-Konfigurationen (z. B. Tagging-Schema) | Vollzugriff im eigenen Team |
| **Coordinator / Position Coach** | Nutzung aller freigeschalteten Team-Plugins (z. B. Upload, Film Room, Breakdown, `DRAFT`-Notizen, `Publish Session`) | Schreibzugriff im eigenen Team |
| **Player** | Freigegebene Plugin-Ansichten, eigenes Profil (Nummer, Position, Kontakte, Team-Custom-Felder), persönliche Plugin-Optionen | Nur **explizit freigegebene** Inhalte |

> **Hub, dauerhafte Multi-Saison-Teams & Konto-Portabilität:**
> * **Aufgeräumte Startseite & Einstellungs-Hub:** Die Startseite zeigt ausschließlich Kacheln für die installierten und fürs Team freigeschalteten Plugins sowie eine Kachel `Einstellungen`. Nicht freigeschaltete Plugins werden vollständig ausgeblendet. Hinter `Einstellungen` liegt eine dedizierte Einstellungs-Übersichtsseite (`Persönliche Einstellungen`, `Team-Einstellungen`, `Sysadmin & Instanz` – jeweils nach Berechtigung), die in ein einheitliches 2-Spalten-Layout mit offenem sticky Seitenmenü führt. Aktive Plugins klinken ihre eigenen Einstellungs-Sektionen dynamisch über das SDK ein.
> * **Team-sortierte Modulverwaltung:** Im Sysadmin-Bereich werden GitHub-Plugins über den **Plugin Store** verwaltet und die Mandanten-Freigaben darunter übersichtlich **nach Team sortiert** zugewiesen.
> * **Dauerhafte Multi-Saison-Teams:** Teams werden bei einem Saisonwechsel nicht neu angelegt. Jedes Team führt eine `aktiveSaison` und eine Liste aller bisherigen `saisons` (`2026`, `2025`, `2024`, …). Kader, Units, Custom-Felder und Plugin-Stammdaten bleiben erhalten, während ältere Spielzeiten direkt über den Saison-Umschalter abrufbar bleiben.
> * **Produktiver Ansichts-Umschalter:** Konten mit untergeordneten Rollen können gezielt in deren Ansicht wechseln (`Team Admin` → `Coach` / `Spieler`; `Coach` → `Spieler`). Für reine `Spieler` ist der Umschalter ausgeblendet.
> * **Konto-Erhalt & spätere Migration:** Globale Benutzerkonten (`user_uuid`) sind strikt von `team_memberships` getrennt. Ein Entfernen aus einem Team löscht das Konto nicht – das bereitet einen späteren **Konto-Umzug zwischen Teams oder SidelineOS-Core-Servern** vor.

---

## 3. Hybrid-Video-Modell (Videoanalyse-Plugin)

Das gekapselte Plugin `src/plugins/video-analysis/` (bereit für die Auslagerung nach `sidelineos-plugin-video`) bildet beide Praxis-Szenarien über ein gemeinsames Modell ab:

```text
mod_video_media_reels (physisches Asset-Container-Objekt)
 └── mod_video_team_reel_access (team_id, reel_id, title, category, event_date, visibility, shared_from)
      └── mod_video_plays (play_number, breakdown_json)
           └── mod_video_play_angles (angle_code: SIDELINE | ENDZONE | TIGHT,
                                      source_mode: CLIP_FILE | TIME_SLICE,
                                      s3_key, start_ms, end_ms,
                                      offset_ms NULLABLE)
```

* **`CLIP_FILE` (Einzelclips) & `TIME_SLICE` (Einzeldatei-Tape):** Einzeldateien werden per HTTP `206 Partial Content` segmentweise gestreamt.
* **Optionaler Offset & fehlende Winkel:** `offset_ms` ist vollständig optional (`undefined`/`null` = `0 ms`), einzelne Winkel dürfen fehlen.

---

## 4. Team-Sharing, `/share/`-Download-Links & S3-Cleanup mit Schonfrist

* **Granulare Tagging-Freigabe:** Bei Team-zu-Team-Freigaben sowie externen `/share/<token>`-Download-Links mit Ablaufzeit wird pro Empfänger festgelegt, welche Breakdown-Spalten mitgegeben werden. Coach-Notizen und Canvas-Zeichnungen bleiben immer privat.
* **Outbox-Pattern & Retention-Delay:** Löscht ein Team ein Reel und sinkt `ref_count` auf `0`, registriert das Plugin einen anonymisierten Eintrag in der Sysadmin-Cleanup-Queue (`scheduled_delete_at = NOW() + S3_CLEANUP_RETENTION_DAYS`). Innerhalb der Schonfrist kann wiederhergestellt werden.

---

## 5. Sicherheitsprinzipien für KI-Suche & Canvas

* **Normalisierte & frame-gebundene Canvas-Zeichnungen:** Vektorzeichnungen (`0.0` bis `1.0`) sind strikt an Kamerawinkel und exakten 25fps-Frame (`FRAME_MS = 40`) gebunden.
* **Plugin-Isolation & typsichere KI-Suche:** Plugins erhalten im Backend ausschließlich Scope-gebundene Datenbank- und S3-Proxys (`dbPrefix`, `s3Prefix`, `team_id` serverseitig erzwungen). Optionale KI-Filter erzeugen ausschließlich validierte JSON-Filterobjekte, niemals rohes SQL.

---

## 6. Cross-Platform & App-Architektur (Android, iOS, Linux, Windows, macOS)

1. **Headless TypeScript Logik (`src/core/*`, `src/sdk/*`, `src/plugins/*/services/*`):** Alle Fachregeln (RBAC, Saisonfilter, Tagging-Auto-Calc, Frame-Quantisierung, Bundle-Validierung, GitHub-Store-Parser) sind frei von Browser-DOM-Abhängigkeiten.
2. **Strikte API-Grenze (Core-Backend):** Auth, Presigned S3-URLs (`206 Partial Content`), Plugin-Manifeste und Metadaten laufen ausschließlich über `/api/v1/*`.
3. **Mobile & Desktop:** **Capacitor** (Android/iOS) und **Tauri v2** (Linux/Windows/macOS) können direkt auf derselben Web-App + REST-API aufsetzen.

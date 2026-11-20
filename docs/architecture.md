# SidelineOS — System- & Architektur-Dokumentation

Dieses Dokument beschreibt die verbindliche Zielarchitektur von **SidelineOS** (Modularer Monolith, stateless Backend, S3-Object-Storage, PostgreSQL als Single Source of Truth).

---

## 1. Architekturprinzipien (KISS)

1. **Modularer Core-Hub statt starrer Einzelfunktion:** Der SidelineOS-Core stellt Hub/Landing-Page, Authentifizierung, Benutzerkonten, Team-Mitgliedschaften (Multi-Unit) sowie die zentralen Einstellungsseiten bereit. Fachfunktionen (z. B. `video-analysis`) registrieren sich als entkoppelte Module über die zentrale `SIDELINE_MODULE_REGISTRY` und klinken eigene Einstellungs-Kategorien dynamisch in die Core-Einstellungen ein.
2. **Zweistufige Modul-Aktivierung & ENV-Bootstrap:** Die Ersteinrichtung erfolgt deployment-unabhängig ausschließlich über `.env` (`INITIAL_SYSADMIN_*`, `ENABLED_MODULES`, S3, SMTP) ohne Browser-Wizard. Aktivierte Module können vom Sysadmin zusätzlich pro Mandant/Team freigeschaltet oder deaktiviert werden.
3. **Stateless Anwendungscontainer:** Keine lokale Medienspeicherung im Container. Alle Videodateien liegen in einem S3-kompatiblen Object Storage (MinIO, Hetzner Object Storage, Ceph, AWS S3).
4. **Datenbank als Single Source of Truth:** Alle Teamzuordnungen, Sichtbarkeiten, Breakdowns, Timecodes und Freigaben liegen ausschließlich in PostgreSQL – keine Manifest-Dateien auf S3 als Datenquelle.

---

## 2. Multi-Tenancy, Rollenmodell (RBAC) & Konto-Portabilität

| Rolle | Befugnisse | Datenzugriff |
| :--- | :--- | :--- |
| **Instance Admin (Sysadmin)** | Modul-Aktivierung, Teams/Mandanten, globale Benutzer, S3/SMTP, Retention-Delay, Cleanup-Trigger | **Kein App-Zugriff** auf Team-Videos, Breakdowns, Notizen oder Kommentare |
| **Team Admin (Head Coach)** | Teammitglieder, Multi-Units, Einladungen (E-Mail & Team-Link inkl. Freigabe-Warteliste), Spieler-Custom-Felder, Modul-Konfigurationen (z. B. Tagging-Schema) | Vollzugriff im eigenen Team |
| **Coordinator / Position Coach** | Upload, Cut & Sync, Breakdown, Telestration, `DRAFT`-Notizen, `Publish Session`, Spieler-Freigaben | Schreibzugriff im eigenen Team |
| **Player** | Wiedergabe freigegebener Reels & Smart Playlists, eigenes Profil (Nummer, Position, Kontakte, Team-Custom-Felder), eigene Notizen | Nur **explizit freigegebene** Reels/Units und `PUBLISHED`-Coach-Notizen |

> **Hub, dauerhafte Multi-Saison-Teams & Konto-Portabilität:**
> * **Aufgeräumte Startseite & Einstellungs-Hub:** Die Startseite zeigt ausschließlich Kacheln für die freigeschalteten Module des Teams sowie eine Kachel `Einstellungen`. Nicht freigeschaltete Module werden vollständig ausgeblendet. Hinter `Einstellungen` liegt eine dedizierte Einstellungs-Übersichtsseite (`Persönliche Einstellungen`, `Team-Einstellungen`, `Sysadmin & Instanz` – jeweils nach Berechtigung), die in ein einheitliches 2-Spalten-Layout mit offenem sticky Seitenmenü führt.
> * **Team-sortierte Modulverwaltung:** Im Sysadmin-Bereich werden installierte Module (`ENABLED_MODULES`) instanzweit gesteuert und die Mandanten-Freigaben übersichtlich **nach Team sortiert** zugewiesen.
> * **Dauerhafte Multi-Saison-Teams:** Teams werden bei einem Saisonwechsel nicht neu angelegt. Jedes Team führt eine `aktiveSaison` und eine Liste aller bisherigen `saisons` (`2026`, `2025`, `2024`, …). Kader, Units, Custom-Felder und Tagging-Wörterbücher bleiben erhalten, während ältere Spielzeiten direkt über den Saison-Umschalter abrufbar bleiben.
> * **Produktiver Ansichts-Umschalter:** Konten mit untergeordneten Rollen können gezielt in deren Ansicht wechseln (`Team Admin` → `Coach` / `Spieler`; `Coach` → `Spieler`). Für reine `Spieler` ist der Umschalter ausgeblendet.
> * **Konto-Erhalt & spätere Migration:** Globale Benutzerkonten (`user_uuid`) sind strikt von `team_memberships` getrennt. Ein Entfernen aus einem Team löscht das Konto nicht – das bereitet einen späteren **Konto-Umzug zwischen Teams oder SidelineOS-Servern** vor.

---

## 3. Hybrid-Video-Modell (Einzelclips & Einzeldatei-Tapes)

Beide Praxis-Szenarien (Kamera nimmt pro Spielzug einen Clip auf vs. durchlaufendes Spielvideo) werden über ein einziges Datenmodell abgebildet:

```text
media_reels (physisches Asset-Container-Objekt)
 └── team_reel_access (team_id, reel_id, title, category, event_date, visibility, shared_from)
      └── plays (play_number, breakdown_json)
           └── play_angles (angle_code: SIDELINE | ENDZONE | TIGHT,
                            source_mode: CLIP_FILE | TIME_SLICE,
                            s3_key, start_ms, end_ms,
                            offset_ms NULLABLE)
```

### Verhalten je Upload-Modus
* **`CLIP_FILE` (Regelfall – Einzelclips):** Jede Kamera liefert pro Spielzug eine Datei (`start_ms = 0`, `end_ms = Clipdauer`).
* **`TIME_SLICE` (Einzeldatei-Tape):** Eine durchlaufende Videodatei (`raw_source.mp4` mit MP4-FastStart / `moov`-Atom am Anfang oder HLS-Segmenten). Der Fast-Cut-Editor speichert ausschließlich `start_ms` und `end_ms`. Der Browser streamt per **HTTP `206 Partial Content` (Byte-Range Requests)** immer nur den benötigten Spielzug-Ausschnitt, nicht die gesamte Datei.

### Multi-Angle & optionaler Offset
* Einzelne Winkel dürfen pro Play fehlen (`NULL`, z. B. wenn Kamera B einen Spielzug verpasst hat).
* Unerwünschte Fehl-Clips einer Kamera lassen sich einzeln entfernen, ohne das Play in der anderen Kamera zu beschädigen.
* **`offset_ms` ist vollständig optional** (`undefined` / `null` = `0 ms`). Coaches mit zwei manuell gestarteten Kameras müssen Clips nicht synchronisieren, können aber bei Bedarf pro Play oder per `Snap-Sync` einen Versatz hinterlegen.

---

## 4. Team-Sharing, `/share/`-Download-Links & S3-Cleanup mit Schonfrist

### Trennung von Asset und Team-Metadaten
Titel (`vs. Berlin Rebels`), Kategorie (`GAME` vs. `SCOUTING`), Sichtbarkeit für Spieler sowie sämtliche Breakdowns und Notizen liegen **immer auf der Team-Ebene** (`team_reel_access`), niemals global am physischen Asset.

### Granulare Freigabe von Tagging-Daten (Team-zu-Team & Download-Links)
* **Instanz-Teams & Scouting-Pools:** Für jedes geteilte Team wird individuell konfiguriert, welche Breakdown-Spalten mitgegeben werden (Standard: `[]` = nur Videomaterial; optional einzelne Spalten wie `ODK`, `DN`, `DIST`, `HASH` oder das gesamte Breakdown). Coach-Notizen und Canvas-Zeichnungen bleiben **immer privat**.
* **Externe `/share/<token>`-Download-Links:** Coaches können zeitlich befristete Download-Links unter `/share/<token>` erzeugen (inkl. wählbarer Ablaufzeit, z. B. 24 h / 7 / 14 / 30 Tage, und individueller Spalten-Auswahl für das mitgelieferte JSON/CSV-Paket). Nach Ablauf oder manuellem Widerruf liefert der Endpunkt `410 Gone` zurück.

### Ausfallsicheres S3-Löschen (Outbox-Pattern + Retention-Delay)
PostgreSQL-Trigger führen niemals direkte S3-HTTP-Aufrufe aus. Stattdessen gilt folgender Ablauf:
1. Löscht ein Team ein Reel, wird der Eintrag in `team_reel_access` entfernt.
2. Sinkt die verbleibende Referenzanzahl (`COUNT`) auf `0`, legt die Datenbank einen Eintrag in `s3_cleanup_queue` an:
   `scheduled_delete_at = NOW() + S3_CLEANUP_RETENTION_DAYS`.
3. **Wiederherstellung (Restore):** Innerhalb der vom Sysadmin definierten Schonfrist kann die Löschung vollständig zurückgenommen werden.
4. **Manueller Trigger:** Der Sysadmin kann fällige oder gewählte Queue-Einträge jederzeit sofort über „Cleanup jetzt ausführen“ bereinigen.

---

## 5. Sicherheitsprinzipien für KI-Suche & Canvas

* **Normalisierte & frame-gebundene Canvas-Zeichnungen:** Alle Vektorzeichnungen werden relativ zur Videofläche (`0.0` bis `1.0`), streng an ihren Kamerawinkel (`angle`) und an ihren exakten Video-Frame (`timestamp_ms` quantisiert auf Frame-Raster) gebunden. Auto-Stop pausiert die Wiedergabe exakt auf dem gezeichneten Frame.
* **Typsichere KI-Suche:** Eine optionale LLM-Anbindung (Ollama / externe API) generiert niemals rohes SQL, sondern ausschließlich ein strikt validiertes JSON-Filterobjekt identisch zum Smart-Playlist-Filter. `team_id` wird immer serverseitig erzwungen.

---

## 6. Cross-Platform & App-Architektur (Android, iOS, Linux, Windows, macOS)

Die UI- und Code-Struktur ist von Beginn an **API-First** und plattformneutral ausgelegt, um spätere Desktop- und Mobile-Clients ohne Neuentwicklung der Geschäftslogik zu ermöglichen:

1. **Headless TypeScript Core (`src/core/*`, `src/modules/*/services/*`, `src/shared/types.ts`):** Sämtliche Domänenlogik (Tagging-Auto-Calc, Frame-Quantisierung, Saison-Filterung, Bundle-Validierung, RBAC-Regeln) ist frei von Browser-DOM-Abhängigkeiten und lässt sich unverändert in Web, Mobile-Apps und Desktop-Clients nutzen.
2. **Strikte API-Grenze (Paket 4):** Authentifizierung (JWT/Session + Refresh), Presigned S3-URLs (`206 Partial Content`), JSON-Bundles und Metadaten laufen ausschließlich über eine sauber versionierte REST-API (`/api/v1/*`).
3. **Empfohlene App-Pfade (KISS):**
   * **Mobile (Android & iOS):** **Capacitor** (nutzt direkt die bestehende React/Tailwind-UI + native Plugins für Kamera-Sync, Offline-Cache und System-Share) oder optional **React Native / Flutter** gegen dieselbe `/api/v1`-Schnittstelle.
   * **Desktop (Linux, Windows, macOS):** **Tauri v2** (sehr kleine Binärdateien, nativer System-WebView, direkter Zugriff auf lokale Kamera-SD-Karten für Multi-Clip-Bulk-Uploads).
   * **Touch-First & Responsive UI:** Großzügige Kachel- und Button-Ziele, keine Hover-only-Pflichtfunktionen und normalisierte Canvas-Koordinaten (`0..1`) funktionieren konsistent per Maus, Touch, Apple Pencil und Stylus.


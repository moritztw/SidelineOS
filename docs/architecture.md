# SidelineOS — System- & Architektur-Dokumentation

Dieses Dokument beschreibt die verbindliche Zielarchitektur von **SidelineOS** (Modularer Monolith, stateless Backend, S3-Object-Storage, PostgreSQL als Single Source of Truth).

---

## 1. Architekturprinzipien (KISS)

1. **Modularer Monolith statt Microservices:** Eine einzige deploybare Anwendung reduziert Betriebsaufwand auf Vereins-Hardware (Raspberry Pi, Mini-PC, Proxmox LXC). Fachfunktionen liegen strikt getrennt in `src/modules/` und `server/modules/`.
2. **Stateless Anwendungscontainer:** Keine lokale Medienspeicherung im Container. Alle Videodateien liegen in einem S3-kompatiblen Object Storage (MinIO, Hetzner Object Storage, Ceph, AWS S3).
3. **Datenbank als Single Source of Truth:** Alle Teamzuordnungen, Sichtbarkeiten, Breakdowns, Timecodes und Freigaben liegen ausschließlich in PostgreSQL – keine Manifest-Dateien auf S3 als Datenquelle.

---

## 2. Multi-Tenancy & Rollenmodell (RBAC)

| Rolle | Befugnisse | Datenzugriff |
| :--- | :--- | :--- |
| **Instance Admin (Sysadmin)** | Server-Setup, S3-Bucket, Retention-Delay, Cleanup-Trigger, Mandanten anlegen, Module aktivieren | **Kein App-Zugriff** auf Team-Videos, Breakdowns, Notizen oder Kommentare |
| **Team Admin (Head Coach)** | Teammitglieder, Units, Teamfarben, Breakdown-Schema, App2App-Sharing-Token, Spieler-Freigaben | Vollzugriff im eigenen Team |
| **Coordinator / Position Coach** | Upload, Cut & Sync, Breakdown, Telestration, `DRAFT`-Notizen, `Publish Session`, Spieler-Freigaben | Schreibzugriff im eigenen Team |
| **Player** | Wiedergabe freigegebener Reels & Smart Playlists, eigene Notizen (optional) | Nur **explizit freigegebene** Reels/Units und `PUBLISHED`-Coach-Notizen |

> **Multi-Rollen & Datenschutz:** Benutzer können mehrere Rollen gleichzeitig tragen (z. B. *Sysadmin + Team Admin + Coach*). Sämtliche Instanz-Funktionen liegen deshalb in einem eigenen **`Sysadmin`-Tab**, strikt getrennt von Team-Ansichten. Besitzt ein Konto ausschließlich die Rolle `Instance Admin` (ohne Team-Rolle), besteht auf Applikations- und API-Ebene keinerlei Einsicht in Team-Videos, Breakdowns oder Notizen.

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

* **Normalisierte Canvas-Koordinaten:** Alle Vektorzeichnungen werden relativ zur Videofläche im Wertebereich `0.0` bis `1.0` gespeichert, damit Zeichnungen auf allen Bildschirmgrößen exakt liegen bleiben.
* **Typsichere KI-Suche:** Eine optionale LLM-Anbindung (Ollama / externe API) generiert niemals rohes SQL, sondern ausschließlich ein strikt validiertes JSON-Filterobjekt identisch zum Smart-Playlist-Filter. `team_id` wird immer serverseitig erzwungen.

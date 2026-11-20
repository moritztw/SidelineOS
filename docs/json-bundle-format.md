# JSON-Bundle-Spezifikation (`sideline-bundle.json` v1.0)

Das `sideline-bundle.json`-Format ist die offene Austausch- und Import-Schnittstelle von **SidelineOS**. Es ermöglicht:

1. **Companion-App-Workflows:** Externe mobile Apps können mehrere Kameras synchron ansteuern, Clips zuordnen, am Spielfeldrand Live-Tagging erfassen und am Spielende alles gebündelt zusammen mit den Videodateien hochladen.
2. **Einzelclip- & Einzeldatei-Support:** Ein einheitliches Schema für vorgeschnittene Einzelclips (`CLIP_FILE`) und virtuelle Timecode-Schnitte (`TIME_SLICE`).
3. **Portablen Export & Backup:** Jedes Reel lässt sich direkt aus SidelineOS wieder als standardisiertes `sideline-bundle.json` exportieren.

---

## 1. Strukturübersicht

```json
{
  "schema_version": "1.0",
  "reel": {
    "title": "vs. Berlin Rebels",
    "category": "GAME",
    "event_date": "2026-11-14",
    "visibility": "COACHES_ONLY"
  },
  "angles": ["SIDELINE", "ENDZONE"],
  "plays": [
    {
      "play_number": 1,
      "sources": {
        "SIDELINE": {
          "file": "sl_001.mp4",
          "source_mode": "CLIP_FILE",
          "start_ms": 0,
          "end_ms": 8400
        },
        "ENDZONE": {
          "file": "ez_001.mp4",
          "source_mode": "CLIP_FILE",
          "start_ms": 0,
          "end_ms": 8100,
          "offset_ms": 300
        }
      },
      "breakdown": {
        "odk": "O",
        "down": 1,
        "distance": 10,
        "yard_line": -25,
        "hash": "L",
        "play_type": "RUN",
        "off_form": "Trips Left",
        "def_front": "4-3",
        "coverage": "Cover 3",
        "result": "Gain",
        "gn_ls": 6
      },
      "notes": [
        {
          "timestamp_ms": 2100,
          "text": "RG verpasst Combo-Block zum MLB",
          "status": "DRAFT"
        }
      ]
    }
  ]
}
```

---

## 2. Feldreferenz & Validierungsregeln

### Wurzelobjekt

| Feld | Typ | Pflicht | Beschreibung |
| :--- | :--- | :--- | :--- |
| `schema_version` | `"1.0"` | Ja | Muss exakt `"1.0"` entsprechen. |
| `reel` | Objekt | Ja | Metadaten des Reels. |
| `angles` | `string[]` | Ja | Mindestens ein Kamerawinkel (z. B. `SIDELINE`, `ENDZONE`, `TIGHT`). |
| `plays` | `Play[]` | Ja | Liste der Spielzüge (darf bei reinem Roh-Import leer sein, wenn noch nicht geschnitten). |

### `reel`

| Feld | Typ | Pflicht | Beschreibung |
| :--- | :--- | :--- | :--- |
| `title` | `string` | Ja | Anzeigename des Spiels/Trainings (nicht leer). |
| `category` | Enum | Ja | `GAME`, `PRACTICE`, `SCOUTING`, `SELF_SCOUT` oder `CUSTOM`. |
| `event_date` | `YYYY-MM-DD` | Ja | Datum des Events im ISO-Datumsformat. |
| `visibility` | Enum | Nein | Standard: `COACHES_ONLY`. Alternativen: `ALL_PLAYERS`, `UNIT_OFFENSE`, `UNIT_DEFENSE`, `UNIT_SPECIAL_TEAMS`. |

### `plays[].sources[angle]`

Für jeden Kamerawinkel kann ein Quellen-Objekt angegeben werden. Fehlt ein Winkel bei einem Play, bleibt der Slot leer (Lücke wird im Sync-Editor sauber dargestellt).

| Feld | Typ | Pflicht | Beschreibung |
| :--- | :--- | :--- | :--- |
| `file` | `string` | Ja | Relativer Dateiname der Videodatei im Upload-Paket (z. B. `sl_001.mp4` oder `raw_game.mp4`). |
| `source_mode` | Enum | Nein | `CLIP_FILE` (Standard) oder `TIME_SLICE` (für Abschnitte aus einer Gesamtdatei). |
| `start_ms` | `number` | Ja | Startzeitpunkt in Millisekunden (`>= 0`). Bei Einzelclips üblicherweise `0`. |
| `end_ms` | `number` | Ja | Endzeitpunkt in Millisekunden (`> start_ms`). |
| `offset_ms` | `number` | **Nein (Optional)** | Zeitversatz in Millisekunden relativ zum Master-Winkel (positiv oder negativ). Weglassen oder `0`, wenn keine manuelle Synchronisierung gewünscht ist. |

### `plays[].breakdown` (Optional)

Hudl-kompatible Standardfelder – alle Einzelfelder sind optional, sodass partielles Live-Tagging am Spielfeldrand problemlos möglich ist:

* `odk`: `"O"` | `"D"` | `"K"`
* `down`: `1` | `2` | `3` | `4`
* `distance`: Zahl (`>= 0`)
* `yard_line`: Zahl (`-50` bis `+50`, negativ = eigene Hälfte)
* `hash`: `"L"` | `"M"` | `"R"`
* `play_type`: `"RUN"` | `"PASS"` | `"SPECIAL"` | `"PENALTY"`
* `off_form`, `def_front`, `coverage`, `result`: Freitext
* `gn_ls`: Raumgewinn/-verlust in Yards (Zahl)

---

## 3. Beispiel: Einzeldatei-Tape (`TIME_SLICE`) ohne Offset

Wenn nur eine durchgehende Kameraaufnahme vorliegt und am Handy lediglich Start-/Endzeiten markiert wurden:

```json
{
  "schema_version": "1.0",
  "reel": {
    "title": "Training Team-Period Dienstag",
    "category": "PRACTICE",
    "event_date": "2026-11-17"
  },
  "angles": ["SIDELINE"],
  "plays": [
    {
      "play_number": 1,
      "sources": {
        "SIDELINE": {
          "file": "practice_2026_11_17_full.mp4",
          "source_mode": "TIME_SLICE",
          "start_ms": 12400,
          "end_ms": 20800
        }
      },
      "breakdown": {
        "odk": "O",
        "down": 1,
        "distance": 10,
        "play_type": "PASS"
      }
    }
  ]
}
```

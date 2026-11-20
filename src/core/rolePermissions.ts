import type {
  BenutzerHotkeys,
  BenutzerProfil,
  HotkeyAktion,
  NutzerEinstellungen,
  TeamRolle,
} from '../shared/types.ts';

/** Standard-Framerate 25 fps -> 40 ms pro Frame für exakte Frame-Bindung von Zeichnungen */
export const FRAME_MS = 40;

export function zeitZuFrame(ms: number): number {
  return Math.max(0, Math.round(ms / FRAME_MS));
}

export function frameZuZeit(frameIndex: number): number {
  return Math.max(0, Math.round(frameIndex)) * FRAME_MS;
}

export function istGleicherFrame(msA: number, msB: number): boolean {
  return zeitZuFrame(msA) === zeitZuFrame(msB);
}

/**
 * Liefert alle Team-Ansichten, in die ein angemeldetes Konto wechseln darf:
 * - Team Admin -> Team Admin, Coach, Spieler
 * - Coach      -> Coach, Spieler
 * - Spieler    -> nur Spieler (kein Umschalter nötig)
 * - Nur Sysadmin -> keine Team-Ansicht
 */
export function ermittleWaehlbareTeamAnsichten(konto: BenutzerProfil): TeamRolle[] {
  if (konto.teamRolle === 'TEAM_ADMIN') {
    return ['TEAM_ADMIN', 'COACH', 'PLAYER'];
  }
  if (konto.teamRolle === 'COACH') {
    return ['COACH', 'PLAYER'];
  }
  if (konto.teamRolle === 'PLAYER') {
    return ['PLAYER'];
  }
  return [];
}

/**
 * Prüft, ob der produktive Ansichts-Umschalter für das Konto angezeigt werden soll
 * (nur wenn das Konto mindestens eine untergeordnete Ansicht besitzt).
 */
export function darfAnsichtWechseln(konto: BenutzerProfil): boolean {
  return ermittleWaehlbareTeamAnsichten(konto).length > 1;
}

export const STANDARD_HOTKEYS: BenutzerHotkeys = {
  select: 'v',
  pen: 'p',
  arrow: 'a',
  spotlight: 's',
  text: 't',
  undo: 'z',
  toggleDrawBar: 'd',
  toggleFullscreen: 'f',
  switchAngle: 'c',
};

export const STANDARD_NUTZER_EINSTELLUNGEN: NutzerEinstellungen = {
  hotkeys: { ...STANDARD_HOTKEYS },
  standardKommentarEcke: 'top-right',
  standardAutoStop: true,
  standardGeschwindigkeit: 1,
};

export const HOTKEY_BESCHREIBUNGEN: Array<{
  aktion: HotkeyAktion;
  label: string;
  beschreibung: string;
}> = [
  {
    aktion: 'select',
    label: 'Bearbeiten / Auswählen',
    beschreibung: 'Pfeile, Spotlights und Text-Marker verschieben oder skalieren',
  },
  {
    aktion: 'pen',
    label: 'Freihand-Stift',
    beschreibung: 'Freihandlinien direkt auf den aktuellen Frame zeichnen',
  },
  {
    aktion: 'arrow',
    label: 'Pfeil',
    beschreibung: 'Laufwege, Passrouten und Blocks als Pfeil einzeichnen',
  },
  {
    aktion: 'spotlight',
    label: 'Spieler-Spotlight',
    beschreibung: 'Spieler hervorheben und Hintergrund abdunkeln',
  },
  {
    aktion: 'text',
    label: 'Text-Marker',
    beschreibung: 'Kurze taktische Beschriftung auf dem Spielfeld platzieren',
  },
  {
    aktion: 'undo',
    label: 'Rückgängig',
    beschreibung: 'Letzte Zeichnung im aktuellen Kamerawinkel entfernen',
  },
  {
    aktion: 'toggleDrawBar',
    label: 'Zeichenleiste ein/aus',
    beschreibung: 'Schwebende Werkzeugleiste über dem Video umschalten',
  },
  {
    aktion: 'toggleFullscreen',
    label: 'Vollbildmodus',
    beschreibung: 'Player inkl. Overlays im Vollbild öffnen oder schließen',
  },
  {
    aktion: 'switchAngle',
    label: 'Kamerawinkel wechseln',
    beschreibung: 'Zwischen verfügbaren Winkeln (z. B. Sideline / Endzone) umschalten',
  },
];

/** Normalisiert eine gedrückte Taste auf ein zulässiges Hotkey-Zeichen (einzelner Buchstabe/Ziffer) */
export function normalisiereHotkeyTaste(key: string): string | null {
  const bereinigt = key.trim().toLowerCase();
  if (/^[a-z0-9]$/.test(bereinigt)) {
    return bereinigt;
  }
  return null;
}

/**
 * Weist einer Aktion eine neue Taste zu und lehnt Doppelbelegungen sauber ab.
 */
export function aktualisiereBenutzerHotkey(
  aktuell: BenutzerHotkeys,
  aktion: HotkeyAktion,
  neueTasteRoh: string
): { ok: boolean; hotkeys: BenutzerHotkeys; fehler?: string } {
  const taste = normalisiereHotkeyTaste(neueTasteRoh);
  if (!taste) {
    return {
      ok: false,
      hotkeys: aktuell,
      fehler: 'Bitte einen einzelnen Buchstaben (A–Z) oder eine Ziffer (0–9) wählen.',
    };
  }

  const konflikt = (Object.entries(aktuell) as Array<[HotkeyAktion, string]>).find(
    ([andereAktion, belegteTaste]) => andereAktion !== aktion && belegteTaste === taste
  );

  if (konflikt) {
    const konfliktLabel =
      HOTKEY_BESCHREIBUNGEN.find((h) => h.aktion === konflikt[0])?.label ?? konflikt[0];
    return {
      ok: false,
      hotkeys: aktuell,
      fehler: `Taste "${taste.toUpperCase()}" ist bereits für "${konfliktLabel}" belegt.`,
    };
  }

  return {
    ok: true,
    hotkeys: {
      ...aktuell,
      [aktion]: taste,
    },
  };
}

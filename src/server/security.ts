import crypto from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEYLEN = 64;

/**
 * Erzeugt einen portablen Passwort-Hash mit Node-Standard-scrypt (keine C++-Abhängigkeiten,
 * ideal für ARM64 / Raspberry Pi und spätere Teamkopie-Snapshots).
 */
export function hashPasswort(passwort: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passwort, salt, KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

/**
 * Verifiziert ein Passwort konstantzeitlich gegen einen gespeicherten scrypt-Hash.
 */
export function pruefePasswort(passwort: string, gespeichert: string): boolean {
  const teile = gespeichert.split('$');
  if (teile.length !== 6 || teile[0] !== 'scrypt') {
    return false;
  }
  const n = Number(teile[1]);
  const r = Number(teile[2]);
  const p = Number(teile[3]);
  const salt = teile[4];
  const hashHex = teile[5];

  if (!n || !r || !p || !salt || !hashHex) {
    return false;
  }

  try {
    const erwartet = Buffer.from(hashHex, 'hex');
    const berechnet = crypto.scryptSync(passwort, salt, erwartet.length, { N: n, r, p });
    if (erwartet.length !== berechnet.length) return false;
    return crypto.timingSafeEqual(erwartet, berechnet);
  } catch {
    return false;
  }
}

export function generiereSessionToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

/**
 * In der Datenbank wird ausschließlich der SHA-256-Hash des Tokens gespeichert.
 */
export function hashSessionToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

export function generiereEinladungsToken(praefix = 'inv'): string {
  return `${praefix}-${crypto.randomBytes(9).toString('base64url')}`;
}

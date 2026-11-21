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

function leiteAesSchluesselAb(secret: string): Buffer {
  return crypto.createHash('sha256').update(`sidelineos-settings:${secret}`).digest();
}

/**
 * Verschlüsselt Infrastruktur-Geheimnisse (S3 Secret Key, SMTP Passwort)
 * mittels AES-256-GCM für die persistente Ablage in `core.system_settings`.
 */
export function verschluesseleGeheimnis(klartext: string, secret: string): string {
  if (!klartext) return '';
  const iv = crypto.randomBytes(12);
  const key = leiteAesSchluesselAb(secret);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(klartext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc$v1$${iv.toString('base64url')}$${tag.toString('base64url')}$${encrypted.toString('base64url')}`;
}

export function entschluesseleGeheimnis(chiffre: string, secret: string): string {
  if (!chiffre) return '';
  const teile = chiffre.split('$');
  if (teile.length !== 5 || teile[0] !== 'enc' || teile[1] !== 'v1') {
    return '';
  }
  try {
    const iv = Buffer.from(teile[2], 'base64url');
    const tag = Buffer.from(teile[3], 'base64url');
    const data = Buffer.from(teile[4], 'base64url');
    const key = leiteAesSchluesselAb(secret);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

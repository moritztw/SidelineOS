import { useState, type FormEvent } from 'react';
import { STANDARD_THEME_REF, type VerfuegbaresThemeEintrag } from '../../shared/theme.ts';
import type { BenutzerKonto } from '../../shared/types.ts';
import { CoreApiError, coreApi } from '../apiClient.ts';
import { useI18n } from '../i18n/I18nContext.tsx';

interface AccountPanelProps {
  subRoute: string;
  user: BenutzerKonto;
  verfuegbareThemes: VerfuegbaresThemeEintrag[];
  onProfilAktualisiert: (user: BenutzerKonto) => void;
}

/**
 * Persönliches Konto (`/settings/account/profile` & `/settings/account/security`):
 * Schlanke Core-Basis ohne Team- oder Systemverwaltung (#23).
 */
export function AccountPanel({
  subRoute,
  user,
  verfuegbareThemes,
  onProfilAktualisiert,
}: AccountPanelProps) {
  const { setLocale } = useI18n();
  const [vollerName, setVollerName] = useState(user.vollerName);
  const [email, setEmail] = useState(user.email);
  const [sprache, setSprache] = useState<'de' | 'en'>(user.preferredLocale);
  const [themeRef, setThemeRef] = useState<string>(user.preferredTheme ?? '');
  const [speichertProfil, setSpeichertProfil] = useState(false);
  const [profilMeldung, setProfilMeldung] = useState<string | null>(null);
  const [profilFehler, setProfilFehler] = useState<string | null>(null);

  const [altesPasswort, setAltesPasswort] = useState('');
  const [neuesPasswort, setNeuesPasswort] = useState('');
  const [speichertPasswort, setSpeichertPasswort] = useState(false);
  const [passwortMeldung, setPasswortMeldung] = useState<string | null>(null);
  const [passwortFehler, setPasswortFehler] = useState<string | null>(null);

  const speichereProfil = async (e: FormEvent) => {
    e.preventDefault();
    setProfilMeldung(null);
    setProfilFehler(null);
    setSpeichertProfil(true);
    try {
      const res = await coreApi.aktualisiereProfil({
        vollerName,
        email,
        preferredLocale: sprache,
        preferredTheme: themeRef ? themeRef : null,
      });
      setLocale(res.user.preferredLocale);
      onProfilAktualisiert(res.user);
      setProfilMeldung('Profil wurde gespeichert.');
    } catch (err) {
      setProfilFehler(err instanceof CoreApiError ? err.message : 'Speichern fehlgeschlagen.');
    } finally {
      setSpeichertProfil(false);
    }
  };

  const aenderePasswort = async (e: FormEvent) => {
    e.preventDefault();
    setPasswortMeldung(null);
    setPasswortFehler(null);
    setSpeichertPasswort(true);
    try {
      await coreApi.aenderePasswort(altesPasswort, neuesPasswort);
      setAltesPasswort('');
      setNeuesPasswort('');
      setPasswortMeldung('Passwort wurde aktualisiert.');
    } catch (err) {
      setPasswortFehler(err instanceof CoreApiError ? err.message : 'Passwortänderung fehlgeschlagen.');
    } finally {
      setSpeichertPasswort(false);
    }
  };

  if (subRoute === 'security') {
    return (
      <section className="max-w-xl space-y-6">
        <header className="border-b border-sl-border pb-4">
          <h1 className="font-display text-lg font-semibold text-sl-heading">Passwort & Sicherheit</h1>
          <p className="mt-1 text-xs text-sl-muted">
            Ändere dein persönliches Anmeldepasswort für @{user.benutzername}.
          </p>
        </header>

        <form
          onSubmit={aenderePasswort}
          className="space-y-4 rounded-lg border border-sl-border bg-sl-surface p-6"
        >
          <label className="block space-y-1 text-xs text-sl-muted">
            <span>Aktuelles Passwort</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={altesPasswort}
              onChange={(e) => setAltesPasswort(e.target.value)}
              className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="block space-y-1 text-xs text-sl-muted">
            <span>Neues Passwort (mind. 8 Zeichen)</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={neuesPasswort}
              onChange={(e) => setNeuesPasswort(e.target.value)}
              className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>

          {passwortFehler && <p className="text-xs text-sl-danger-text">{passwortFehler}</p>}
          {passwortMeldung && <p className="text-xs text-sl-success-text">{passwortMeldung}</p>}

          <button
            type="submit"
            disabled={speichertPasswort}
            className="rounded-md bg-sl-accent px-4 py-2 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-60"
          >
            {speichertPasswort ? 'Aktualisiere…' : 'Passwort ändern'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <section className="max-w-xl space-y-6">
      <header className="border-b border-sl-border pb-4">
        <h1 className="font-display text-lg font-semibold text-sl-heading">Profil & Darstellung</h1>
        <p className="mt-1 text-xs text-sl-muted">
          Persönliche Kontodaten, Sprache und Farbschema.
        </p>
      </header>

      <form
        onSubmit={speichereProfil}
        className="space-y-4 rounded-lg border border-sl-border bg-sl-surface p-6"
      >
        <label className="block space-y-1 text-xs text-sl-muted">
          <span>Vollständiger Name</span>
          <input
            type="text"
            required
            value={vollerName}
            onChange={(e) => setVollerName(e.target.value)}
            className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
          />
        </label>

        <label className="block space-y-1 text-xs text-sl-muted">
          <span>E-Mail-Adresse</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
          />
        </label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block space-y-1 text-xs text-sl-muted">
            <span>Sprache</span>
            <select
              value={sprache}
              onChange={(e) => setSprache(e.target.value === 'en' ? 'en' : 'de')}
              className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            >
              <option value="de">Deutsch</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="block space-y-1 text-xs text-sl-muted">
            <span>Theme</span>
            <select
              value={themeRef}
              onChange={(e) => setThemeRef(e.target.value)}
              className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            >
              <option value="">Instanz-Standard verwenden</option>
              <option value={STANDARD_THEME_REF}>SidelineOS Standard (Dark)</option>
              {verfuegbareThemes.map((t) => (
                <option key={t.themeRef} value={t.themeRef}>
                  {t.preset.name} ({t.pluginName})
                </option>
              ))}
            </select>
          </label>
        </div>

        {profilFehler && <p className="text-xs text-sl-danger-text">{profilFehler}</p>}
        {profilMeldung && <p className="text-xs text-sl-success-text">{profilMeldung}</p>}

        <button
          type="submit"
          disabled={speichertProfil}
          className="rounded-md bg-sl-accent px-4 py-2 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-60"
        >
          {speichertProfil ? 'Speichere…' : 'Änderungen speichern'}
        </button>
      </form>
    </section>
  );
}

import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, ShieldCheck } from 'lucide-react';
import { BrandWortmarke, SprachUmschalter, useI18n } from '../i18n/I18nContext.tsx';

interface LoginViewProps {
  ersteinrichtungOffen: boolean;
  onAnmelden: (kennung: string, passwort: string) => Promise<{ ok: boolean; fehler?: string }>;
  onErstAdminErstellen: (daten: {
    benutzername: string;
    vollerName: string;
    email: string;
    passwort: string;
  }) => Promise<{ ok: boolean; fehler?: string }>;
}

export function LoginView({
  ersteinrichtungOffen,
  onAnmelden,
  onErstAdminErstellen,
}: LoginViewProps) {
  const { t } = useI18n();
  const [kennung, setKennung] = useState('');
  const [passwort, setPasswort] = useState('');
  const [benutzername, setBenutzername] = useState('admin');
  const [vollerName, setVollerName] = useState('');
  const [email, setEmail] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setFehler(null);
    setLaedt(true);
    try {
      const res = await onAnmelden(kennung, passwort);
      if (!res.ok) setFehler(res.fehler ?? t('login.failed'));
    } finally {
      setLaedt(false);
    }
  };

  const handleBootstrap = async (e: FormEvent) => {
    e.preventDefault();
    setFehler(null);
    setLaedt(true);
    try {
      const res = await onErstAdminErstellen({ benutzername, vollerName, email, passwort });
      if (!res.ok) setFehler(res.fehler ?? 'Ersteinrichtung fehlgeschlagen.');
    } finally {
      setLaedt(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-sl-canvas px-4 py-10 text-sl-primary">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex justify-end">
          <SprachUmschalter />
        </div>

        <div className="space-y-1.5 text-center">
          <div className="font-display text-2xl font-bold tracking-tight text-sl-heading">
            <BrandWortmarke />
          </div>
          <p className="text-xs text-sl-muted">{t('login.tagline')}</p>
        </div>

        {ersteinrichtungOffen ? (
          <form
            onSubmit={handleBootstrap}
            className="space-y-4 rounded-lg border border-sl-border bg-sl-surface p-6"
          >
            <div className="flex items-center gap-2 border-b border-sl-border pb-3">
              <ShieldCheck className="h-4 w-4 text-sl-accent" aria-hidden="true" />
              <h1 className="text-sm font-semibold text-sl-heading">
                Ersteinrichtung: System-Administrator anlegen
              </h1>
            </div>

            <p className="text-xs leading-relaxed text-sl-muted">
              Diese Instanz enthält noch keine Benutzer. Lege jetzt einmalig das erste
              Sysadmin-Konto an.
            </p>

            <label className="block space-y-1 text-xs text-sl-muted">
              <span>Benutzername</span>
              <input
                type="text"
                required
                minLength={3}
                value={benutzername}
                onChange={(e) => setBenutzername(e.target.value)}
                className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
              />
            </label>

            <label className="block space-y-1 text-xs text-sl-muted">
              <span>Vollständiger Name</span>
              <input
                type="text"
                required
                value={vollerName}
                onChange={(e) => setVollerName(e.target.value)}
                placeholder="z. B. Alex Muster"
                className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
            </label>

            <label className="block space-y-1 text-xs text-sl-muted">
              <span>E-Mail-Adresse</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@verein.de"
                className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
            </label>

            <label className="block space-y-1 text-xs text-sl-muted">
              <span>Passwort (mind. 10 Zeichen)</span>
              <input
                type="password"
                required
                minLength={10}
                autoComplete="new-password"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
              />
            </label>

            {fehler && (
              <div
                role="alert"
                className="rounded border border-sl-danger/50 bg-sl-danger/10 px-3 py-2 text-xs text-sl-danger-text"
              >
                {fehler}
              </div>
            )}

            <button
              type="submit"
              disabled={laedt}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-sl-accent py-2 text-xs font-semibold text-sl-accent-contrast transition-colors hover:bg-sl-accent-hover disabled:opacity-60"
            >
              {laedt ? 'Richte Instanz ein…' : 'Sysadmin-Konto anlegen'}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleLogin}
            className="space-y-4 rounded-lg border border-sl-border bg-sl-surface p-6"
          >
            <div className="flex items-center gap-2 border-b border-sl-border pb-3">
              <Lock className="h-4 w-4 text-sl-accent" aria-hidden="true" />
              <h1 className="text-sm font-semibold text-sl-heading">{t('login.title')}</h1>
            </div>

            <label className="block space-y-1 text-xs text-sl-muted">
              <span>{t('login.identifierLabel')}</span>
              <input
                type="text"
                required
                autoComplete="username"
                value={kennung}
                onChange={(e) => setKennung(e.target.value)}
                placeholder={t('login.identifierPlaceholder')}
                className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
              />
            </label>

            <label className="block space-y-1 text-xs text-sl-muted">
              <span>{t('login.passwordLabel')}</span>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={passwort}
                onChange={(e) => setPasswort(e.target.value)}
                className="w-full rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
              />
            </label>

            {fehler && (
              <div
                role="alert"
                className="rounded border border-sl-danger/50 bg-sl-danger/10 px-3 py-2 text-xs text-sl-danger-text"
              >
                {fehler}
              </div>
            )}

            <button
              type="submit"
              disabled={laedt}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-sl-accent py-2 text-xs font-semibold text-sl-accent-contrast transition-colors hover:bg-sl-accent-hover disabled:opacity-60"
            >
              {laedt ? t('login.submitting') : t('login.submit')}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

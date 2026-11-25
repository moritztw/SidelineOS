import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { BrandWortmarke, SprachUmschalter, useI18n } from '../i18n/I18nContext.tsx';

interface LoginViewProps {
  onAnmelden: (kennung: string, passwort: string) => Promise<{ ok: boolean; fehler?: string }>;
}

export function LoginView({ onAnmelden }: LoginViewProps) {
  const { t } = useI18n();
  const [kennung, setKennung] = useState('');
  const [passwort, setPasswort] = useState('');
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFehler(null);
    setLaedt(true);
    try {
      const res = await onAnmelden(kennung, passwort);
      if (!res.ok) {
        setFehler(res.fehler ?? t('login.failed'));
      }
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

        {/* Wortmarke */}
        <div className="space-y-1.5 text-center">
          <div className="font-display text-2xl font-bold tracking-tight text-sl-heading">
            <BrandWortmarke />
          </div>
          <p className="text-xs text-sl-muted">{t('login.tagline')}</p>
        </div>

        {/* Login-Karte */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-sl-border bg-sl-surface p-6"
        >
          <div className="flex items-center gap-2 border-b border-sl-border pb-3">
            <Lock className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <h1 className="text-sm font-semibold text-sl-heading">{t('login.title')}</h1>
          </div>

          <label className="block space-y-1 text-xs text-sl-muted">
            <span>{t('login.identifierLabel')}</span>
            <input
              type="text"
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
      </div>
    </div>
  );
}

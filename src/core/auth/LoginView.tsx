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
    <div className="flex min-h-screen flex-col justify-center bg-[#0B0E11] px-4 py-10 text-[#E6EDF3]">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="flex justify-end">
          <SprachUmschalter />
        </div>

        {/* Wortmarke */}
        <div className="space-y-1.5 text-center">
          <div className="font-display text-2xl font-bold tracking-tight text-white">
            <BrandWortmarke />
          </div>
          <p className="text-xs text-[#8B949E]">{t('login.tagline')}</p>
        </div>

        {/* Login-Karte */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-[#232933] bg-[#13171D] p-6"
        >
          <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
            <Lock className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <h1 className="text-sm font-semibold text-white">{t('login.title')}</h1>
          </div>

          <label className="block space-y-1 text-xs text-[#8B949E]">
            <span>{t('login.identifierLabel')}</span>
            <input
              type="text"
              autoComplete="username"
              value={kennung}
              onChange={(e) => setKennung(e.target.value)}
              placeholder={t('login.identifierPlaceholder')}
              className="w-full rounded-md border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="block space-y-1 text-xs text-[#8B949E]">
            <span>{t('login.passwordLabel')}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              className="w-full rounded-md border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          {fehler && (
            <div
              role="alert"
              className="rounded border border-[#DC2626]/50 bg-[#DC2626]/10 px-3 py-2 text-xs text-[#FCA5A5]"
            >
              {fehler}
            </div>
          )}

          <button
            type="submit"
            disabled={laedt}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#F59E0B] py-2 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24] disabled:opacity-60"
          >
            {laedt ? t('login.submitting') : t('login.submit')}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  );
}

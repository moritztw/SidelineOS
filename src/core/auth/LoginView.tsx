import { useState, type FormEvent } from 'react';
import { ArrowRight, KeyRound, Link2, Lock, Share2, ShieldCheck } from 'lucide-react';
import { DEMO_STANDARD_PASSWORT } from '../authService.ts';

interface LoginViewProps {
  onAnmelden: (kennung: string, passwort: string) => Promise<{ ok: boolean; fehler?: string }>;
  onInviteOeffnen: (token: string) => void;
  onShareOeffnen: (token: string) => void;
  demoSchnellzugangErlaubt?: boolean;
}

const DEMO_SCHNELLZUGANG_KONTEN = [
  { id: 'demo-admin', label: 'Team Admin + Sysadmin', kennung: 'm.brenner' },
  { id: 'demo-coach', label: 'Coach', kennung: 't.richter' },
  { id: 'demo-player', label: 'Spieler', kennung: 'l.weber' },
  { id: 'demo-sysadmin', label: 'Nur Sysadmin', kennung: 'sysadmin' },
] as const;

export function LoginView({
  onAnmelden,
  onInviteOeffnen,
  onShareOeffnen,
  demoSchnellzugangErlaubt = true,
}: LoginViewProps) {
  const [kennung, setKennung] = useState('headcoach@stallions-football.de');
  const [passwort, setPasswort] = useState(DEMO_STANDARD_PASSWORT);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const fuehreLoginAus = async (zielKennung: string, zielPasswort: string) => {
    setFehler(null);
    setLaedt(true);
    try {
      const res = await onAnmelden(zielKennung, zielPasswort);
      if (!res.ok) {
        setFehler(res.fehler ?? 'Anmeldung fehlgeschlagen.');
      }
    } finally {
      setLaedt(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void fuehreLoginAus(kennung, passwort);
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-[#0B0E11] px-4 py-10 text-[#E6EDF3]">
      <div className="mx-auto w-full max-w-md space-y-6">
        {/* Wortmarke */}
        <div className="text-center space-y-1.5">
          <div className="font-display text-2xl font-bold tracking-tight text-white">
            Sideline<span className="text-[#F59E0B]">OS</span>
          </div>
          <p className="text-xs text-[#8B949E]">
            Selbstgehostete Multi-Tenant-Plattform für Teams &amp; Coaches
          </p>
        </div>

        {/* Login-Karte */}
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-[#232933] bg-[#13171D] p-6 space-y-4"
        >
          <div className="flex items-center gap-2 border-b border-[#232933] pb-3">
            <Lock className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <h1 className="text-sm font-semibold text-white">Anmelden</h1>
          </div>

          <label className="block space-y-1 text-xs text-[#8B949E]">
            <span>E-Mail-Adresse oder Benutzername</span>
            <input
              type="text"
              autoComplete="username"
              value={kennung}
              onChange={(e) => setKennung(e.target.value)}
              placeholder="coach@verein.de oder m.brenner"
              className="w-full rounded-md border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="block space-y-1 text-xs text-[#8B949E]">
            <span>Passwort</span>
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
            {laedt ? 'Wird angemeldet…' : 'Anmelden'}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>

          {demoSchnellzugangErlaubt && (
            <div className="rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-[11px] text-[#8B949E]">
              Demo-Passwort (Dev/Preview):{' '}
              <code className="font-mono text-[#E6EDF3]">{DEMO_STANDARD_PASSWORT}</code>
            </div>
          )}
        </form>

        {/* Demo-Schnellzugang (führt echte Backend-Session-Anmeldung durch) */}
        {demoSchnellzugangErlaubt && (
          <section
            aria-label="Demo-Schnellzugang"
            className="rounded-xl border border-[#232933] bg-[#13171D] p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-xs font-semibold text-white">
              <ShieldCheck className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
              <span>Demo-Schnellzugang (Backend-Session)</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_SCHNELLZUGANG_KONTEN.map((eintrag) => (
                <button
                  key={eintrag.id}
                  type="button"
                  disabled={laedt}
                  onClick={() => void fuehreLoginAus(eintrag.kennung, DEMO_STANDARD_PASSWORT)}
                  className="rounded-md border border-[#232933] bg-[#0B0E11] px-3 py-2 text-left transition-colors hover:border-[#F59E0B] disabled:opacity-60"
                >
                  <div className="text-xs font-medium text-white">{eintrag.label}</div>
                  <div className="truncate font-mono text-[10px] text-[#8B949E]">
                    @{eintrag.kennung}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Direktzugriff auf öffentliche Flows (/invite & /share) */}
        <section
          aria-label="Öffentliche Routen testen"
          className="rounded-xl border border-[#232933] bg-[#13171D] p-4 space-y-2.5"
        >
          <div className="flex items-center gap-2 text-xs font-medium text-[#8B949E]">
            <KeyRound className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
            <span>Öffentliche Routen direkt aufrufen</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onInviteOeffnen('team-seniors-2026-x9k2')}
              className="inline-flex items-center justify-between rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-left text-xs text-[#E6EDF3] hover:border-[#F59E0B]"
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                /invite/…x9k2
              </span>
              <ArrowRight className="h-3 w-3 text-[#8B949E]" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onShareOeffnen('sl-8f2a9c4k')}
              className="inline-flex items-center justify-between rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-left text-xs text-[#E6EDF3] hover:border-[#F59E0B]"
            >
              <span className="inline-flex items-center gap-1.5 truncate">
                <Share2 className="h-3.5 w-3.5 shrink-0 text-[#F59E0B]" aria-hidden="true" />
                /share/sl-8f2a9c4k
              </span>
              <ArrowRight className="h-3 w-3 text-[#8B949E]" aria-hidden="true" />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

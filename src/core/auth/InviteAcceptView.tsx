import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, UserPlus } from 'lucide-react';
import type { OeffentlicheEinladungInfo } from '../../shared/types.ts';
import { CoreApiError, coreApi } from '../apiClient.ts';
import { BrandWortmarke } from '../i18n/I18nContext.tsx';

interface InviteAcceptViewProps {
  token: string;
  onErfolgreichBeigetreten: (token: string) => Promise<void>;
  onZurAnmeldung: () => void;
}

/**
 * Atomares Team-/Vereins-Onboarding (#26):
 * Nimmt einen Einladungs-Token entgegen und legt Club- + Team-Mitgliedschaft in einem Schritt an.
 */
export function InviteAcceptView({
  token,
  onErfolgreichBeigetreten,
  onZurAnmeldung,
}: InviteAcceptViewProps) {
  const [info, setInfo] = useState<OeffentlicheEinladungInfo | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [benutzername, setBenutzername] = useState('');
  const [vollerName, setVollerName] = useState('');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  useEffect(() => {
    let aktiv = true;
    setLadeFehler(null);
    coreApi
      .pruefeEinladung(token)
      .then((res) => {
        if (!aktiv) return;
        setInfo(res.einladung);
        if (res.einladung.zielEmail) {
          setEmail(res.einladung.zielEmail);
        }
      })
      .catch((err) => {
        if (!aktiv) return;
        setLadeFehler(
          err instanceof CoreApiError
            ? err.message
            : 'Einladung konnte nicht geprüft werden.'
        );
      });
    return () => {
      aktiv = false;
    };
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFehler(null);
    setSendet(true);
    try {
      const res = await coreApi.akzeptiereEinladung(token, {
        benutzername,
        vollerName,
        email,
        passwort,
      });
      await onErfolgreichBeigetreten(res.token);
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setSendet(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-sl-canvas px-4 py-10 text-sl-primary">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="text-center font-display text-2xl font-bold tracking-tight text-sl-heading">
          <BrandWortmarke />
        </div>

        <div className="rounded-lg border border-sl-border bg-sl-surface p-6">
          {ladeFehler ? (
            <div className="space-y-4">
              <p className="text-xs text-sl-danger-text">{ladeFehler}</p>
              <button
                type="button"
                onClick={onZurAnmeldung}
                className="text-xs font-medium text-sl-accent hover:text-sl-accent-hover"
              >
                Zur Anmeldung
              </button>
            </div>
          ) : !info ? (
            <p className="py-6 text-center text-xs text-sl-muted">Prüfe Einladung…</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-sl-border pb-3">
                <UserPlus className="h-4 w-4 text-sl-accent" aria-hidden="true" />
                <h1 className="text-sm font-semibold text-sl-heading">Einladung annehmen</h1>
              </div>

              <div className="rounded-md border border-sl-border bg-sl-canvas p-3 text-xs space-y-1">
                <div className="font-semibold text-sl-heading">{info.clubName}</div>
                {info.teamName && (
                  <div className="text-sl-muted">
                    Team: <span className="text-sl-primary">{info.teamName}</span> ({info.teamRolle})
                  </div>
                )}
                {info.groups.length > 0 && (
                  <div className="text-sl-muted">Gruppen: {info.groups.join(', ')}</div>
                )}
              </div>

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

              <label className="block space-y-1 text-xs text-sl-muted">
                <span>Passwort (mind. 8 Zeichen)</span>
                <input
                  type="password"
                  required
                  minLength={8}
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
                disabled={sendet}
                className="flex w-full items-center justify-center gap-2 rounded-md bg-sl-accent py-2 text-xs font-semibold text-sl-accent-contrast transition-colors hover:bg-sl-accent-hover disabled:opacity-60"
              >
                {sendet ? 'Registriere Konto…' : 'Konto anlegen & beitreten'}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

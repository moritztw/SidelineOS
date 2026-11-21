import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { SpielerUnit } from '../../shared/types.ts';
import { SPIELER_UNIT_LABELS, TEAM_ROLLEN_LABELS } from '../../shared/types.ts';
import {
  CoreApiError,
  coreApi,
  type InviteAcceptResponse,
  type InviteCheckResponse,
} from '../apiClient.ts';

interface InviteRegisterViewProps {
  token: string;
  onBeigetreten: (ergebnis: InviteAcceptResponse) => void;
  onZurueckZumLogin: () => void;
}

const ALLE_UNITS: SpielerUnit[] = ['OFFENSE', 'DEFENSE', 'SPECIAL_TEAMS'];

export function InviteRegisterView({
  token,
  onBeigetreten,
  onZurueckZumLogin,
}: InviteRegisterViewProps) {
  const [ladePruefung, setLadePruefung] = useState(true);
  const [pruefungFehler, setPruefungFehler] = useState<{ status: number; nachricht: string } | null>(
    null
  );
  const [inviteInfo, setInviteInfo] = useState<InviteCheckResponse | null>(null);

  const [modus, setModus] = useState<'neu' | 'bestehend'>('neu');
  const [vollerName, setVollerName] = useState('');
  const [benutzername, setBenutzername] = useState('');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [passwortWiederholung, setPasswortWiederholung] = useState('');
  const [trikotNummer, setTrikotNummer] = useState('');
  const [position, setPosition] = useState('');
  const [telefon, setTelefon] = useState('');
  const [units, setUnits] = useState<SpielerUnit[]>(['OFFENSE']);
  const [customWerte, setCustomWerte] = useState<Record<string, string>>({});

  // Login-Daten für bestehendes Konto
  const [bestehendKennung, setBestehendKennung] = useState('');
  const [bestehendPasswort, setBestehendPasswort] = useState('');

  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [abgeschlossenStatus, setAbgeschlossenStatus] = useState<
    'AKTIV' | 'WARTET_AUF_FREIGABE' | null
  >(null);

  useEffect(() => {
    let aktiv = true;
    setLadePruefung(true);
    setPruefungFehler(null);
    setInviteInfo(null);

    coreApi
      .pruefeEinladung(token)
      .then((res) => {
        if (!aktiv) return;
        setInviteInfo(res);
        setUnits(res.invitation.units.length > 0 ? res.invitation.units : ['OFFENSE']);
        if (res.invitation.zielEmail) {
          setEmail(res.invitation.zielEmail);
        }
      })
      .catch((err) => {
        if (!aktiv) return;
        if (err instanceof CoreApiError) {
          setPruefungFehler({ status: err.status, nachricht: err.message });
        } else {
          setPruefungFehler({
            status: 500,
            nachricht: 'Einladungslink konnte nicht geprüft werden.',
          });
        }
      })
      .finally(() => {
        if (aktiv) setLadePruefung(false);
      });

    return () => {
      aktiv = false;
    };
  }, [token]);

  const toggleUnit = (u: SpielerUnit) => {
    setUnits((alt) => (alt.includes(u) ? alt.filter((item) => item !== u) : [...alt, u]));
  };

  if (ladePruefung) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E11] px-4 py-10 text-xs text-[#8B949E]">
        Einladungslink wird geprüft…
      </div>
    );
  }

  if (pruefungFehler || !inviteInfo) {
    const ist410 = pruefungFehler?.status === 410;
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E11] px-4 py-10 text-[#E6EDF3]">
        <div className="w-full max-w-md rounded-xl border border-[#232933] bg-[#13171D] p-6 space-y-4 text-center">
          <div className="mx-auto inline-flex rounded-full border border-[#DC2626]/40 bg-[#DC2626]/10 p-3 text-[#FCA5A5]">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="font-mono text-xs text-[#FCA5A5]">
            {ist410 ? 'HTTP 410 Gone' : 'HTTP 404 Not Found'}
          </div>
          <h1 className="text-base font-semibold text-white">Einladung nicht nutzbar</h1>
          <p className="text-xs leading-relaxed text-[#8B949E]">
            {pruefungFehler?.nachricht ?? 'Das zugehörige Team konnte nicht gefunden werden.'}
          </p>
          <button
            type="button"
            onClick={onZurueckZumLogin}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#232933] bg-[#0B0E11] px-4 py-2 text-xs font-medium text-white hover:border-[#F59E0B]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Zurück zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  const { invitation: einladung, team } = inviteInfo;

  if (abgeschlossenStatus === 'WARTET_AUF_FREIGABE') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E11] px-4 py-10 text-[#E6EDF3]">
        <div className="w-full max-w-md rounded-xl border border-[#F59E0B]/40 bg-[#13171D] p-6 space-y-4">
          <div className="inline-flex rounded-lg border border-[#F59E0B]/40 bg-[#F59E0B]/10 p-2.5 text-[#F59E0B]">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-semibold text-white">Registrierung eingegangen</h1>
          <p className="text-xs leading-relaxed text-[#8B949E]">
            Dein SidelineOS-Konto wurde in der Datenbank angelegt. Da dieser Team-Link eine
            Bestätigung vorsieht, prüft ein Team Admin von{' '}
            <strong className="text-white">{team.name}</strong> nun deine Anfrage unter{' '}
            <span className="font-mono text-[#E6EDF3]">Team-Einstellungen → Einladungen</span>.
          </p>
          <button
            type="button"
            onClick={onZurueckZumLogin}
            className="w-full rounded-md bg-[#F59E0B] py-2 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24]"
          >
            Zur Anmeldung
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFehler(null);

    if (modus === 'bestehend') {
      if (!bestehendKennung.trim() || !bestehendPasswort) {
        setFehler('Bitte Benutzername oder E-Mail sowie Passwort eingeben.');
        return;
      }
      setSendet(true);
      try {
        const res = await coreApi.akzeptiereEinladung(token, {
          modus: 'bestehend',
          kennung: bestehendKennung.trim(),
          passwort: bestehendPasswort,
          units: units.length > 0 ? units : ['OFFENSE'],
        });
        if (res.status === 'WARTET_AUF_FREIGABE') {
          setAbgeschlossenStatus('WARTET_AUF_FREIGABE');
        } else {
          onBeigetreten(res);
        }
      } catch (err) {
        setFehler(err instanceof Error ? err.message : 'Beitritt fehlgeschlagen.');
      } finally {
        setSendet(false);
      }
      return;
    }

    const nameClean = vollerName.trim();
    const mailClean = email.trim();
    const userClean = (benutzername.trim() || mailClean.split('@')[0] || '').toLowerCase();

    if (!nameClean || !mailClean.includes('@') || !userClean) {
      setFehler('Bitte vollen Namen, gültige E-Mail-Adresse und Benutzername angeben.');
      return;
    }
    if (passwort.length < 10) {
      setFehler('Das Passwort muss mindestens 10 Zeichen lang sein.');
      return;
    }
    if (passwort !== passwortWiederholung) {
      setFehler('Die Passwörter stimmen nicht überein.');
      return;
    }

    for (const feld of team.customProfilFelder) {
      if (feld.pflicht && !(customWerte[feld.key] ?? '').trim()) {
        setFehler(`Bitte das Pflichtfeld „${feld.label}“ ausfüllen.`);
        return;
      }
    }

    setSendet(true);
    try {
      const res = await coreApi.akzeptiereEinladung(token, {
        modus: 'neu',
        vollerName: nameClean,
        benutzername: userClean,
        email: mailClean,
        passwort,
        telefon: telefon.trim(),
        trikotNummer: trikotNummer.trim(),
        position: position.trim(),
        units: units.length > 0 ? units : ['OFFENSE'],
        customProfilWerte: { ...customWerte },
      });
      if (res.status === 'WARTET_AUF_FREIGABE') {
        setAbgeschlossenStatus('WARTET_AUF_FREIGABE');
      } else {
        onBeigetreten(res);
      }
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Registrierung fehlgeschlagen.');
    } finally {
      setSendet(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0E11] px-4 py-8 text-[#E6EDF3]">
      <div className="mx-auto max-w-xl space-y-5">
        <div className="flex items-center justify-between">
          <div className="font-display text-lg font-bold tracking-tight text-white">
            Sideline<span className="text-[#F59E0B]">OS</span>
          </div>
          <button
            type="button"
            onClick={onZurueckZumLogin}
            className="inline-flex items-center gap-1.5 text-xs text-[#8B949E] hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Zur Anmeldung
          </button>
        </div>

        {/* Einladungs-Banner */}
        <section className="rounded-xl border border-[#F59E0B]/40 bg-[#13171D] p-5 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#F59E0B]">
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Teameinladung · {team.name}
            </div>
            <span className="font-mono text-[11px] text-[#8B949E]">
              Rolle: {TEAM_ROLLEN_LABELS[einladung.rolle]} · Saison {team.aktiveSaison}
            </span>
          </div>
          <p className="text-xs text-[#8B949E]">
            {einladung.bestaetigungErforderlich
              ? 'Nach der Registrierung prüft und bestätigt ein Team Admin deinen Beitritt.'
              : 'Direkte Einladung: Nach Abschluss bist du sofort im Team freigeschaltet.'}
          </p>
        </section>

        {/* Modus-Umschalter */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-[#232933] bg-[#13171D] p-1">
          <button
            type="button"
            onClick={() => {
              setModus('neu');
              setFehler(null);
            }}
            className={`rounded-md py-2 text-xs font-medium transition-colors ${
              modus === 'neu' ? 'bg-[#232933] text-white' : 'text-[#8B949E] hover:text-white'
            }`}
          >
            Neues Konto erstellen
          </button>
          <button
            type="button"
            onClick={() => {
              setModus('bestehend');
              setFehler(null);
            }}
            className={`rounded-md py-2 text-xs font-medium transition-colors ${
              modus === 'bestehend'
                ? 'bg-[#232933] text-white'
                : 'text-[#8B949E] hover:text-white'
            }`}
          >
            Bestehendes Konto verknüpfen
          </button>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-xl border border-[#232933] bg-[#13171D] p-6 space-y-4"
        >
          {modus === 'bestehend' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
                Mit vorhandenem SidelineOS-Konto beitreten
              </div>
              <label className="block space-y-1 text-xs text-[#8B949E]">
                <span>E-Mail oder Benutzername</span>
                <input
                  type="text"
                  value={bestehendKennung}
                  onChange={(e) => setBestehendKennung(e.target.value)}
                  className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                />
              </label>
              <label className="block space-y-1 text-xs text-[#8B949E]">
                <span>Passwort</span>
                <input
                  type="password"
                  value={bestehendPasswort}
                  onChange={(e) => setBestehendPasswort(e.target.value)}
                  className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                />
              </label>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>Voller Name *</span>
                  <input
                    type="text"
                    value={vollerName}
                    onChange={(e) => setVollerName(e.target.value)}
                    placeholder="Max Mustermann"
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>Benutzername *</span>
                  <input
                    type="text"
                    value={benutzername}
                    onChange={(e) => setBenutzername(e.target.value)}
                    placeholder="m.mustermann"
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>E-Mail-Adresse *</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    readOnly={Boolean(einladung.zielEmail)}
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white read-only:opacity-75 focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>Telefon / Kontakt</span>
                  <input
                    type="tel"
                    value={telefon}
                    onChange={(e) => setTelefon(e.target.value)}
                    placeholder="+49 170 ..."
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>Trikotnummer (#)</span>
                  <input
                    type="text"
                    value={trikotNummer}
                    onChange={(e) => setTrikotNummer(e.target.value)}
                    placeholder="z. B. 22"
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>Position(en)</span>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="z. B. RB / LB"
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>Passwort (mind. 10 Zeichen) *</span>
                  <input
                    type="password"
                    value={passwort}
                    onChange={(e) => setPasswort(e.target.value)}
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
                <label className="space-y-1 text-xs text-[#8B949E]">
                  <span>Passwort bestätigen *</span>
                  <input
                    type="password"
                    value={passwortWiederholung}
                    onChange={(e) => setPasswortWiederholung(e.target.value)}
                    className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                  />
                </label>
              </div>

              {team.customProfilFelder.length > 0 && (
                <div className="space-y-3 border-t border-[#232933] pt-3">
                  <div className="text-xs font-medium text-[#E6EDF3]">
                    Team-Zusatzfelder ({team.name})
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {team.customProfilFelder.map((feld) => (
                      <label key={feld.key} className="space-y-1 text-xs text-[#8B949E]">
                        <span>
                          {feld.label}
                          {feld.pflicht && <span className="ml-1 text-[#F59E0B]">*</span>}
                        </span>
                        {feld.typ === 'select' ? (
                          <select
                            value={customWerte[feld.key] ?? ''}
                            onChange={(e) =>
                              setCustomWerte((alt) => ({ ...alt, [feld.key]: e.target.value }))
                            }
                            className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                          >
                            <option value="">Bitte wählen…</option>
                            {(feld.optionen ?? []).map((opt) => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type={feld.typ === 'number' ? 'number' : 'text'}
                            value={customWerte[feld.key] ?? ''}
                            onChange={(e) =>
                              setCustomWerte((alt) => ({ ...alt, [feld.key]: e.target.value }))
                            }
                            className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                          />
                        )}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="space-y-1.5 border-t border-[#232933] pt-3">
            <div className="text-xs text-[#8B949E]">Units (Mehrfachwahl für Two-Way-Spieler)</div>
            <div className="flex flex-wrap gap-3">
              {ALLE_UNITS.map((u) => (
                <label
                  key={u}
                  className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-[#E6EDF3]"
                >
                  <input
                    type="checkbox"
                    checked={units.includes(u)}
                    onChange={() => toggleUnit(u)}
                    className="h-3.5 w-3.5 accent-[#F59E0B]"
                  />
                  <span>{SPIELER_UNIT_LABELS[u]}</span>
                </label>
              ))}
            </div>
          </div>

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
            disabled={sendet}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-[#F59E0B] py-2 text-xs font-semibold text-[#0B0E11] hover:bg-[#FBBF24] disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {sendet
              ? 'Wird gesendet…'
              : einladung.bestaetigungErforderlich
                ? 'Registrieren & Freigabe anfragen'
                : 'Registrieren & Team beitreten'}
          </button>
        </form>
      </div>
    </div>
  );
}

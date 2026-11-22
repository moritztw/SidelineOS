import { useEffect, useState } from 'react';
import { Lock, Save, User } from 'lucide-react';
import {
  UNTERSTUETZTE_SPRACHEN,
  type UnterstuetzteSprache,
} from '../../shared/i18n.ts';
import type {
  BenutzerKonto,
  S3Konfiguration,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from '../../shared/types.ts';
import { holeRollenLabel, holeUnitLabel } from '../../shared/types.ts';
import type { PluginSettingsKontext, SidelinePlugin } from '../../sdk/plugin.ts';
import { useI18n } from '../i18n/I18nContext.tsx';
import { SettingsShell, type SettingsKategorie } from '../layout/SettingsShell.tsx';

export interface ApiAktionErgebnis {
  ok: boolean;
  fehler?: string;
}

interface UserSettingsPageProps {
  benutzer: BenutzerKonto;
  team: TeamKontext;
  mitgliedschaft: TeamMitgliedschaft | null;
  aktiveTeamAnsicht: TeamRolle;
  s3Konfig: S3Konfiguration;
  aktivePlugins: SidelinePlugin[];
  onProfilSpeichern: (daten: {
    vollerName: string;
    telefon: string;
    trikotNummer: string;
    position: string;
    customProfilWerte: Record<string, string>;
  }) => Promise<ApiAktionErgebnis>;
  onZugangSpeichern: (daten: {
    benutzername: string;
    email: string;
    preferredLocale?: UnterstuetzteSprache;
    altesPasswort?: string;
    neuesPasswort?: string;
  }) => Promise<ApiAktionErgebnis>;
  onSpracheSpeichern: (sprache: UnterstuetzteSprache) => Promise<ApiAktionErgebnis>;
  onZurueck?: () => void;
}

export function UserSettingsPage({
  benutzer,
  team,
  mitgliedschaft,
  aktiveTeamAnsicht,
  s3Konfig,
  aktivePlugins,
  onProfilSpeichern,
  onZugangSpeichern,
  onSpracheSpeichern,
  onZurueck,
}: UserSettingsPageProps) {
  const { locale, setLocale, t } = useI18n();
  const [vollerName, setVollerName] = useState(benutzer.vollerName);
  const [trikotNummer, setTrikotNummer] = useState(benutzer.trikotNummer ?? '');
  const [position, setPosition] = useState(benutzer.position ?? '');
  const [telefon, setTelefon] = useState(benutzer.telefon ?? '');
  const [customWerte, setCustomWerte] = useState<Record<string, string>>(
    benutzer.customProfilWerte
  );
  const [profilHinweis, setProfilHinweis] = useState<string | null>(null);
  const [profilFehler, setProfilFehler] = useState<string | null>(null);
  const [speichertProfil, setSpeichertProfil] = useState(false);

  const [benutzername, setBenutzername] = useState(benutzer.benutzername);
  const [email, setEmail] = useState(benutzer.email);
  const [gewaehlteSprache, setGewaehlteSprache] = useState<UnterstuetzteSprache>(
    benutzer.preferredLocale ?? locale
  );
  const [passwortAktuell, setPasswortAktuell] = useState('');
  const [passwortNeu, setPasswortNeu] = useState('');
  const [passwortWiederholung, setPasswortWiederholung] = useState('');
  const [kontoHinweis, setKontoHinweis] = useState<string | null>(null);
  const [kontoFehler, setKontoFehler] = useState<string | null>(null);
  const [speichertKonto, setSpeichertKonto] = useState(false);

  useEffect(() => {
    setVollerName(benutzer.vollerName);
    setTrikotNummer(benutzer.trikotNummer ?? '');
    setPosition(benutzer.position ?? '');
    setTelefon(benutzer.telefon ?? '');
    setCustomWerte(benutzer.customProfilWerte);
    setBenutzername(benutzer.benutzername);
    setEmail(benutzer.email);
    setGewaehlteSprache(benutzer.preferredLocale ?? locale);
    setProfilHinweis(null);
    setProfilFehler(null);
    setKontoHinweis(null);
    setKontoFehler(null);
  }, [benutzer, locale]);

  const handleProfilSpeichern = async () => {
    setProfilFehler(null);
    setProfilHinweis(null);
    const nameBereinigt = vollerName.trim();
    if (!nameBereinigt) {
      setProfilFehler(t('userSettings.errNameRequired'));
      return;
    }

    setSpeichertProfil(true);
    try {
      const res = await onProfilSpeichern({
        vollerName: nameBereinigt,
        trikotNummer: trikotNummer.trim(),
        position: position.trim(),
        telefon: telefon.trim(),
        customProfilWerte: { ...customWerte },
      });
      if (!res.ok) {
        setProfilFehler(res.fehler ?? t('userSettings.profileSaveError'));
        return;
      }
      setProfilHinweis(t('userSettings.profileSaved'));
      setTimeout(() => setProfilHinweis(null), 2400);
    } finally {
      setSpeichertProfil(false);
    }
  };

  const handleSpracheSofortWechseln = async (zielSprache: UnterstuetzteSprache) => {
    setGewaehlteSprache(zielSprache);
    setLocale(zielSprache);
    setKontoFehler(null);
    const res = await onSpracheSpeichern(zielSprache);
    if (!res.ok) {
      setKontoFehler(res.fehler ?? t('userSettings.accountSaveError'));
    }
  };

  const handleKontoSpeichern = async () => {
    setKontoFehler(null);
    setKontoHinweis(null);

    const userBereinigt = benutzername.trim();
    const mailBereinigt = email.trim();
    if (!userBereinigt || !mailBereinigt.includes('@')) {
      setKontoFehler(t('userSettings.errCredentials'));
      return;
    }

    if (passwortNeu || passwortWiederholung) {
      if (!passwortAktuell) {
        setKontoFehler(t('userSettings.errCurrentPassword'));
        return;
      }
      if (passwortNeu.length < 10) {
        setKontoFehler(t('userSettings.errPasswordMin'));
        return;
      }
      if (passwortNeu !== passwortWiederholung) {
        setKontoFehler(t('userSettings.errPasswordMatch'));
        return;
      }
    }

    setSpeichertKonto(true);
    try {
      const res = await onZugangSpeichern({
        benutzername: userBereinigt,
        email: mailBereinigt,
        preferredLocale: gewaehlteSprache,
        ...(passwortNeu
          ? { altesPasswort: passwortAktuell, neuesPasswort: passwortNeu }
          : {}),
      });
      if (!res.ok) {
        setKontoFehler(res.fehler ?? t('userSettings.accountSaveError'));
        return;
      }
      setLocale(gewaehlteSprache);
      setPasswortAktuell('');
      setPasswortNeu('');
      setPasswortWiederholung('');
      setKontoHinweis(
        passwortNeu
          ? t('userSettings.accountPasswordSaved')
          : t('userSettings.accountSaved')
      );
      setTimeout(() => setKontoHinweis(null), 2600);
    } finally {
      setSpeichertKonto(false);
    }
  };

  const kategorien: SettingsKategorie[] = [
    {
      id: 'profil',
      label: t('userSettings.catProfile'),
      gruppe: t('userSettings.groupAccount'),
    },
    {
      id: 'konto',
      label: t('userSettings.catAccount'),
      gruppe: t('userSettings.groupAccount'),
    },
  ];

  const pluginsMitPanel = aktivePlugins.filter((p) => Boolean(p.settingsPanels?.user));
  for (const plugin of pluginsMitPanel) {
    for (const anker of plugin.manifest.settingsAnker.user ?? []) {
      kategorien.push({
        id: anker.id,
        label: anker.label,
        gruppe: `Plugin: ${plugin.manifest.name}`,
        badge: anker.badge,
      });
    }
  }

  const settingsKontext: PluginSettingsKontext = {
    team,
    benutzer,
    aktiveTeamAnsicht,
    s3Konfig,
    locale,
  };

  return (
    <SettingsShell
      titel={t('userSettings.title')}
      untertitel={t('userSettings.subtitle', {
        role: holeRollenLabel(aktiveTeamAnsicht, locale),
        team: team.name,
      })}
      kategorien={kategorien}
      zurueckLabel={t('settingsShell.allSettings')}
      onZurueck={onZurueck}
    >
      {/* Sektion 1: Spieler- & Nutzerprofil */}
      <section
        id="profil"
        className="scroll-mt-20 space-y-4 rounded-lg border border-[#232933] bg-[#13171D] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">{t('userSettings.profileHeading')}</h2>
          </div>
          {mitgliedschaft && (
            <span className="font-mono text-[11px] text-[#8B949E]">
              {t('userSettings.unitsPrefix')}{' '}
              <span className="text-[#E6EDF3]">
                {mitgliedschaft.units.length > 0
                  ? mitgliedschaft.units.map((u) => holeUnitLabel(u, locale)).join(' · ')
                  : t('userSettings.noUnit')}
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.fullName')}</span>
            <input
              type="text"
              value={vollerName}
              onChange={(e) => setVollerName(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.phone')}</span>
            <input
              type="tel"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="+49 170 ..."
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.jersey')}</span>
            <input
              type="text"
              value={trikotNummer}
              onChange={(e) => setTrikotNummer(e.target.value)}
              placeholder="14"
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 font-mono text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.position')}</span>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="WR / CB / LB"
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        {team.customProfilFelder.length > 0 && (
          <div className="space-y-3 border-t border-[#232933] pt-4">
            <div className="text-xs font-medium text-[#E6EDF3]">
              {t('userSettings.customFieldsTitle', { team: team.name })}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                      <option value="">{t('userSettings.pleaseSelect')}</option>
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

        {profilFehler && <p className="text-xs text-[#FCA5A5]">{profilFehler}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-[#86EFAC]">{profilHinweis ?? ''}</span>
          <button
            type="button"
            disabled={speichertProfil}
            onClick={() => void handleProfilSpeichern()}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#F59E0B] px-3.5 py-2 text-xs font-semibold text-[#0B0E11] transition-colors hover:bg-[#FBBF24] disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {speichertProfil ? t('userSettings.saving') : t('userSettings.saveProfile')}
          </button>
        </div>
      </section>

      {/* Sektion 2: Zugang, Sprache, E-Mail & Passwort */}
      <section
        id="konto"
        className="scroll-mt-20 space-y-4 rounded-lg border border-[#232933] bg-[#13171D] p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-[#F59E0B]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">{t('userSettings.accountHeading')}</h2>
          </div>
          <span className="font-mono text-[11px] text-[#6E7681]">ID: {benutzer.uuid}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.username')}</span>
            <input
              type="text"
              value={benutzername}
              onChange={(e) => setBenutzername(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.languageLabel')}</span>
            <select
              aria-label={t('nav.languageAria')}
              value={gewaehlteSprache}
              onChange={(e) =>
                void handleSpracheSofortWechseln(e.target.value as UnterstuetzteSprache)
              }
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            >
              {UNTERSTUETZTE_SPRACHEN.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-[#13171D]">
                  {lang.eigenname} ({lang.code.toUpperCase()})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 border-t border-[#232933] pt-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.currentPassword')}</span>
            <input
              type="password"
              value={passwortAktuell}
              onChange={(e) => setPasswortAktuell(e.target.value)}
              placeholder={t('userSettings.currentPasswordPlaceholder')}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white placeholder-[#484F58] focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.newPassword')}</span>
            <input
              type="password"
              value={passwortNeu}
              onChange={(e) => setPasswortNeu(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-[#8B949E]">
            <span>{t('userSettings.confirmPassword')}</span>
            <input
              type="password"
              value={passwortWiederholung}
              onChange={(e) => setPasswortWiederholung(e.target.value)}
              className="w-full rounded border border-[#232933] bg-[#0B0E11] px-3 py-2 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
            />
          </label>
        </div>

        {kontoFehler && <p className="text-xs text-[#FCA5A5]">{kontoFehler}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-[#86EFAC]">{kontoHinweis ?? ''}</span>
          <button
            type="button"
            disabled={speichertKonto}
            onClick={() => void handleKontoSpeichern()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#232933] bg-[#1E2530] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:border-[#F59E0B] disabled:opacity-60"
          >
            {speichertKonto ? t('userSettings.saving') : t('userSettings.updateAccount')}
          </button>
        </div>

        <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-3 text-xs text-[#8B949E]">
          <strong className="font-medium text-[#E6EDF3]">
            {t('userSettings.portabilityTitle')}
          </strong>{' '}
          {t('userSettings.portabilityBody')}
        </div>
      </section>

      {/* Dynamische Einstellungs-Panels aller fürs Team aktiven Plugins */}
      {pluginsMitPanel.map((plugin) => {
        const UserPanel = plugin.settingsPanels!.user!;
        return <UserPanel key={plugin.manifest.id} ctx={settingsKontext} />;
      })}
    </SettingsShell>
  );
}

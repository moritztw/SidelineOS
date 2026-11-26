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
import {
  STANDARD_THEME_REF,
  type VerfuegbaresThemeEintrag,
} from '../../shared/theme.ts';
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
  verfuegbareThemes?: VerfuegbaresThemeEintrag[];
  instanceDefaultTheme?: string;
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
  onThemeSpeichern?: (themeRef: string | null) => Promise<ApiAktionErgebnis>;
  onZurueck?: () => void;
}

export function UserSettingsPage({
  benutzer,
  team,
  mitgliedschaft,
  aktiveTeamAnsicht,
  s3Konfig,
  aktivePlugins,
  verfuegbareThemes = [],
  instanceDefaultTheme = STANDARD_THEME_REF,
  onProfilSpeichern,
  onZugangSpeichern,
  onSpracheSpeichern,
  onThemeSpeichern,
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

  const handleThemeSofortWechseln = async (zielWert: string) => {
    if (!onThemeSpeichern) return;
    setKontoFehler(null);
    setKontoHinweis(null);
    const res = await onThemeSpeichern(zielWert ? zielWert : null);
    if (!res.ok) {
      setKontoFehler(res.fehler ?? t('userSettings.themeSaveError'));
      return;
    }
    setKontoHinweis(t('userSettings.themeSaved'));
    setTimeout(() => setKontoHinweis(null), 2400);
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
        className="scroll-mt-20 space-y-4 rounded-lg border border-sl-border bg-sl-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-border pb-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-sl-heading">{t('userSettings.profileHeading')}</h2>
          </div>
          {mitgliedschaft && (
            <span className="font-mono text-[11px] text-sl-muted">
              {t('userSettings.unitsPrefix')}{' '}
              <span className="text-sl-primary">
                {mitgliedschaft.units.length > 0
                  ? mitgliedschaft.units.map((u) => holeUnitLabel(u, locale)).join(' · ')
                  : t('userSettings.noUnit')}
              </span>
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.fullName')}</span>
            <input
              type="text"
              value={vollerName}
              onChange={(e) => setVollerName(e.target.value)}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.phone')}</span>
            <input
              type="tel"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="+49 170 ..."
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.jersey')}</span>
            <input
              type="text"
              value={trikotNummer}
              onChange={(e) => setTrikotNummer(e.target.value)}
              placeholder="14"
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 font-mono text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.position')}</span>
            <input
              type="text"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              placeholder="WR / CB / LB"
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
          </label>
        </div>

        {team.customProfilFelder.length > 0 && (
          <div className="space-y-3 border-t border-sl-border pt-4">
            <div className="text-xs font-medium text-sl-primary">
              {t('userSettings.customFieldsTitle', { team: team.name })}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {team.customProfilFelder.map((feld) => (
                <label key={feld.key} className="space-y-1 text-xs text-sl-muted">
                  <span>
                    {feld.label}
                    {feld.pflicht && <span className="ml-1 text-sl-accent">*</span>}
                  </span>
                  {feld.typ === 'select' ? (
                    <select
                      value={customWerte[feld.key] ?? ''}
                      onChange={(e) =>
                        setCustomWerte((alt) => ({ ...alt, [feld.key]: e.target.value }))
                      }
                      className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
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
                      className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
                    />
                  )}
                </label>
              ))}
            </div>
          </div>
        )}

        {profilFehler && <p className="text-xs text-sl-danger-text">{profilFehler}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <span className="text-xs text-sl-success-text">{profilHinweis ?? ''}</span>
          <button
            type="button"
            disabled={speichertProfil}
            onClick={() => void handleProfilSpeichern()}
            className="inline-flex items-center gap-1.5 rounded-md bg-sl-accent px-3.5 py-2 text-xs font-semibold text-sl-accent-contrast transition-colors hover:bg-sl-accent-hover disabled:opacity-60"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {speichertProfil ? t('userSettings.saving') : t('userSettings.saveProfile')}
          </button>
        </div>
      </section>

      {/* Sektion 2: Zugang, Sprache, E-Mail & Passwort */}
      <section
        id="konto"
        className="scroll-mt-20 space-y-4 rounded-lg border border-sl-border bg-sl-surface p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sl-border pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-sl-heading">{t('userSettings.accountHeading')}</h2>
          </div>
          <span className="font-mono text-[11px] text-sl-subtle">ID: {benutzer.uuid}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.username')}</span>
            <input
              type="text"
              value={benutzername}
              onChange={(e) => setBenutzername(e.target.value)}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 font-mono text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.email')}</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.languageLabel')}</span>
            <select
              aria-label={t('nav.languageAria')}
              value={gewaehlteSprache}
              onChange={(e) =>
                void handleSpracheSofortWechseln(e.target.value as UnterstuetzteSprache)
              }
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            >
              {UNTERSTUETZTE_SPRACHEN.map((lang) => (
                <option key={lang.code} value={lang.code} className="bg-sl-surface">
                  {lang.eigenname} ({lang.code.toUpperCase()})
                </option>
              ))}
            </select>
          </label>
        </div>

        {onThemeSpeichern && (
          <div className="space-y-1.5 border-t border-sl-border pt-4">
            <label className="block space-y-1 text-xs text-sl-muted sm:max-w-md">
              <span>{t('userSettings.themeLabel')}</span>
              <select
                aria-label={t('userSettings.themeLabel')}
                value={
                  benutzer.preferredTheme &&
                  (benutzer.preferredTheme === STANDARD_THEME_REF ||
                    verfuegbareThemes.some((th) => th.themeRef === benutzer.preferredTheme))
                    ? benutzer.preferredTheme
                    : ''
                }
                onChange={(e) => void handleThemeSofortWechseln(e.target.value)}
                className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
              >
                <option value="" className="bg-sl-surface">
                  {t('userSettings.themeInstanceDefault', {
                    theme:
                      verfuegbareThemes.find((th) => th.themeRef === instanceDefaultTheme)?.preset
                        .name ?? t('userSettings.themeCoreDefault'),
                  })}
                </option>
                <option value={STANDARD_THEME_REF} className="bg-sl-surface">
                  {t('userSettings.themeCoreDefault')}
                </option>
                {Array.from(
                  verfuegbareThemes.reduce<Map<string, VerfuegbaresThemeEintrag[]>>((map, eintrag) => {
                    const gruppe = eintrag.pluginName ?? eintrag.pluginId ?? 'Plugin';
                    const liste = map.get(gruppe) ?? [];
                    liste.push(eintrag);
                    map.set(gruppe, liste);
                    return map;
                  }, new Map())
                ).map(([gruppe, eintraege]) => (
                  <optgroup key={gruppe} label={gruppe} className="bg-sl-surface">
                    {eintraege.map((eintrag) => (
                      <option
                        key={eintrag.themeRef}
                        value={eintrag.themeRef}
                        className="bg-sl-surface"
                      >
                        {eintrag.preset.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            {verfuegbareThemes.length === 0 && (
              <p className="text-[11px] text-sl-subtle">{t('userSettings.themeNoPluginsHint')}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 border-t border-sl-border pt-4 sm:grid-cols-3">
          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.currentPassword')}</span>
            <input
              type="password"
              value={passwortAktuell}
              onChange={(e) => setPasswortAktuell(e.target.value)}
              placeholder={t('userSettings.currentPasswordPlaceholder')}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.newPassword')}</span>
            <input
              type="password"
              value={passwortNeu}
              onChange={(e) => setPasswortNeu(e.target.value)}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>

          <label className="space-y-1 text-xs text-sl-muted">
            <span>{t('userSettings.confirmPassword')}</span>
            <input
              type="password"
              value={passwortWiederholung}
              onChange={(e) => setPasswortWiederholung(e.target.value)}
              className="w-full rounded border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
            />
          </label>
        </div>

        {kontoFehler && <p className="text-xs text-sl-danger-text">{kontoFehler}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <span className="text-xs text-sl-success-text">{kontoHinweis ?? ''}</span>
          <button
            type="button"
            disabled={speichertKonto}
            onClick={() => void handleKontoSpeichern()}
            className="inline-flex items-center gap-1.5 rounded-md border border-sl-border bg-sl-elevated px-3.5 py-2 text-xs font-medium text-sl-heading transition-colors hover:border-sl-accent disabled:opacity-60"
          >
            {speichertKonto ? t('userSettings.saving') : t('userSettings.updateAccount')}
          </button>
        </div>

        <div className="rounded-md border border-sl-border bg-sl-canvas p-3 text-xs text-sl-muted">
          <strong className="font-medium text-sl-primary">
            {t('userSettings.portabilityTitle')}
          </strong>{' '}
          {t('userSettings.portabilityBody')}
        </div>
      </section>

      {/* Dynamische Einstellungs-Panels aller fürs Team aktiven Plugins */}
      {pluginsMitPanel.map((plugin) => {
        const UserPanel = plugin.settingsPanels!.user!;
        return (
          <UserPanel
            key={`${plugin.manifest.id}@${plugin.manifest.version}`}
            ctx={settingsKontext}
          />
        );
      })}
    </SettingsShell>
  );
}

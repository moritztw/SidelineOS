import { useMemo, useState, type ReactNode } from 'react';
import { Eye, RotateCcw } from 'lucide-react';
import { CoreTopBar } from './core/layout/CoreTopBar.tsx';
import { SidelineHubView } from './core/hub/SidelineHubView.tsx';
import { SettingsHubView } from './core/settings/SettingsHubView.tsx';
import { UserSettingsPage } from './core/settings/UserSettingsPage.tsx';
import { TeamSettingsPage } from './core/settings/TeamSettingsPage.tsx';
import { SysadminPage } from './core/settings/SysadminPage.tsx';
import {
  INITIALE_BENUTZER,
  INITIALE_EINLADUNGEN,
  INITIALE_MITGLIEDSCHAFTEN,
  INITIALE_S3_KONFIG,
  INITIALE_SMTP_KONFIG,
  INITIALE_TEAMS,
} from './core/demoOrgData.ts';
import {
  OFFIZIELLER_PLUGIN_KATALOG,
  STANDARD_AKTIVIERTE_PLUGIN_IDS,
  STANDARD_INSTALLIERTE_PLUGIN_IDS,
} from './core/pluginStoreCatalog.ts';
import {
  erstelleCustomPluginManifest,
  findePlugin,
  istPluginFuerTeamAktiv,
} from './core/pluginRegistry.ts';
import { fuegeNeueSaisonHinzu } from './core/seasonUtils.ts';
import {
  darfAnsichtWechseln,
  ermittleWaehlbareTeamAnsichten,
} from './core/rolePermissions.ts';
import { ladeInstalliertePlugins } from './plugins/pluginLoader.ts';
import type {
  PluginLaufzeitKontext,
  PluginStoreEintrag,
  SidelinePlugin,
} from './sdk/plugin.ts';
import type {
  BenutzerKonto,
  BenutzerProfil,
  CoreBereich,
  PluginId,
  ProfilCustomFeld,
  S3Konfiguration,
  SmtpKonfiguration,
  SpielerUnit,
  TeamEinladung,
  TeamKontext,
  TeamMitgliedschaft,
  TeamRolle,
} from './shared/types.ts';
import { DEMO_PROFILE, TEAM_ROLLEN_LABELS } from './shared/types.ts';

/**
 * Schachtelt alle optionalen React-Provider der installierten Plugins um den App-Kern,
 * sodass jedes Plugin seinen eigenen Zustand unabhängig von `App.tsx` verwaltet.
 */
function PluginProviderStack({
  plugins,
  children,
}: {
  plugins: SidelinePlugin[];
  children: ReactNode;
}) {
  return plugins.reduceRight<ReactNode>((acc, plugin) => {
    const Provider = plugin.Provider;
    return Provider ? <Provider>{acc}</Provider> : acc;
  }, children);
}

interface SidelineShellProps {
  storeKatalog: PluginStoreEintrag[];
  installiertePlugins: SidelinePlugin[];
  installiertePluginIds: PluginId[];
  globalAktivierteModule: PluginId[];
  onPluginInstallieren: (pluginId: PluginId) => void;
  onPluginDeinstallieren: (pluginId: PluginId) => void;
  onCustomGitHubPluginHinzufuegen: (repoUrl: string, slug: string) => void;
  onGlobalModulToggle: (modulId: PluginId) => void;
}

function SidelineCoreShell({
  storeKatalog,
  installiertePlugins,
  installiertePluginIds,
  globalAktivierteModule,
  onPluginInstallieren,
  onPluginDeinstallieren,
  onCustomGitHubPluginHinzufuegen,
  onGlobalModulToggle,
}: SidelineShellProps) {
  // Core-Navigation (Startseite, aktives Plugin, Plugin-Tab, zentrale Einstellungen)
  const [bereich, setBereich] = useState<CoreBereich>('hub');
  const [aktivesPluginId, setAktivesPluginId] = useState<PluginId | null>(null);
  const [aktiverPluginTab, setAktiverPluginTab] = useState<string>('');

  // Konto & produktiver Rollen-Ansichtsumschalter
  const [kontoId, setKontoId] = useState<string>(DEMO_PROFILE[0].id);
  const [aktiveTeamAnsicht, setAktiveTeamAnsicht] = useState<TeamRolle | null>(
    DEMO_PROFILE[0].teamRolle
  );

  // Core-Plattform-Zustand (Teams, Benutzer, Mitgliedschaften, Einladungen, S3 & SMTP)
  const [teams, setTeams] = useState<TeamKontext[]>(INITIALE_TEAMS);
  const [aktivesTeamId, setAktivesTeamId] = useState<string>(INITIALE_TEAMS[0].id);
  const [gewaehlteSaison, setGewaehlteSaison] = useState<string>(INITIALE_TEAMS[0].aktiveSaison);
  const [benutzerListe, setBenutzerListe] = useState<BenutzerKonto[]>(INITIALE_BENUTZER);
  const [mitgliedschaften, setMitgliedschaften] = useState<TeamMitgliedschaft[]>(
    INITIALE_MITGLIEDSCHAFTEN
  );
  const [einladungen, setEinladungen] = useState<TeamEinladung[]>(INITIALE_EINLADUNGEN);
  const [s3Konfig, setS3Konfig] = useState<S3Konfiguration>(INITIALE_S3_KONFIG);
  const [smtpKonfig, setSmtpKonfig] = useState<SmtpKonfiguration>(INITIALE_SMTP_KONFIG);

  const konto: BenutzerProfil = DEMO_PROFILE.find((p) => p.id === kontoId) ?? DEMO_PROFILE[0];
  const aktivesTeam = teams.find((t) => t.id === aktivesTeamId) ?? teams[0];
  const aktuellerBenutzer =
    benutzerListe.find((b) => b.uuid === konto.userUuid) ?? benutzerListe[0];
  const aktuelleMitgliedschaft =
    mitgliedschaften.find(
      (m) => m.userUuid === konto.userUuid && m.teamId === aktivesTeam.id
    ) ?? null;

  const waehlbareAnsichten = ermittleWaehlbareTeamAnsichten(konto);
  const kannAnsichtWechseln = darfAnsichtWechseln(konto);
  const istVorschauModus =
    aktiveTeamAnsicht !== null &&
    konto.teamRolle !== null &&
    aktiveTeamAnsicht !== konto.teamRolle;

  const aktiveTeamPlugins = useMemo(
    () =>
      aktiveTeamAnsicht === null
        ? []
        : installiertePlugins.filter((plugin) =>
            istPluginFuerTeamAktiv(
              plugin.manifest.id,
              installiertePluginIds,
              globalAktivierteModule,
              aktivesTeam.aktivierteModule
            )
          ),
    [
      aktiveTeamAnsicht,
      installiertePlugins,
      installiertePluginIds,
      globalAktivierteModule,
      aktivesTeam.aktivierteModule,
    ]
  );

  const aktivesPlugin = useMemo(
    () =>
      findePlugin(aktiveTeamPlugins, aktivesPluginId) ?? null,
    [aktiveTeamPlugins, aktivesPluginId]
  );

  const aktiveSaisonAuswahl =
    gewaehlteSaison === 'ALL' || aktivesTeam.saisons.includes(gewaehlteSaison)
      ? gewaehlteSaison
      : aktivesTeam.aktiveSaison;

  const ausstehendeAnfragenAnzahl = mitgliedschaften.filter(
    (m) => m.teamId === aktivesTeam.id && m.status === 'WARTET_AUF_FREIGABE'
  ).length;

  // --- Navigation ---
  const handleLogoKlick = () => {
    setAktivesPluginId(null);
    setBereich(aktiveTeamAnsicht === null ? 'sysadmin' : 'hub');
  };

  const handleBereichWechseln = (ziel: CoreBereich) => {
    if (ziel !== 'modul') {
      setAktivesPluginId(null);
    }
    setBereich(ziel);
  };

  const handleModulOeffnen = (pluginId: PluginId) => {
    const ziel = findePlugin(aktiveTeamPlugins, pluginId);
    if (!ziel) return;
    setAktivesPluginId(pluginId);
    setAktiverPluginTab(ziel.defaultTab);
    setBereich('modul');
  };

  const handleKontoWechseln = (neueId: string) => {
    const neu = DEMO_PROFILE.find((p) => p.id === neueId);
    if (!neu) return;
    setKontoId(neueId);
    setAktiveTeamAnsicht(neu.teamRolle);

    if (neu.teamRolle === null) {
      setAktivesPluginId(null);
      setBereich('sysadmin');
      return;
    }
    if (!neu.istSysadmin && bereich === 'sysadmin') {
      setAktivesPluginId(null);
      setBereich('hub');
      return;
    }
    if (neu.teamRolle !== 'TEAM_ADMIN' && bereich === 'team-settings') {
      setAktivesPluginId(null);
      setBereich('hub');
      return;
    }
    if (aktivesPlugin && bereich === 'modul') {
      const erlaubteTabs = aktivesPlugin.getTabs({ teamRolle: neu.teamRolle });
      if (!erlaubteTabs.some((t) => t.id === aktiverPluginTab)) {
        setAktiverPluginTab(erlaubteTabs[0]?.id ?? aktivesPlugin.defaultTab);
      }
    }
  };

  const handleTeamAnsichtWechseln = (zielRolle: TeamRolle) => {
    if (!waehlbareAnsichten.includes(zielRolle)) return;
    setAktiveTeamAnsicht(zielRolle);

    if (bereich === 'sysadmin') {
      setAktivesPluginId(null);
      setBereich('hub');
      return;
    }
    if (zielRolle !== 'TEAM_ADMIN' && bereich === 'team-settings') {
      setAktivesPluginId(null);
      setBereich('hub');
      return;
    }
    if (aktivesPlugin && bereich === 'modul') {
      const erlaubteTabs = aktivesPlugin.getTabs({ teamRolle: zielRolle });
      if (!erlaubteTabs.some((t) => t.id === aktiverPluginTab)) {
        setAktiverPluginTab(erlaubteTabs[0]?.id ?? aktivesPlugin.defaultTab);
      }
    }
  };

  // --- Core-Stammdaten-Handler ---
  const handleTeamModulToggle = (teamId: string, modulId: PluginId) => {
    setTeams((alt) =>
      alt.map((team) => {
        if (team.id !== teamId) return team;
        const hat = team.aktivierteModule.includes(modulId);
        return {
          ...team,
          aktivierteModule: hat
            ? team.aktivierteModule.filter((id) => id !== modulId)
            : [...team.aktivierteModule, modulId],
        };
      })
    );
  };

  const handleTeamWechseln = (neueTeamId: string) => {
    setAktivesTeamId(neueTeamId);
    const ziel = teams.find((t) => t.id === neueTeamId);
    if (ziel) {
      setGewaehlteSaison(ziel.aktiveSaison);
    }
  };

  const handleTeamAktualisieren = (aktualisiert: TeamKontext) => {
    setTeams((alt) => alt.map((t) => (t.id === aktualisiert.id ? aktualisiert : t)));
    if (aktualisiert.id === aktivesTeamId) {
      setGewaehlteSaison(aktualisiert.aktiveSaison);
    }
  };

  const handleNeueSaisonStarten = (teamId: string, neueSaison: string) => {
    const bereinigt = neueSaison.trim();
    if (!bereinigt) return;
    setTeams((alt) =>
      alt.map((t) => (t.id === teamId ? fuegeNeueSaisonHinzu(t, bereinigt) : t))
    );
    if (teamId === aktivesTeamId) {
      setGewaehlteSaison(bereinigt);
    }
  };

  const handleTeamErstellen = (neuesTeam: TeamKontext) => {
    setTeams((alt) => [...alt, neuesTeam]);
  };

  const handleTeamLoeschen = (teamId: string) => {
    setTeams((alt) => {
      const rest = alt.filter((t) => t.id !== teamId);
      if (rest.length > 0 && aktivesTeamId === teamId) {
        setAktivesTeamId(rest[0].id);
        setGewaehlteSaison(rest[0].aktiveSaison);
      }
      return rest;
    });
    setMitgliedschaften((alt) => alt.filter((m) => m.teamId !== teamId));
    setEinladungen((alt) => alt.filter((e) => e.teamId !== teamId));
  };

  const handleBenutzerAktualisieren = (aktualisiert: BenutzerKonto) => {
    setBenutzerListe((alt) =>
      alt.map((b) => (b.uuid === aktualisiert.uuid ? aktualisiert : b))
    );
  };

  const handleBenutzerErstellen = (
    benutzer: BenutzerKonto,
    teamZuweisung?: { teamId: string; rolle: TeamRolle }
  ) => {
    setBenutzerListe((alt) => [...alt, benutzer]);
    if (teamZuweisung) {
      setMitgliedschaften((alt) => [
        ...alt,
        {
          id: `mem-${Date.now()}`,
          userUuid: benutzer.uuid,
          teamId: teamZuweisung.teamId,
          rolle: teamZuweisung.rolle,
          units: ['OFFENSE'],
          status: 'AKTIV',
          beigetretenAm: new Date().toISOString().slice(0, 10),
        },
      ]);
    }
  };

  const handleBenutzerSysadminToggle = (userUuid: string) => {
    setBenutzerListe((alt) =>
      alt.map((b) => (b.uuid === userUuid ? { ...b, istSysadmin: !b.istSysadmin } : b))
    );
  };

  const handleBenutzerLoeschen = (userUuid: string) => {
    setBenutzerListe((alt) => alt.filter((b) => b.uuid !== userUuid));
    setMitgliedschaften((alt) => alt.filter((m) => m.userUuid !== userUuid));
  };

  const handleMitgliedRolleAendern = (mitgliedschaftId: string, rolle: TeamRolle) => {
    setMitgliedschaften((alt) =>
      alt.map((m) => (m.id === mitgliedschaftId ? { ...m, rolle } : m))
    );
  };

  const handleMitgliedUnitsAendern = (mitgliedschaftId: string, units: SpielerUnit[]) => {
    setMitgliedschaften((alt) =>
      alt.map((m) => (m.id === mitgliedschaftId ? { ...m, units } : m))
    );
  };

  const handleMitgliedBestaetigen = (mitgliedschaftId: string) => {
    setMitgliedschaften((alt) =>
      alt.map((m) => (m.id === mitgliedschaftId ? { ...m, status: 'AKTIV' } : m))
    );
  };

  const handleMitgliedEntfernen = (mitgliedschaftId: string) => {
    setMitgliedschaften((alt) => alt.filter((m) => m.id !== mitgliedschaftId));
  };

  const handleEinladungErstellen = (einladung: TeamEinladung) => {
    setEinladungen((alt) => [einladung, ...alt]);
  };

  const handleEinladungWiderrufen = (einladungId: string) => {
    setEinladungen((alt) => alt.filter((e) => e.id !== einladungId));
  };

  const handleProfilCustomFeldHinzufuegen = (teamId: string, feld: ProfilCustomFeld) => {
    setTeams((alt) =>
      alt.map((t) =>
        t.id === teamId
          ? { ...t, customProfilFelder: [...t.customProfilFelder, feld] }
          : t
      )
    );
  };

  const handleProfilCustomFeldLoeschen = (teamId: string, key: string) => {
    setTeams((alt) =>
      alt.map((t) =>
        t.id === teamId
          ? { ...t, customProfilFelder: t.customProfilFelder.filter((f) => f.key !== key) }
          : t
      )
    );
  };

  const handleDeinstallierenMitRuecksprung = (pluginId: PluginId) => {
    if (aktivesPluginId === pluginId) {
      setAktivesPluginId(null);
      setBereich('sysadmin');
    }
    onPluginDeinstallieren(pluginId);
  };

  const handleGlobalToggleMitRuecksprung = (pluginId: PluginId) => {
    if (aktivesPluginId === pluginId && globalAktivierteModule.includes(pluginId)) {
      setAktivesPluginId(null);
      setBereich('hub');
    }
    onGlobalModulToggle(pluginId);
  };

  // Plugin-Laufzeitkontext nur konstruieren, wenn ein Plugin aktiv angezeigt werden kann
  const pluginLaufzeitKontext: PluginLaufzeitKontext | null =
    bereich === 'modul' && aktivesPlugin && aktiveTeamAnsicht !== null
      ? {
          team: aktivesTeam,
          aktiveTeamAnsicht,
          gewaehlteSaison: aktiveSaisonAuswahl,
          benutzer: aktuellerBenutzer,
          aktuellerTab: aktiverPluginTab || aktivesPlugin.defaultTab,
          onTabWechseln: setAktiverPluginTab,
          onTeamSettingsOeffnen: () => {
            setAktivesPluginId(null);
            setBereich('team-settings');
          },
          onZurueckZurStartseite: handleLogoKlick,
        }
      : null;

  const pluginTabs =
    pluginLaufzeitKontext && aktivesPlugin
      ? aktivesPlugin.getTabs({ teamRolle: pluginLaufzeitKontext.aktiveTeamAnsicht })
      : [];

  return (
    <div className="min-h-screen bg-[#0B0E11] text-[#E6EDF3]">
      <CoreTopBar
        bereich={bereich}
        aktivesPlugin={aktivesPlugin}
        pluginTabs={pluginTabs}
        aktiverPluginTab={pluginLaufzeitKontext?.aktuellerTab ?? ''}
        pluginLaufzeitKontext={pluginLaufzeitKontext}
        konto={konto}
        aktiveTeamAnsicht={aktiveTeamAnsicht}
        ausstehendeAnfragenAnzahl={ausstehendeAnfragenAnzahl}
        onLogoKlick={handleLogoKlick}
        onBereichWechseln={handleBereichWechseln}
        onPluginTabWechseln={setAktiverPluginTab}
      />

      {/* Kontext-Leiste: Team-Wahl, Saison-Wahl, Ansichts-Umschalter & Demo-Konto */}
      <div className="border-b border-[#232933] bg-[#0F1318]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            {aktiveTeamAnsicht === null || bereich === 'sysadmin' ? (
              <span className="text-xs font-medium text-[#8B949E]">
                Instanz-Verwaltung · Sysadmin-Bereich (getrennt von Team-Daten)
              </span>
            ) : (
              <>
                <label className="flex items-center gap-2 text-xs text-[#8B949E]">
                  <span>Team</span>
                  <select
                    value={aktivesTeam.id}
                    onChange={(e) => handleTeamWechseln(e.target.value)}
                    className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1 text-xs font-medium text-white focus:border-[#F59E0B] focus:outline-none"
                  >
                    {teams.map((team) => (
                      <option key={team.id} value={team.id} className="bg-[#13171D]">
                        {team.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-xs text-[#8B949E]">
                  <span>Saison</span>
                  <select
                    aria-label="Saison auswählen"
                    value={aktiveSaisonAuswahl}
                    onChange={(e) => setGewaehlteSaison(e.target.value)}
                    className="rounded border border-[#232933] bg-[#13171D] px-2.5 py-1 font-mono text-xs font-medium text-white focus:border-[#F59E0B] focus:outline-none"
                  >
                    {aktivesTeam.saisons.map((s) => (
                      <option key={s} value={s} className="bg-[#13171D]">
                        {s} {s === aktivesTeam.aktiveSaison ? '(Aktuell)' : '(Archiv)'}
                      </option>
                    ))}
                    <option value="ALL" className="bg-[#13171D]">
                      Alle Saisons
                    </option>
                  </select>
                </label>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {kannAnsichtWechseln && (
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs text-[#8B949E]">
                  <Eye className="h-3.5 w-3.5 text-[#F59E0B]" aria-hidden="true" />
                  Ansicht
                </span>
                <div
                  role="group"
                  aria-label="Rollen-Ansicht umschalten"
                  className="flex items-center gap-0.5 rounded-md border border-[#232933] bg-[#13171D] p-0.5"
                >
                  {waehlbareAnsichten.map((rolle) => {
                    const aktiv = aktiveTeamAnsicht === rolle;
                    return (
                      <button
                        key={rolle}
                        type="button"
                        onClick={() => handleTeamAnsichtWechseln(rolle)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          aktiv
                            ? 'bg-[#232933] text-white'
                            : 'text-[#8B949E] hover:text-[#E6EDF3]'
                        }`}
                      >
                        {TEAM_ROLLEN_LABELS[rolle]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <label className="flex items-center gap-2 border-l border-[#232933] pl-4 text-xs text-[#6E7681]">
              <span>Demo-Konto</span>
              <select
                aria-label="Angemeldetes Demo-Konto wechseln"
                value={konto.id}
                onChange={(e) => handleKontoWechseln(e.target.value)}
                className="rounded border border-[#232933] bg-[#13171D] px-2 py-1 text-xs text-[#E6EDF3] focus:border-[#F59E0B] focus:outline-none"
              >
                {DEMO_PROFILE.map((p) => (
                  <option key={p.id} value={p.id} className="bg-[#13171D]">
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Hinweis-Banner bei aktiver Vorschau einer untergeordneten Rolle */}
      {istVorschauModus && konto.teamRolle && aktiveTeamAnsicht && (
        <div className="border-b border-[#F59E0B]/30 bg-[#F59E0B]/10">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-6 py-2 text-xs text-[#FDE68A]">
            <span>
              Ansichts-Vorschau aktiv: Du siehst die Oberfläche als{' '}
              <strong className="font-semibold text-white">
                {TEAM_ROLLEN_LABELS[aktiveTeamAnsicht]}
              </strong>{' '}
              (deine eigentliche Rolle: {TEAM_ROLLEN_LABELS[konto.teamRolle]}).
            </span>
            <button
              type="button"
              onClick={() => handleTeamAnsichtWechseln(konto.teamRolle!)}
              className="inline-flex items-center gap-1.5 rounded border border-[#F59E0B]/50 bg-[#0B0E11] px-2.5 py-1 text-xs font-medium text-[#F59E0B] hover:bg-[#13171D]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Zurück zu {TEAM_ROLLEN_LABELS[konto.teamRolle]}
            </button>
          </div>
        </div>
      )}

      {/* Hauptinhalt */}
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {bereich === 'sysadmin' && konto.istSysadmin ? (
          <SysadminPage
            storeKatalog={storeKatalog}
            installiertePlugins={installiertePlugins}
            installiertePluginIds={installiertePluginIds}
            globalAktivierteModule={globalAktivierteModule}
            teams={teams}
            benutzerListe={benutzerListe}
            mitgliedschaften={mitgliedschaften}
            s3Konfig={s3Konfig}
            smtpKonfig={smtpKonfig}
            onPluginInstallieren={onPluginInstallieren}
            onPluginDeinstallieren={handleDeinstallierenMitRuecksprung}
            onCustomGitHubPluginHinzufuegen={onCustomGitHubPluginHinzufuegen}
            onGlobalModulToggle={handleGlobalToggleMitRuecksprung}
            onTeamModulToggle={handleTeamModulToggle}
            onTeamErstellen={handleTeamErstellen}
            onTeamLoeschen={handleTeamLoeschen}
            onBenutzerErstellen={handleBenutzerErstellen}
            onBenutzerSysadminToggle={handleBenutzerSysadminToggle}
            onBenutzerLoeschen={handleBenutzerLoeschen}
            onS3Speichern={setS3Konfig}
            onSmtpSpeichern={setSmtpKonfig}
            onZurueck={
              aktiveTeamAnsicht !== null
                ? () => handleBereichWechseln('settings-hub')
                : undefined
            }
          />
        ) : aktiveTeamAnsicht === null ? (
          <SysadminPage
            storeKatalog={storeKatalog}
            installiertePlugins={installiertePlugins}
            installiertePluginIds={installiertePluginIds}
            globalAktivierteModule={globalAktivierteModule}
            teams={teams}
            benutzerListe={benutzerListe}
            mitgliedschaften={mitgliedschaften}
            s3Konfig={s3Konfig}
            smtpKonfig={smtpKonfig}
            onPluginInstallieren={onPluginInstallieren}
            onPluginDeinstallieren={handleDeinstallierenMitRuecksprung}
            onCustomGitHubPluginHinzufuegen={onCustomGitHubPluginHinzufuegen}
            onGlobalModulToggle={handleGlobalToggleMitRuecksprung}
            onTeamModulToggle={handleTeamModulToggle}
            onTeamErstellen={handleTeamErstellen}
            onTeamLoeschen={handleTeamLoeschen}
            onBenutzerErstellen={handleBenutzerErstellen}
            onBenutzerSysadminToggle={handleBenutzerSysadminToggle}
            onBenutzerLoeschen={handleBenutzerLoeschen}
            onS3Speichern={setS3Konfig}
            onSmtpSpeichern={setSmtpKonfig}
          />
        ) : bereich === 'hub' ? (
          <SidelineHubView
            aktivePlugins={aktiveTeamPlugins}
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            ausstehendeAnfragenAnzahl={ausstehendeAnfragenAnzahl}
            onModulOeffnen={handleModulOeffnen}
            onBereichOeffnen={handleBereichWechseln}
          />
        ) : bereich === 'settings-hub' ? (
          <SettingsHubView
            team={aktivesTeam}
            benutzer={aktuellerBenutzer}
            konto={konto}
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            ausstehendeAnfragenAnzahl={ausstehendeAnfragenAnzahl}
            onBereichOeffnen={handleBereichWechseln}
          />
        ) : bereich === 'settings' ? (
          <UserSettingsPage
            benutzer={aktuellerBenutzer}
            team={aktivesTeam}
            mitgliedschaft={aktuelleMitgliedschaft}
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            s3Konfig={s3Konfig}
            aktivePlugins={aktiveTeamPlugins}
            onBenutzerAktualisieren={handleBenutzerAktualisieren}
            onZurueck={() => handleBereichWechseln('settings-hub')}
          />
        ) : bereich === 'team-settings' && aktiveTeamAnsicht === 'TEAM_ADMIN' ? (
          <TeamSettingsPage
            team={aktivesTeam}
            benutzer={aktuellerBenutzer}
            benutzerListe={benutzerListe}
            mitgliedschaften={mitgliedschaften}
            einladungen={einladungen}
            s3Konfig={s3Konfig}
            aktivePlugins={aktiveTeamPlugins}
            onTeamAktualisieren={handleTeamAktualisieren}
            onNeueSaisonStarten={handleNeueSaisonStarten}
            onMitgliedRolleAendern={handleMitgliedRolleAendern}
            onMitgliedUnitsAendern={handleMitgliedUnitsAendern}
            onMitgliedBestaetigen={handleMitgliedBestaetigen}
            onMitgliedEntfernen={handleMitgliedEntfernen}
            onEinladungErstellen={handleEinladungErstellen}
            onEinladungWiderrufen={handleEinladungWiderrufen}
            onProfilCustomFeldHinzufuegen={handleProfilCustomFeldHinzufuegen}
            onProfilCustomFeldLoeschen={handleProfilCustomFeldLoeschen}
            onZurueck={() => handleBereichWechseln('settings-hub')}
          />
        ) : bereich === 'modul' && aktivesPlugin && pluginLaufzeitKontext ? (
          aktivesPlugin.renderMainView(pluginLaufzeitKontext)
        ) : (
          <SidelineHubView
            aktivePlugins={aktiveTeamPlugins}
            aktiveTeamAnsicht={aktiveTeamAnsicht}
            ausstehendeAnfragenAnzahl={ausstehendeAnfragenAnzahl}
            onModulOeffnen={handleModulOeffnen}
            onBereichOeffnen={handleBereichWechseln}
          />
        )}
      </main>
    </div>
  );
}

export default function App() {
  const [storeKatalog, setStoreKatalog] = useState<PluginStoreEintrag[]>(
    OFFIZIELLER_PLUGIN_KATALOG
  );
  const [installiertePluginIds, setInstalliertePluginIds] = useState<PluginId[]>(
    STANDARD_INSTALLIERTE_PLUGIN_IDS
  );
  const [globalAktivierteModule, setGlobalAktivierteModule] = useState<PluginId[]>(
    STANDARD_AKTIVIERTE_PLUGIN_IDS
  );

  const installiertePlugins = useMemo(
    () => ladeInstalliertePlugins(storeKatalog, installiertePluginIds),
    [storeKatalog, installiertePluginIds]
  );

  const handlePluginInstallieren = (pluginId: PluginId) => {
    setInstalliertePluginIds((alt) => (alt.includes(pluginId) ? alt : [...alt, pluginId]));
    setGlobalAktivierteModule((alt) => (alt.includes(pluginId) ? alt : [...alt, pluginId]));
  };

  const handlePluginDeinstallieren = (pluginId: PluginId) => {
    setInstalliertePluginIds((alt) => alt.filter((id) => id !== pluginId));
    setGlobalAktivierteModule((alt) => alt.filter((id) => id !== pluginId));
  };

  const handleCustomGitHubPluginHinzufuegen = (repoUrl: string, slug: string) => {
    const manifest = erstelleCustomPluginManifest(repoUrl, slug);
    const eintrag: PluginStoreEintrag = {
      manifest,
      quelle: 'CUSTOM_GITHUB',
      verifiziert: false,
      releaseTag: 'main',
      paketFormat: 'sideline-plugin-v1',
    };
    setStoreKatalog((alt) => [...alt, eintrag]);
    setInstalliertePluginIds((alt) => [...alt, manifest.id]);
    setGlobalAktivierteModule((alt) => [...alt, manifest.id]);
  };

  const handleGlobalModulToggle = (modulId: PluginId) => {
    setGlobalAktivierteModule((alt) =>
      alt.includes(modulId) ? alt.filter((id) => id !== modulId) : [...alt, modulId]
    );
  };

  return (
    <PluginProviderStack plugins={installiertePlugins}>
      <SidelineCoreShell
        storeKatalog={storeKatalog}
        installiertePlugins={installiertePlugins}
        installiertePluginIds={installiertePluginIds}
        globalAktivierteModule={globalAktivierteModule}
        onPluginInstallieren={handlePluginInstallieren}
        onPluginDeinstallieren={handlePluginDeinstallieren}
        onCustomGitHubPluginHinzufuegen={handleCustomGitHubPluginHinzufuegen}
        onGlobalModulToggle={handleGlobalModulToggle}
      />
    </PluginProviderStack>
  );
}

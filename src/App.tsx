import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, Eye, LogOut, RotateCcw } from 'lucide-react';
import { CoreTopBar } from './core/layout/CoreTopBar.tsx';
import { SidelineHubView } from './core/hub/SidelineHubView.tsx';
import { SettingsHubView } from './core/settings/SettingsHubView.tsx';
import { UserSettingsPage, type ApiAktionErgebnis } from './core/settings/UserSettingsPage.tsx';
import {
  TeamSettingsPage,
  type TeamMitgliedBenutzerInfo,
} from './core/settings/TeamSettingsPage.tsx';
import { SysadminPage } from './core/settings/SysadminPage.tsx';
import { LoginView } from './core/auth/LoginView.tsx';
import { InviteRegisterView } from './core/auth/InviteRegisterView.tsx';
import {
  CoreApiError,
  coreApi,
  type AuthSessionResponse,
  type InviteAcceptResponse,
} from './core/apiClient.ts';
import {
  DEMO_STANDARD_PASSWORT,
  ermittleProfilAusKonto,
  parseAppRouteAusPfad,
} from './core/authService.ts';
import { INITIALE_S3_KONFIG, INITIALE_SMTP_KONFIG } from './core/demoOrgData.ts';
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
  AppRouteModus,
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

const DEMO_KENNUNG_ZU_PROFIL: Record<string, string> = {
  'profil-teamadmin-sysadmin': 'm.brenner',
  'profil-coach': 't.richter',
  'profil-player': 'l.weber',
  'profil-only-sysadmin': 'sysadmin',
};

function fehlerAusUnbekannt(err: unknown, fallback: string): ApiAktionErgebnis {
  if (err instanceof CoreApiError) {
    return { ok: false, fehler: err.message };
  }
  return { ok: false, fehler: err instanceof Error ? err.message : fallback };
}

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
  onGlobalModuleSynchronisieren: (ids: PluginId[]) => void;
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
  onGlobalModuleSynchronisieren,
}: SidelineShellProps) {
  const [routeModus, setRouteModus] = useState<AppRouteModus>(() =>
    parseAppRouteAusPfad(typeof window !== 'undefined' ? window.location.pathname : '/')
  );

  const [bereich, setBereich] = useState<CoreBereich>('hub');
  const [aktivesPluginId, setAktivesPluginId] = useState<PluginId | null>(null);
  const [aktiverPluginTab, setAktiverPluginTab] = useState<string>('');

  const [sessionWirdGeprueft, setSessionWirdGeprueft] = useState<boolean>(true);
  const [aktuellerBenutzer, setAktuellerBenutzer] = useState<BenutzerKonto | null>(null);
  const [aktuellesProfil, setAktuellesProfil] = useState<BenutzerProfil | null>(null);
  const [aktiveTeamAnsicht, setAktiveTeamAnsicht] = useState<TeamRolle | null>(null);

  // Core-Plattform-Zustand (hydriert über /api/v1/*)
  const [teams, setTeams] = useState<TeamKontext[]>([]);
  const [aktivesTeamId, setAktivesTeamId] = useState<string>('');
  const [gewaehlteSaison, setGewaehlteSaison] = useState<string>('2026');
  const [benutzerListe, setBenutzerListe] = useState<BenutzerKonto[]>([]);
  const [teamMitgliederBenutzer, setTeamMitgliederBenutzer] = useState<
    TeamMitgliedBenutzerInfo[]
  >([]);
  const [mitgliedschaften, setMitgliedschaften] = useState<TeamMitgliedschaft[]>([]);
  const [einladungen, setEinladungen] = useState<TeamEinladung[]>([]);

  // S3 & SMTP Konfiguration (folgen in Core-Phase 2 serverseitig)
  const [s3Konfig, setS3Konfig] = useState<S3Konfiguration>(INITIALE_S3_KONFIG);
  const [smtpKonfig, setSmtpKonfig] = useState<SmtpKonfiguration>(INITIALE_SMTP_KONFIG);

  useEffect(() => {
    const onPopState = () => {
      setRouteModus(parseAppRouteAusPfad(window.location.pathname));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigiereZuRoute = useCallback((ziel: AppRouteModus) => {
    setRouteModus(ziel);
    if (typeof window === 'undefined') return;
    const zielPfad =
      ziel.art === 'app'
        ? '/'
        : ziel.art === 'login'
          ? '/login'
          : ziel.art === 'invite'
            ? `/invite/${encodeURIComponent(ziel.token)}`
            : `/share/${encodeURIComponent(ziel.token)}`;
    try {
      if (window.location.pathname !== zielPfad) {
        window.history.pushState(null, '', zielPfad);
      }
    } catch {
      // Ignorieren in restriktiven Sandbox-Umgebungen
    }
  }, []);

  const ladeSysadminUebersicht = useCallback(async () => {
    try {
      const ov = await coreApi.holeSysadminUebersicht();
      setTeams(ov.teams);
      setBenutzerListe(ov.users);
      setMitgliedschaften(ov.memberships);
      onGlobalModuleSynchronisieren(
        ov.plugins.filter((p) => p.enabledGlobally).map((p) => p.manifest.id)
      );
    } catch {
      // Ignorieren falls kein Sysadmin
    }
  }, [onGlobalModuleSynchronisieren]);

  const uebernehmeSitzung = useCallback(
    async (sitzung: AuthSessionResponse) => {
      setAktuellerBenutzer(sitzung.user);
      setTeams(sitzung.teams);
      setMitgliedschaften(sitzung.memberships);

      const zielTeam = sitzung.teams[0] ?? null;
      const zielTeamId = zielTeam?.id ?? '';
      setAktivesTeamId(zielTeamId);
      if (zielTeam) {
        setGewaehlteSaison(zielTeam.aktiveSaison);
      }

      const profil = ermittleProfilAusKonto(sitzung.user, zielTeamId, sitzung.memberships);
      setAktuellesProfil(profil);
      setAktiveTeamAnsicht(profil.teamRolle);
      setAktivesPluginId(null);
      setBereich(profil.teamRolle === null ? 'sysadmin' : 'hub');

      if (sitzung.user.istSysadmin) {
        await ladeSysadminUebersicht();
      } else {
        setBenutzerListe([sitzung.user]);
      }
    },
    [ladeSysadminUebersicht]
  );

  // Initialer Session-Check beim App-Start
  useEffect(() => {
    let aktiv = true;
    if (routeModus.art === 'share' || routeModus.art === 'invite') {
      setSessionWirdGeprueft(false);
      return;
    }
    coreApi
      .holeAktuelleSitzung()
      .then((res) => {
        if (!aktiv) return;
        return uebernehmeSitzung(res);
      })
      .catch(() => {
        if (!aktiv) return;
        setAktuellesProfil(null);
        setAktuellerBenutzer(null);
      })
      .finally(() => {
        if (aktiv) setSessionWirdGeprueft(false);
      });

    return () => {
      aktiv = false;
    };
  }, [routeModus.art, uebernehmeSitzung]);

  const aktivesTeam = teams.find((t) => t.id === aktivesTeamId) ?? teams[0] ?? null;

  // Team-Mitglieder und Einladungen beim Teamwechsel nachladen
  useEffect(() => {
    if (!aktuellesProfil || !aktivesTeam) return;
    const eigeneRolleImTeam =
      mitgliedschaften.find(
        (m) =>
          m.userUuid === aktuellesProfil.userUuid &&
          m.teamId === aktivesTeam.id &&
          m.status === 'AKTIV'
      )?.rolle ?? null;

    if (!eigeneRolleImTeam) return;

    let aktiv = true;
    coreApi
      .holeTeamMitglieder(aktivesTeam.id)
      .then((res) => {
        if (!aktiv) return;
        setTeamMitgliederBenutzer(
          res.members.map((e) => e.user).filter((u): u is TeamMitgliedBenutzerInfo => u !== null)
        );
        const neueTeamMitgliedschaften = res.members.map((e) => e.membership);
        setMitgliedschaften((alt) => {
          const andereTeams = alt.filter((m) => m.teamId !== aktivesTeam.id);
          return [...andereTeams, ...neueTeamMitgliedschaften];
        });
      })
      .catch(() => {
        // Stille Fehlerbehandlung bei schnellem Team-Wechsel
      });

    if (eigeneRolleImTeam === 'TEAM_ADMIN') {
      coreApi
        .holeEinladungen(aktivesTeam.id)
        .then((res) => {
          if (!aktiv) return;
          setEinladungen((alt) => {
            const andereTeams = alt.filter((e) => e.teamId !== aktivesTeam.id);
            return [...andereTeams, ...res.invitations];
          });
        })
        .catch(() => {
          // Ignorieren
        });
    }

    return () => {
      aktiv = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktuellesProfil?.userUuid, aktivesTeam?.id]);

  // Aktuelle Rolle im gewählten Team dynamisch ableiten
  const konto: BenutzerProfil | null = useMemo(() => {
    if (!aktuellerBenutzer) return aktuellesProfil;
    if (!aktivesTeam) {
      return {
        id: `auth-${aktuellerBenutzer.uuid}`,
        userUuid: aktuellerBenutzer.uuid,
        label: aktuellerBenutzer.vollerName,
        teamRolle: null,
        istSysadmin: aktuellerBenutzer.istSysadmin,
      };
    }
    return ermittleProfilAusKonto(aktuellerBenutzer, aktivesTeam.id, mitgliedschaften);
  }, [aktuellerBenutzer, aktuellesProfil, aktivesTeam, mitgliedschaften]);

  const aktuelleMitgliedschaft =
    konto && aktivesTeam
      ? mitgliedschaften.find(
          (m) => m.userUuid === konto.userUuid && m.teamId === aktivesTeam.id
        ) ?? null
      : null;

  const waehlbareAnsichten = konto ? ermittleWaehlbareTeamAnsichten(konto) : [];
  const kannAnsichtWechseln = konto ? darfAnsichtWechseln(konto) : false;
  const istVorschauModus =
    Boolean(konto) &&
    aktiveTeamAnsicht !== null &&
    konto!.teamRolle !== null &&
    aktiveTeamAnsicht !== konto!.teamRolle;

  const aktiveTeamPlugins = useMemo(
    () =>
      aktiveTeamAnsicht === null || !aktivesTeam
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
      aktivesTeam,
      installiertePlugins,
      installiertePluginIds,
      globalAktivierteModule,
    ]
  );

  const aktivesPlugin = useMemo(
    () => findePlugin(aktiveTeamPlugins, aktivesPluginId) ?? null,
    [aktiveTeamPlugins, aktivesPluginId]
  );

  const aktiveSaisonAuswahl = !aktivesTeam
    ? '2026'
    : gewaehlteSaison === 'ALL' || aktivesTeam.saisons.includes(gewaehlteSaison)
      ? gewaehlteSaison
      : aktivesTeam.aktiveSaison;

  const ausstehendeAnfragenAnzahl = aktivesTeam
    ? mitgliedschaften.filter(
        (m) => m.teamId === aktivesTeam.id && m.status === 'WARTET_AUF_FREIGABE'
      ).length
    : 0;

  // --- Auth & Einladungs-Handler ---
  const handleAnmelden = async (
    kennung: string,
    passwort: string
  ): Promise<{ ok: boolean; fehler?: string }> => {
    try {
      const res = await coreApi.login(kennung, passwort);
      await uebernehmeSitzung(res);
      navigiereZuRoute({ art: 'app' });
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Anmeldung fehlgeschlagen.');
    }
  };

  const handleInviteBeigetreten = async (ergebnis: InviteAcceptResponse) => {
    setAktuellerBenutzer(ergebnis.user);
    setTeams([ergebnis.team]);
    setAktivesTeamId(ergebnis.team.id);
    setGewaehlteSaison(ergebnis.team.aktiveSaison);
    setMitgliedschaften([ergebnis.membership]);

    const profil = ermittleProfilAusKonto(ergebnis.user, ergebnis.team.id, [ergebnis.membership]);
    setAktuellesProfil(profil);
    setAktiveTeamAnsicht(profil.teamRolle);
    setAktivesPluginId(null);
    setBereich('hub');
    navigiereZuRoute({ art: 'app' });

    try {
      const vollSitzung = await coreApi.holeAktuelleSitzung();
      await uebernehmeSitzung(vollSitzung);
    } catch {
      // Bereits im Team-Kontext
    }
  };

  const handleAbmelden = async () => {
    await coreApi.logout();
    setAktuellesProfil(null);
    setAktuellerBenutzer(null);
    setAktiveTeamAnsicht(null);
    setAktivesPluginId(null);
    setTeams([]);
    setMitgliedschaften([]);
    setEinladungen([]);
    navigiereZuRoute({ art: 'login' });
  };

  // --- Profil-Einstellungen ---
  const handleProfilSpeichern = async (daten: {
    vollerName: string;
    telefon: string;
    trikotNummer: string;
    position: string;
    customProfilWerte: Record<string, string>;
  }): Promise<ApiAktionErgebnis> => {
    try {
      const res = await coreApi.aktualisiereEigenesProfil(daten);
      setAktuellerBenutzer(res.user);
      setBenutzerListe((alt) => alt.map((b) => (b.uuid === res.user.uuid ? res.user : b)));
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Profil konnte nicht gespeichert werden.');
    }
  };

  const handleZugangSpeichern = async (daten: {
    benutzername: string;
    email: string;
    altesPasswort?: string;
    neuesPasswort?: string;
  }): Promise<ApiAktionErgebnis> => {
    try {
      const res = await coreApi.aktualisiereEigenesProfil(daten);
      setAktuellerBenutzer(res.user);
      setBenutzerListe((alt) => alt.map((b) => (b.uuid === res.user.uuid ? res.user : b)));
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Zugangsdaten konnten nicht aktualisiert werden.');
    }
  };

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

  const handleDemoKontoWechseln = async (profilId: string) => {
    const kennung = DEMO_KENNUNG_ZU_PROFIL[profilId];
    if (!kennung) return;
    await handleAnmelden(kennung, DEMO_STANDARD_PASSWORT);
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

  const handleTeamWechseln = (neueTeamId: string) => {
    setAktivesTeamId(neueTeamId);
    const ziel = teams.find((t) => t.id === neueTeamId);
    if (ziel) {
      setGewaehlteSaison(ziel.aktiveSaison);
    }
    if (aktuellerBenutzer) {
      const neuesProfil = ermittleProfilAusKonto(aktuellerBenutzer, neueTeamId, mitgliedschaften);
      setAktiveTeamAnsicht(neuesProfil.teamRolle);
    }
  };

  // --- Team-Verwaltungs-Handler (/api/v1/teams/*) ---
  const handleTeamAktualisieren = async (aktualisiert: TeamKontext): Promise<ApiAktionErgebnis> => {
    try {
      const res = await coreApi.aktualisiereTeam(aktualisiert.id, {
        name: aktualisiert.name,
        kurzname: aktualisiert.kurzname,
        aktiveSaison: aktualisiert.aktiveSaison,
        primaerFarbe: aktualisiert.primaerFarbe,
        customProfilFelder: aktualisiert.customProfilFelder,
      });
      setTeams((alt) => alt.map((t) => (t.id === res.team.id ? res.team : t)));
      if (res.team.id === aktivesTeamId) {
        setGewaehlteSaison(res.team.aktiveSaison);
      }
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Team konnte nicht aktualisiert werden.');
    }
  };

  const handleNeueSaisonStarten = async (
    teamId: string,
    neueSaison: string
  ): Promise<ApiAktionErgebnis> => {
    try {
      const res = await coreApi.starteNeueSaison(teamId, neueSaison, true);
      setTeams((alt) => alt.map((t) => (t.id === res.team.id ? res.team : t)));
      if (teamId === aktivesTeamId) {
        setGewaehlteSaison(res.team.aktiveSaison);
      }
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Saison konnte nicht gestartet werden.');
    }
  };

  const handleMitgliedRolleAendern = async (
    mitgliedschaftId: string,
    rolle: TeamRolle
  ): Promise<ApiAktionErgebnis> => {
    if (!aktivesTeam) return { ok: false, fehler: 'Kein Team gewählt.' };
    try {
      const res = await coreApi.aktualisiereMitglied(aktivesTeam.id, mitgliedschaftId, { rolle });
      setMitgliedschaften((alt) =>
        alt.map((m) => (m.id === mitgliedschaftId ? res.membership : m))
      );
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Rolle konnte nicht geändert werden.');
    }
  };

  const handleMitgliedUnitsAendern = async (
    mitgliedschaftId: string,
    units: SpielerUnit[]
  ): Promise<ApiAktionErgebnis> => {
    if (!aktivesTeam) return { ok: false, fehler: 'Kein Team gewählt.' };
    try {
      const res = await coreApi.aktualisiereMitglied(aktivesTeam.id, mitgliedschaftId, { units });
      setMitgliedschaften((alt) =>
        alt.map((m) => (m.id === mitgliedschaftId ? res.membership : m))
      );
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Units konnten nicht gespeichert werden.');
    }
  };

  const handleMitgliedBestaetigen = async (
    mitgliedschaftId: string
  ): Promise<ApiAktionErgebnis> => {
    if (!aktivesTeam) return { ok: false, fehler: 'Kein Team gewählt.' };
    try {
      const res = await coreApi.aktualisiereMitglied(aktivesTeam.id, mitgliedschaftId, {
        status: 'AKTIV',
      });
      setMitgliedschaften((alt) =>
        alt.map((m) => (m.id === mitgliedschaftId ? res.membership : m))
      );
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Mitglied konnte nicht freigeschaltet werden.');
    }
  };

  const handleMitgliedEntfernen = async (mitgliedschaftId: string): Promise<ApiAktionErgebnis> => {
    if (!aktivesTeam) return { ok: false, fehler: 'Kein Team gewählt.' };
    try {
      await coreApi.entferneMitglied(aktivesTeam.id, mitgliedschaftId);
      setMitgliedschaften((alt) => alt.filter((m) => m.id !== mitgliedschaftId));
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Mitglied konnte nicht entfernt werden.');
    }
  };

  const handleEinladungErstellen = async (payload: {
    typ: 'EMAIL' | 'TEAM_LINK';
    zielEmail?: string;
    rolle: TeamRolle;
    units: SpielerUnit[];
    gueltigTage?: number;
    bestaetigungErforderlich?: boolean;
  }): Promise<ApiAktionErgebnis & { invitation?: TeamEinladung }> => {
    if (!aktivesTeam) return { ok: false, fehler: 'Kein Team gewählt.' };
    try {
      const res = await coreApi.erstelleEinladung(aktivesTeam.id, payload);
      setEinladungen((alt) => [res.invitation, ...alt]);
      return { ok: true, invitation: res.invitation };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Einladung konnte nicht erstellt werden.');
    }
  };

  const handleEinladungWiderrufen = async (einladungId: string): Promise<ApiAktionErgebnis> => {
    if (!aktivesTeam) return { ok: false, fehler: 'Kein Team gewählt.' };
    try {
      await coreApi.widerrufeEinladung(aktivesTeam.id, einladungId);
      setEinladungen((alt) => alt.filter((e) => e.id !== einladungId));
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Einladung konnte nicht widerrufen werden.');
    }
  };

  const handleProfilCustomFeldHinzufuegen = async (
    teamId: string,
    feld: ProfilCustomFeld
  ): Promise<ApiAktionErgebnis> => {
    const ziel = teams.find((t) => t.id === teamId);
    if (!ziel) return { ok: false, fehler: 'Team nicht gefunden.' };
    return handleTeamAktualisieren({
      ...ziel,
      customProfilFelder: [...ziel.customProfilFelder, feld],
    });
  };

  const handleProfilCustomFeldLoeschen = async (
    teamId: string,
    key: string
  ): Promise<ApiAktionErgebnis> => {
    const ziel = teams.find((t) => t.id === teamId);
    if (!ziel) return { ok: false, fehler: 'Team nicht gefunden.' };
    return handleTeamAktualisieren({
      ...ziel,
      customProfilFelder: ziel.customProfilFelder.filter((f) => f.key !== key),
    });
  };

  // --- Sysadmin-Handler (/api/v1/sysadmin/*) ---
  const handleGlobalToggleMitRuecksprung = async (
    pluginId: PluginId
  ): Promise<ApiAktionErgebnis> => {
    const zielAktiv = !globalAktivierteModule.includes(pluginId);
    try {
      await coreApi.setzePluginGlobalAktiv(pluginId, zielAktiv);
      if (aktivesPluginId === pluginId && !zielAktiv) {
        setAktivesPluginId(null);
        setBereich('hub');
      }
      onGlobalModulToggle(pluginId);
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Globaler Plugin-Status konnte nicht gespeichert werden.');
    }
  };

  const handleTeamModulToggle = async (
    teamId: string,
    modulId: PluginId
  ): Promise<ApiAktionErgebnis> => {
    const team = teams.find((t) => t.id === teamId);
    if (!team) return { ok: false, fehler: 'Team nicht gefunden.' };
    const zielAktiv = !team.aktivierteModule.includes(modulId);
    try {
      await coreApi.setzeTeamPluginAktiv(teamId, modulId, zielAktiv);
      setTeams((alt) =>
        alt.map((t) =>
          t.id === teamId
            ? {
                ...t,
                aktivierteModule: zielAktiv
                  ? [...t.aktivierteModule, modulId]
                  : t.aktivierteModule.filter((id) => id !== modulId),
              }
            : t
        )
      );
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Team-Modulstatus konnte nicht geändert werden.');
    }
  };

  const handleTeamErstellen = async (payload: {
    name: string;
    kurzname: string;
    aktiveSaison: string;
    primaerFarbe?: string;
    aktivierteModule?: PluginId[];
    customProfilFelder?: ProfilCustomFeld[];
  }): Promise<ApiAktionErgebnis> => {
    try {
      const res = await coreApi.erstelleTeam(payload);
      setTeams((alt) => [...alt, res.team]);
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Team konnte nicht angelegt werden.');
    }
  };

  const handleTeamLoeschen = async (teamId: string): Promise<ApiAktionErgebnis> => {
    try {
      await coreApi.loescheTeam(teamId);
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
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Team konnte nicht gelöscht werden.');
    }
  };

  const handleBenutzerErstellen = async (
    payload: {
      vollerName: string;
      benutzername: string;
      email: string;
      passwort: string;
      istSysadmin: boolean;
    },
    teamZuweisung?: { teamId: string; rolle: TeamRolle }
  ): Promise<ApiAktionErgebnis> => {
    try {
      const res = await coreApi.erstelleBenutzer({ ...payload, teamZuweisung });
      setBenutzerListe((alt) => [...alt, res.user]);
      if (res.membership) {
        setMitgliedschaften((alt) => [...alt, res.membership!]);
      }
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Benutzerkonto konnte nicht angelegt werden.');
    }
  };

  const handleBenutzerSysadminToggle = async (userUuid: string): Promise<ApiAktionErgebnis> => {
    const ziel = benutzerListe.find((b) => b.uuid === userUuid);
    if (!ziel) return { ok: false, fehler: 'Benutzer nicht gefunden.' };
    try {
      const res = await coreApi.setzeBenutzerSysadmin(userUuid, !ziel.istSysadmin);
      setBenutzerListe((alt) => alt.map((b) => (b.uuid === userUuid ? res.user : b)));
      if (aktuellerBenutzer?.uuid === userUuid) {
        setAktuellerBenutzer(res.user);
      }
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Sysadmin-Status konnte nicht geändert werden.');
    }
  };

  const handleBenutzerLoeschen = async (userUuid: string): Promise<ApiAktionErgebnis> => {
    try {
      await coreApi.loescheBenutzer(userUuid);
      setBenutzerListe((alt) => alt.filter((b) => b.uuid !== userUuid));
      setMitgliedschaften((alt) => alt.filter((m) => m.userUuid !== userUuid));
      return { ok: true };
    } catch (err) {
      return fehlerAusUnbekannt(err, 'Benutzerkonto konnte nicht gelöscht werden.');
    }
  };

  const handleDeinstallierenMitRuecksprung = (pluginId: PluginId) => {
    if (aktivesPluginId === pluginId) {
      setAktivesPluginId(null);
      setBereich('sysadmin');
    }
    onPluginDeinstallieren(pluginId);
  };

  // --- Öffentliche Routen (/share/<token>, /invite/<token>, /login) ---
  if (routeModus.art === 'share') {
    const sharePlugin = installiertePlugins.find(
      (p) => typeof p.renderPublicShareView === 'function'
    );
    if (sharePlugin?.renderPublicShareView) {
      return sharePlugin.renderPublicShareView({
        token: routeModus.token,
        onSchliessen: () => navigiereZuRoute({ art: 'app' }),
      });
    }
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E11] px-4 py-10 text-[#E6EDF3]">
        <div className="w-full max-w-md rounded-xl border border-[#232933] bg-[#13171D] p-6 space-y-4 text-center">
          <h1 className="text-base font-semibold text-white">Kein Video-Plugin aktiv</h1>
          <p className="text-xs text-[#8B949E]">
            Für öffentliche <code className="font-mono">/share/</code>-Links muss ein
            unterstützendes Plugin im Core installiert sein.
          </p>
          <button
            type="button"
            onClick={() => navigiereZuRoute({ art: 'app' })}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#232933] bg-[#0B0E11] px-4 py-2 text-xs font-medium text-white hover:border-[#F59E0B]"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Zurück zu SidelineOS-Core
          </button>
        </div>
      </div>
    );
  }

  if (routeModus.art === 'invite') {
    return (
      <InviteRegisterView
        token={routeModus.token}
        onBeigetreten={(res) => void handleInviteBeigetreten(res)}
        onZurueckZumLogin={() => navigiereZuRoute({ art: 'login' })}
      />
    );
  }

  if (sessionWirdGeprueft) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E11] text-xs text-[#8B949E]">
        SidelineOS-Core Sitzung wird geprüft…
      </div>
    );
  }

  if (routeModus.art === 'login' || !konto || !aktuellerBenutzer) {
    return (
      <LoginView
        onAnmelden={handleAnmelden}
        onInviteOeffnen={(token) => navigiereZuRoute({ art: 'invite', token })}
        onShareOeffnen={(token) => navigiereZuRoute({ art: 'share', token })}
        demoSchnellzugangErlaubt={import.meta.env.DEV}
      />
    );
  }

  const pluginLaufzeitKontext: PluginLaufzeitKontext | null =
    bereich === 'modul' && aktivesPlugin && aktiveTeamAnsicht !== null && aktivesTeam
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
          onPublicShareOeffnen: (token) => navigiereZuRoute({ art: 'share', token }),
        }
      : null;

  const pluginTabs =
    pluginLaufzeitKontext && aktivesPlugin
      ? aktivesPlugin.getTabs({ teamRolle: pluginLaufzeitKontext.aktiveTeamAnsicht })
      : [];

  const aktuellesDemoProfil = DEMO_PROFILE.find((p) => p.userUuid === konto.userUuid);

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

      {/* Kontext-Leiste: Team-Wahl, Saison-Wahl, Ansichts-Umschalter, Demo-Konto & Abmelden */}
      <div className="border-b border-[#232933] bg-[#0F1318]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-6 py-2.5">
          <div className="flex flex-wrap items-center gap-3">
            {aktiveTeamAnsicht === null || bereich === 'sysadmin' || !aktivesTeam ? (
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

          <div className="flex flex-wrap items-center gap-3">
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

            {import.meta.env.DEV && (
              <label className="flex items-center gap-2 border-l border-[#232933] pl-3 text-xs text-[#6E7681]">
                <span>Demo-Konto</span>
                <select
                  aria-label="Angemeldetes Demo-Konto wechseln"
                  value={aktuellesDemoProfil?.id ?? '__custom__'}
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') {
                      void handleDemoKontoWechseln(e.target.value);
                    }
                  }}
                  className="rounded border border-[#232933] bg-[#13171D] px-2 py-1 text-xs text-[#E6EDF3] focus:border-[#F59E0B] focus:outline-none"
                >
                  {!aktuellesDemoProfil && (
                    <option value="__custom__" className="bg-[#13171D]">
                      {konto.label}
                    </option>
                  )}
                  {DEMO_PROFILE.map((p) => (
                    <option key={p.id} value={p.id} className="bg-[#13171D]">
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              type="button"
              onClick={() => void handleAbmelden()}
              title="Abmelden"
              className="inline-flex items-center gap-1 rounded border border-[#232933] bg-[#13171D] px-2.5 py-1 text-xs text-[#8B949E] transition-colors hover:border-[#F59E0B] hover:text-white"
            >
              <LogOut className="h-3 w-3" aria-hidden="true" />
              Abmelden
            </button>
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
              aktiveTeamAnsicht !== null && aktivesTeam
                ? () => handleBereichWechseln('settings-hub')
                : undefined
            }
          />
        ) : aktiveTeamAnsicht === null || !aktivesTeam ? (
          konto.istSysadmin ? (
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
          ) : (
            <div className="mx-auto max-w-md rounded-xl border border-[#232933] bg-[#13171D] p-6 text-center space-y-3">
              <h1 className="text-base font-semibold text-white">Noch keinem Team zugewiesen</h1>
              <p className="text-xs text-[#8B949E]">
                Dein Konto ist angemeldet, besitzt jedoch aktuell keine aktive Team-Mitgliedschaft.
                Bitte wende dich an deinen Team Admin oder öffne einen Einladungslink.
              </p>
            </div>
          )
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
            onProfilSpeichern={handleProfilSpeichern}
            onZugangSpeichern={handleZugangSpeichern}
            onZurueck={() => handleBereichWechseln('settings-hub')}
          />
        ) : bereich === 'team-settings' && aktiveTeamAnsicht === 'TEAM_ADMIN' ? (
          <TeamSettingsPage
            team={aktivesTeam}
            benutzer={aktuellerBenutzer}
            benutzerListe={
              teamMitgliederBenutzer.length > 0 ? teamMitgliederBenutzer : benutzerListe
            }
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
            onEinladungTesten={(token) => navigiereZuRoute({ art: 'invite', token })}
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
        onGlobalModuleSynchronisieren={setGlobalAktivierteModule}
      />
    </PluginProviderStack>
  );
}

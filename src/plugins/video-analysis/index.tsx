import type { PluginLaufzeitKontext, PluginTab, SidelinePlugin } from '../../sdk/plugin.ts';
import type { VideoModulTab } from './types.ts';
import { VIDEO_PLUGIN_MANIFEST } from './manifest.ts';
import { VideoAnalysisProvider, useVideoAnalysis } from './VideoAnalysisContext.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { FilmRoomView } from './components/FilmRoomView.tsx';
import { VideoCutSyncPlaceholder } from './components/VideoCutSyncPlaceholder.tsx';
import {
  VideoSysadminSettingsPanel,
  VideoTeamSettingsPanel,
  VideoUserSettingsPanel,
} from './components/VideoSettingsPanels.tsx';

function VideoAnalysisMainView({ ctx }: { ctx: PluginLaufzeitKontext }) {
  const video = useVideoAnalysis();
  const aktiverTab = (ctx.aktuellerTab || 'dashboard') as VideoModulTab;
  const aktivesReel = video.ermittleAusgewaehltesReel(
    ctx.team.id,
    ctx.gewaehlteSaison,
    ctx.aktiveTeamAnsicht
  );

  if (aktiverTab === 'film-room' && aktivesReel) {
    return (
      <FilmRoomView
        key={aktivesReel.id}
        reel={aktivesReel}
        teamRolle={ctx.aktiveTeamAnsicht}
        tagSchema={video.tagSchema}
        nutzerEinstellungen={video.nutzerEinstellungen}
        onZurueck={() => ctx.onTabWechseln('dashboard')}
        onSchemaSettingsOeffnen={ctx.onTeamSettingsOeffnen}
        onFreigabeAendern={video.onFreigabeAendern}
        onFeldAendern={video.onFeldAendern}
        onDefinitionLernen={video.onDefinitionLernen}
        onNotizHinzufuegen={video.onNotizHinzufuegen}
        onNotizBearbeiten={video.onNotizBearbeiten}
        onNotizLoeschen={video.onNotizLoeschen}
        onZeichnungHinzufuegen={video.onZeichnungHinzufuegen}
        onZeichnungAktualisieren={video.onZeichnungAktualisieren}
        onZeichnungEntfernen={video.onZeichnungEntfernen}
        onLetzteZeichnungEntfernen={video.onLetzteZeichnungEntfernen}
        onAlleZeichnungenLeeren={video.onAlleZeichnungenLeeren}
        onSessionVeroeffentlichen={video.onSessionVeroeffentlichen}
      />
    );
  }

  if (aktiverTab === 'cut-sync' || aktiverTab === 'playlists') {
    return (
      <VideoCutSyncPlaceholder
        ansicht={aktiverTab}
        ausgewaehltesReel={aktivesReel}
        onZurueckZumDashboard={() => ctx.onTabWechseln('dashboard')}
      />
    );
  }

  return (
    <DashboardView
      teamId={ctx.team.id}
      gewaehlteSaison={ctx.gewaehlteSaison}
      teamAktiveSaison={ctx.team.aktiveSaison}
      teamRolle={ctx.aktiveTeamAnsicht}
      tagSchema={video.tagSchema}
      reels={video.reels}
      uploadHervorgehoben={video.uploadHervorgehoben}
      onNeuesReel={video.onNeuesReel}
      onFreigabeAendern={video.onFreigabeAendern}
      onTeamFreigabenAendern={video.onTeamFreigabenAendern}
      onShareLinksAendern={video.onShareLinksAendern}
      onReelOeffnen={(reel) => {
        video.setAusgewaehltesReelId(reel.id);
        ctx.onTabWechseln('film-room');
      }}
    />
  );
}

function VideoPrimaerAktionButton({
  ctx,
  className,
}: {
  ctx: PluginLaufzeitKontext;
  className: string;
}) {
  const video = useVideoAnalysis();
  const istCoach = ctx.aktiveTeamAnsicht === 'COACH' || ctx.aktiveTeamAnsicht === 'TEAM_ADMIN';

  return (
    <button
      type="button"
      onClick={() => {
        if (istCoach) {
          ctx.onTabWechseln('dashboard');
          video.highlightUpload();
        } else {
          ctx.onTabWechseln('film-room');
        }
      }}
      className={className}
    >
      {istCoach ? 'Tapes hochladen' : 'Film Room öffnen'}
    </button>
  );
}

/**
 * Eigenständiges Videoanalyse-Plugin gemäß `@sidelineos/plugin-sdk`.
 * Kann unverändert in ein eigenes GitHub-Repository (`sidelineos-plugin-video`) extrahiert werden.
 */
export const videoAnalysisPlugin: SidelinePlugin = {
  manifest: VIDEO_PLUGIN_MANIFEST,
  Provider: VideoAnalysisProvider,
  defaultTab: 'dashboard',
  getTabs: ({ teamRolle }) => {
    const istCoach = teamRolle === 'COACH' || teamRolle === 'TEAM_ADMIN';
    const tabs: PluginTab[] = [{ id: 'dashboard', label: 'Bibliothek' }];
    if (istCoach) {
      tabs.push({ id: 'cut-sync', label: 'Cut & Sync' });
    }
    tabs.push({ id: 'film-room', label: 'Film Room' });
    tabs.push({ id: 'playlists', label: 'Playlists' });
    return tabs;
  },
  PrimaerAktion: VideoPrimaerAktionButton,
  renderMainView: (ctx) => <VideoAnalysisMainView ctx={ctx} />,
  settingsPanels: {
    user: VideoUserSettingsPanel,
    team: VideoTeamSettingsPanel,
    sysadmin: VideoSysadminSettingsPanel,
  },
};

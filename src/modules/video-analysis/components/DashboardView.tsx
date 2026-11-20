import { useMemo, useState } from 'react';
import {
  Download,
  Eye,
  Film,
  Lock,
  Play,
  Search,
  Share2,
  Users,
} from 'lucide-react';
import type {
  BenutzerRolle,
  ReelKategorie,
  SpielerFreigabe,
  VideoReel,
} from '../../../shared/types.ts';
import { FREIGABE_LABELS, KATEGORIE_LABELS } from '../../../shared/types.ts';
import { reelZuBundle } from '../services/bundleSchema.ts';
import { TeamShareModal } from './TeamShareModal.tsx';
import { UploadPanel } from './UploadPanel.tsx';

interface DashboardViewProps {
  teamId: string;
  rolle: BenutzerRolle;
  reels: VideoReel[];
  uploadHervorgehoben: boolean;
  onNeuesReel: (reel: VideoReel) => void;
  onFreigabeAendern: (reelId: string, freigabe: SpielerFreigabe) => void;
  onTeilenAendern: (reelId: string, teams: string[]) => void;
  onReelOeffnen: (reel: VideoReel) => void;
}

const KATEGORIE_TABS: Array<{ id: 'ALL' | ReelKategorie; label: string }> = [
  { id: 'ALL', label: 'Alle' },
  { id: 'GAME', label: 'Spiel' },
  { id: 'PRACTICE', label: 'Training' },
  { id: 'SCOUTING', label: 'Scouting' },
  { id: 'SELF_SCOUT', label: 'Self-Scout' },
];

const FREIGABE_OPTIONEN: SpielerFreigabe[] = [
  'COACHES_ONLY',
  'ALL_PLAYERS',
  'UNIT_OFFENSE',
  'UNIT_DEFENSE',
  'UNIT_SPECIAL_TEAMS',
];

function formatiereDatum(isoDatum: string): string {
  const teile = isoDatum.split('-');
  if (teile.length !== 3) return isoDatum;
  return `${teile[2]}.${teile[1]}.${teile[0]}`;
}

function ReelThumbnail({ src, titel }: { src: string; titel: string }) {
  const [bildFehler, setBildFehler] = useState(false);

  if (bildFehler) {
    return (
      <div className="flex aspect-video w-36 shrink-0 flex-col items-center justify-center rounded border border-[#232933] bg-[#0B0E11] text-[#8B949E]">
        <Film className="h-5 w-5" aria-hidden="true" />
        <span className="mt-1 text-[10px]">Vorschau</span>
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded border border-[#232933] bg-[#0B0E11]">
      <img
        src={src}
        alt={`Vorschaubild für ${titel}`}
        referrerPolicy="no-referrer"
        onError={() => setBildFehler(true)}
        className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
      />
    </div>
  );
}

export function DashboardView({
  teamId,
  rolle,
  reels,
  uploadHervorgehoben,
  onNeuesReel,
  onFreigabeAendern,
  onTeilenAendern,
  onReelOeffnen,
}: DashboardViewProps) {
  const [aktiveKategorie, setAktiveKategorie] = useState<'ALL' | ReelKategorie>('ALL');
  const [suchbegriff, setSuchbegriff] = useState('');
  const [teilenReelId, setTeilenReelId] = useState<string | null>(null);

  const gefilterteReels = useMemo(() => {
    const query = suchbegriff.trim().toLowerCase();
    return reels
      .filter((reel) => reel.teamId === teamId)
      // Spieler sehen strikt nur freigegebene Reels (niemals COACHES_ONLY)
      .filter((reel) => (rolle === 'PLAYER' ? reel.visibility !== 'COACHES_ONLY' : true))
      .filter((reel) => (aktiveKategorie === 'ALL' ? true : reel.category === aktiveKategorie))
      .filter((reel) =>
        query ? reel.title.toLowerCase().includes(query) || reel.eventDate.includes(query) : true
      )
      .sort((a, b) => b.eventDate.localeCompare(a.eventDate));
  }, [reels, teamId, rolle, aktiveKategorie, suchbegriff]);

  const teilenReel = reels.find((r) => r.id === teilenReelId) ?? null;

  const handleJsonExport = (reel: VideoReel) => {
    const bundle = reelZuBundle(reel);
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateiname = reel.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    link.href = url;
    link.download = `${dateiname || reel.id}.sideline.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* Filter- & Suchleiste */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div
          role="tablist"
          aria-label="Kategorien filtern"
          className="flex items-center gap-1 rounded-md border border-[#232933] bg-[#13171D] p-1"
        >
          {KATEGORIE_TABS.map((tab) => {
            const aktiv = aktiveKategorie === tab.id;
            return (
              <button
                key={tab.id}
                role="tab"
                type="button"
                aria-selected={aktiv}
                onClick={() => setAktiveKategorie(tab.id)}
                className={`rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                  aktiv
                    ? 'bg-[#232933] text-white'
                    : 'text-[#8B949E] hover:text-[#E6EDF3]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8B949E]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={suchbegriff}
            onChange={(e) => setSuchbegriff(e.target.value)}
            placeholder="Spiel, Gegner oder Datum suchen..."
            aria-label="Videobibliothek durchsuchen"
            className="w-full rounded-md border border-[#232933] bg-[#13171D] py-2 pl-8 pr-3 text-xs text-white placeholder-[#6E7681] focus:border-[#F59E0B] focus:outline-none"
          />
        </div>
      </div>

      {/* Hauptbereich: Bibliothek + Upload/JSON-Import (nur für Coaches) */}
      <div
        className={`grid grid-cols-1 gap-6 ${
          rolle === 'COACH' ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''
        }`}
      >
        <section aria-label="Videobibliothek" className="min-w-0 space-y-3">
          {rolle === 'PLAYER' && (
            <div className="flex items-center justify-between rounded-md border border-[#232933] bg-[#13171D] px-4 py-2.5 text-xs text-[#8B949E]">
              <span>
                Spieler-Ansicht aktiv: Du siehst ausschließlich Reels, die vom Coaching Staff
                freigegeben wurden.
              </span>
              <span className="font-mono text-[#E6EDF3] tabular-nums">
                {gefilterteReels.length} freigegeben
              </span>
            </div>
          )}

          {gefilterteReels.length === 0 ? (
            <div className="rounded-lg border border-[#232933] bg-[#13171D] px-6 py-14 text-center">
              <p className="text-sm font-medium text-[#E6EDF3]">
                Keine Videos für diese Auswahl gefunden.
              </p>
              <p className="mt-1 text-xs text-[#8B949E]">
                {rolle === 'COACH'
                  ? 'Lade rechts Einzelclips, ein Raw-Tape oder ein sideline-bundle.json hoch.'
                  : 'Aktuell sind in dieser Kategorie keine Tapes für Spieler freigegeben.'}
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-[#232933] bg-[#13171D] divide-y divide-[#232933]">
              {gefilterteReels.map((reel) => {
                const prozent =
                  reel.playCount > 0 ? Math.round((reel.taggedCount / reel.playCount) * 100) : 0;
                const istNurCoaches = reel.visibility === 'COACHES_ONLY';

                return (
                  <article
                    key={reel.id}
                    className="group flex flex-col gap-4 p-4 transition-colors hover:bg-[#171C24] xl:flex-row xl:items-center xl:justify-between"
                  >
                    {/* Links: Thumbnail + Titel + unboxed Metadaten */}
                    <div className="flex min-w-0 items-start gap-4">
                      <button
                        type="button"
                        onClick={() => onReelOeffnen(reel)}
                        className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F59E0B]"
                        aria-label={`${reel.title} im Film Room öffnen`}
                      >
                        <ReelThumbnail src={reel.thumbnailUrl} titel={reel.title} />
                      </button>

                      <div className="min-w-0 flex-1 space-y-1.5">
                        <button
                          type="button"
                          onClick={() => onReelOeffnen(reel)}
                          className="block truncate text-left text-sm font-semibold text-white transition-colors hover:text-[#F59E0B]"
                        >
                          {reel.title}
                        </button>

                        {/* Unboxed Metadata mit sauberen Trennern */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#8B949E]">
                          <span>{KATEGORIE_LABELS[reel.category]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {formatiereDatum(reel.eventDate)}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{reel.angles.join(' + ')}</span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {reel.sourceMode === 'TIME_SLICE'
                              ? 'Einzeldatei (Time-Slice)'
                              : 'Einzelclips'}
                          </span>
                        </div>

                        {/* Breakdown-Fortschritt + Tausch-Hinweis */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[#E6EDF3] tabular-nums">
                              {reel.playCount} Plays
                            </span>
                            <div
                              className="h-1.5 w-24 overflow-hidden rounded-full bg-[#232933]"
                              aria-label={`${prozent} Prozent getaggt`}
                            >
                              <div
                                className="h-full bg-[#F59E0B]"
                                style={{ width: `${prozent}%` }}
                              />
                            </div>
                            <span className="font-mono text-[#8B949E] tabular-nums">
                              {prozent}% getaggt
                            </span>
                          </div>

                          {reel.sharedWithTeams.length > 0 && (
                            <span className="text-[#8B949E]">
                              Geteilt mit: {reel.sharedWithTeams.join(', ')}
                            </span>
                          )}
                          {reel.receivedFromTeam && (
                            <span className="text-[#8B949E]">
                              Erhalten von: {reel.receivedFromTeam}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Rechts: Spieler-Freigabe & Aktionen */}
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#232933] pt-3 xl:justify-end xl:border-t-0 xl:pt-0">
                      {/* Explizite Spieler-Freigabe */}
                      {rolle === 'COACH' ? (
                        <label className="flex items-center gap-2 text-xs text-[#8B949E]">
                          {istNurCoaches ? (
                            <Lock className="h-3.5 w-3.5 text-[#8B949E]" aria-hidden="true" />
                          ) : (
                            <Users className="h-3.5 w-3.5 text-[#4ADE80]" aria-hidden="true" />
                          )}
                          <span className="sr-only">Spieler-Freigabe für {reel.title}</span>
                          <select
                            value={reel.visibility}
                            onChange={(e) =>
                              onFreigabeAendern(reel.id, e.target.value as SpielerFreigabe)
                            }
                            className={`rounded-md border px-2.5 py-1.5 text-xs font-medium focus:border-[#F59E0B] focus:outline-none ${
                              istNurCoaches
                                ? 'border-[#232933] bg-[#0B0E11] text-[#8B949E]'
                                : 'border-[#16A34A]/40 bg-[#16A34A]/10 text-[#86EFAC]'
                            }`}
                          >
                            {FREIGABE_OPTIONEN.map((option) => (
                              <option
                                key={option}
                                value={option}
                                className="bg-[#13171D] text-[#E6EDF3]"
                              >
                                Freigabe: {FREIGABE_LABELS[option]}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#86EFAC]">
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          Freigegeben: {FREIGABE_LABELS[reel.visibility]}
                        </span>
                      )}

                      <div className="flex items-center gap-1.5">
                        {rolle === 'COACH' && (
                          <>
                            <button
                              type="button"
                              onClick={() => setTeilenReelId(reel.id)}
                              title="Mit anderem Team tauschen"
                              className="inline-flex items-center gap-1 rounded-md border border-[#232933] bg-[#0B0E11] px-2.5 py-1.5 text-xs font-medium text-[#E6EDF3] transition-colors hover:border-[#36404F] hover:text-white whitespace-nowrap"
                            >
                              <Share2 className="h-3.5 w-3.5 text-[#8B949E]" aria-hidden="true" />
                              Teilen
                            </button>
                            <button
                              type="button"
                              onClick={() => handleJsonExport(reel)}
                              title="Als sideline-bundle.json exportieren"
                              className="inline-flex items-center gap-1 rounded-md border border-[#232933] bg-[#0B0E11] px-2.5 py-1.5 text-xs font-medium text-[#E6EDF3] transition-colors hover:border-[#36404F] hover:text-white whitespace-nowrap"
                            >
                              <Download
                                className="h-3.5 w-3.5 text-[#8B949E]"
                                aria-hidden="true"
                              />
                              JSON
                            </button>
                          </>
                        )}

                        <button
                          type="button"
                          onClick={() => onReelOeffnen(reel)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#232933] bg-[#1E2530] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-[#F59E0B] whitespace-nowrap"
                        >
                          <Play className="h-3 w-3 text-[#F59E0B]" aria-hidden="true" />
                          Öffnen
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Rechte Spalte: Upload & JSON-Import (nur für Coaches) */}
        {rolle === 'COACH' && (
          <UploadPanel
            teamId={teamId}
            hervorgehoben={uploadHervorgehoben}
            onNeuesReelHinzufuegen={onNeuesReel}
          />
        )}
      </div>

      {/* Team-Sharing Modal */}
      {teilenReel && (
        <TeamShareModal
          reel={teilenReel}
          onSchliessen={() => setTeilenReelId(null)}
          onTeilenAendern={onTeilenAendern}
        />
      )}
    </div>
  );
}

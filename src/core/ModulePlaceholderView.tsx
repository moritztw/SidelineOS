import { ArrowLeft, Film, Layers, ListFilter, Settings } from 'lucide-react';
import type { NavigationsAnsicht, VideoReel } from '../shared/types.ts';
import { FREIGABE_LABELS, KATEGORIE_LABELS } from '../shared/types.ts';

interface ModulePlaceholderViewProps {
  ansicht: Exclude<NavigationsAnsicht, 'dashboard'>;
  ausgewaehltesReel: VideoReel | null;
  onZurueckZumDashboard: () => void;
}

const ANSICHT_META: Record<
  Exclude<NavigationsAnsicht, 'dashboard'>,
  { titel: string; paket: string; beschreibung: string }
> = {
  'film-room': {
    titel: 'Film Room & Breakdown-Matrix',
    paket: 'Paket 2',
    beschreibung:
      'Interaktiver Player mit Angle-Switcher (Sideline / Endzone), normalisiertem Vektor-Canvas, Auto-Stop, Draft/Publish-Session und Hudl-konformer Tastatur-Tabelle.',
  },
  'cut-sync': {
    titel: 'Cut & Multi-Angle Sync Editor',
    paket: 'Paket 3',
    beschreibung:
      'Dual-Viewport für Einzelclip-Sync (inkl. optionalem Offset, Snap-Sync, Lücken & Fehl-Clip-Löschung) sowie Fast-Cut-Editor für Einzeldatei-Tapes (I / O Auto-Out / J-K-L).',
  },
  playlists: {
    titel: 'Smart Playlists & Filter-Grid',
    paket: 'Paket 3',
    beschreibung:
      'Dynamische Cutups über beliebige Breakdown-Spalten (z. B. alle 3rd Downs in der Redzone) sowie typsichere Suchanfragen.',
  },
  settings: {
    titel: 'Team- & Instanz-Einstellungen',
    paket: 'Paket 3',
    beschreibung:
      'Team-Farbpaletten für das Vektor-Canvas, Breakdown-Schema, App2App-Sharing-Token sowie Sysadmin-Optionen.',
  },
};

export function ModulePlaceholderView({
  ansicht,
  ausgewaehltesReel,
  onZurueckZumDashboard,
}: ModulePlaceholderViewProps) {
  const meta = ANSICHT_META[ansicht];
  const Icon =
    ansicht === 'film-room'
      ? Film
      : ansicht === 'cut-sync'
        ? Layers
        : ansicht === 'playlists'
          ? ListFilter
          : Settings;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onZurueckZumDashboard}
          className="inline-flex items-center gap-2 text-sm text-[#8B949E] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Zurück zur Videobibliothek
        </button>
      </div>

      <section className="rounded-lg border border-[#232933] bg-[#13171D] p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-3 text-[#F59E0B]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <p className="font-mono text-xs text-[#F59E0B]">Geplant in {meta.paket}</p>
            <h1 className="text-xl font-semibold text-white">{meta.titel}</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[#8B949E]">{meta.beschreibung}</p>
          </div>
        </div>

        {ausgewaehltesReel && (ansicht === 'film-room' || ansicht === 'cut-sync') && (
          <div className="mt-6 border-t border-[#232933] pt-6">
            <h2 className="text-xs font-medium text-[#8B949E]">
              Aktuell gewähltes Reel für diese Ansicht
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 rounded-md border border-[#232933] bg-[#0B0E11] p-4">
              <div>
                <div className="text-sm font-semibold text-white">{ausgewaehltesReel.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8B949E]">
                  <span>{KATEGORIE_LABELS[ausgewaehltesReel.category]}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{ausgewaehltesReel.eventDate}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{ausgewaehltesReel.playCount} Plays</span>
                  <span aria-hidden="true">·</span>
                  <span>Winkel: {ausgewaehltesReel.angles.join(' + ')}</span>
                  <span aria-hidden="true">·</span>
                  <span>Freigabe: {FREIGABE_LABELS[ausgewaehltesReel.visibility]}</span>
                </div>
              </div>
              <span className="font-mono text-xs text-[#8B949E]">
                Modus: {ausgewaehltesReel.sourceMode === 'TIME_SLICE' ? 'Einzeldatei (Time-Slice)' : 'Einzelclips'}
              </span>
            </div>

            {ausgewaehltesReel.plays.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#232933] text-[#8B949E]">
                      <th className="py-2 font-medium">#</th>
                      <th className="py-2 font-medium">Quellen (Winkel)</th>
                      <th className="py-2 font-medium">Offset (Optional)</th>
                      <th className="py-2 font-medium">ODK / Situation</th>
                      <th className="py-2 font-medium">Play Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232933]">
                    {ausgewaehltesReel.plays.map((play) => {
                      const winkelEintraege = Object.entries(play.sources);
                      const offsets = winkelEintraege
                        .filter(([, q]) => q?.offset_ms !== undefined && q.offset_ms !== 0)
                        .map(([w, q]) => `${w}: ${(q!.offset_ms! / 1000).toFixed(2)}s`);

                      return (
                        <tr key={play.play_number}>
                          <td className="py-2.5 font-mono text-[#E6EDF3] tabular-nums">
                            P-{String(play.play_number).padStart(2, '0')}
                          </td>
                          <td className="py-2.5 font-mono text-[#E6EDF3]">
                            {winkelEintraege
                              .map(([w, q]) => (q ? `${w} (${q.file})` : `${w} (Fehlt)`))
                              .join(' · ')}
                          </td>
                          <td className="py-2.5 font-mono text-[#8B949E] tabular-nums">
                            {offsets.length > 0 ? offsets.join(', ') : 'Kein Offset (Standard)'}
                          </td>
                          <td className="py-2.5 font-mono text-[#E6EDF3] tabular-nums">
                            {play.breakdown?.odk ?? '–'} · {play.breakdown?.down ?? '–'} &amp;{' '}
                            {play.breakdown?.distance ?? '–'}
                          </td>
                          <td className="py-2.5 text-[#E6EDF3]">
                            {play.breakdown?.play_type ?? '–'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

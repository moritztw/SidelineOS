import { Download } from 'lucide-react';
import type {
  BenutzerRolle,
  HashWert,
  OdkWert,
  PlayBreakdown,
  PlayTyp,
  Spielzug,
} from '../../../shared/types.ts';
import { exportiereBreakdownAlsCsv } from '../services/bundleSchema.ts';

interface BreakdownGridProps {
  reelTitel: string;
  plays: Spielzug[];
  aktiverPlayIndex: number;
  rolle: BenutzerRolle;
  onPlayWaehlen: (index: number) => void;
  onBreakdownAendern: (playNumber: number, patch: Partial<PlayBreakdown>) => void;
}

export function BreakdownGrid({
  reelTitel,
  plays,
  aktiverPlayIndex,
  rolle,
  onPlayWaehlen,
  onBreakdownAendern,
}: BreakdownGridProps) {
  const istCoach = rolle === 'COACH';

  const handleCsvExport = () => {
    const csv = exportiereBreakdownAlsCsv(plays);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const datei = reelTitel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    a.href = url;
    a.download = `${datei || 'breakdown'}-hudl.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Hudl-konforme Breakdown-Tabelle"
      className="overflow-hidden rounded-lg border border-[#232933] bg-[#13171D]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#232933] px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-xs font-semibold text-white">Breakdown Data Grid</h2>
          <span className="font-mono text-[11px] text-[#8B949E] tabular-nums">
            {plays.length} Plays · Pfeiltasten ↑/↓ wechseln · Leertaste Play/Pause · A Winkel
          </span>
        </div>

        <button
          type="button"
          onClick={handleCsvExport}
          className="inline-flex items-center gap-1.5 rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 text-[11px] font-medium text-[#E6EDF3] transition-colors hover:border-[#F59E0B] hover:text-white whitespace-nowrap"
        >
          <Download className="h-3 w-3 text-[#8B949E]" aria-hidden="true" />
          Hudl CSV exportieren
        </button>
      </div>

      {plays.length === 0 ? (
        <div className="px-6 py-10 text-center text-xs text-[#8B949E]">
          Dieses Reel enthält noch keine geschnittenen Plays.
        </div>
      ) : (
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="sticky top-0 z-10 border-b border-[#232933] bg-[#0F1318] text-[11px] font-medium text-[#8B949E]">
              <tr>
                <th className="px-3 py-2 font-mono">#</th>
                <th className="px-2 py-2">ODK</th>
                <th className="px-2 py-2 text-right">DN</th>
                <th className="px-2 py-2 text-right">DIST</th>
                <th className="px-2 py-2 text-right">YD LN</th>
                <th className="px-2 py-2">HASH</th>
                <th className="px-2 py-2">PLAY TYPE</th>
                <th className="px-2 py-2">OFF FORM</th>
                <th className="px-2 py-2">DEF FRONT</th>
                <th className="px-2 py-2">COVERAGE</th>
                <th className="px-2 py-2">RESULT</th>
                <th className="px-2 py-2 text-right">GN/LS</th>
                <th className="px-3 py-2 text-right">WINKEL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232933]">
              {plays.map((play, idx) => {
                const istAktiv = idx === aktiverPlayIndex;
                const b = play.breakdown ?? {};
                const vorhandeneWinkel = Object.entries(play.sources)
                  .filter(([, q]) => q !== null)
                  .map(([k]) => (k === 'SIDELINE' ? 'SL' : k === 'ENDZONE' ? 'EZ' : k.slice(0, 2)));

                const sichtbareNotizen = (play.notes ?? []).filter((n) =>
                  rolle === 'PLAYER' ? n.status === 'PUBLISHED' : true
                ).length;

                return (
                  <tr
                    key={play.play_number}
                    onClick={() => onPlayWaehlen(idx)}
                    className={`h-9 cursor-pointer transition-colors ${
                      istAktiv ? 'bg-[#F59E0B]/12 text-white' : 'text-[#E6EDF3] hover:bg-[#191F27]'
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono tabular-nums whitespace-nowrap">
                      <span className={istAktiv ? 'font-semibold text-[#F59E0B]' : 'text-[#8B949E]'}>
                        #{play.play_number}
                      </span>
                      {sichtbareNotizen > 0 && (
                        <span className="ml-1.5 text-[10px] text-[#8B949E]">
                          ({sichtbareNotizen})
                        </span>
                      )}
                    </td>

                    <td className="px-2 py-1">
                      {istAktiv && istCoach ? (
                        <select
                          aria-label={`ODK Play ${play.play_number}`}
                          value={b.odk ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onBreakdownAendern(play.play_number, {
                              odk: (e.target.value || undefined) as OdkWert | undefined,
                            })
                          }
                          className="w-12 rounded border border-[#36404F] bg-[#0B0E11] px-1 py-0.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                        >
                          <option value="">–</option>
                          <option value="O">O</option>
                          <option value="D">D</option>
                          <option value="K">K</option>
                        </select>
                      ) : (
                        <span className="font-mono">{b.odk ?? '–'}</span>
                      )}
                    </td>

                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {istAktiv && istCoach ? (
                        <select
                          aria-label={`Down Play ${play.play_number}`}
                          value={b.down ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onBreakdownAendern(play.play_number, {
                              down: e.target.value
                                ? (Number(e.target.value) as 1 | 2 | 3 | 4)
                                : undefined,
                            })
                          }
                          className="w-12 rounded border border-[#36404F] bg-[#0B0E11] px-1 py-0.5 text-right font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                        >
                          <option value="">–</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                        </select>
                      ) : (
                        b.down ?? '–'
                      )}
                    </td>

                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {istAktiv && istCoach ? (
                        <input
                          type="number"
                          aria-label={`Distance Play ${play.play_number}`}
                          value={b.distance ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onBreakdownAendern(play.play_number, {
                              distance: e.target.value === '' ? undefined : Number(e.target.value),
                            })
                          }
                          className="w-12 rounded border border-[#36404F] bg-[#0B0E11] px-1 py-0.5 text-right font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                        />
                      ) : (
                        b.distance ?? '–'
                      )}
                    </td>

                    <td className="px-2 py-1 text-right font-mono tabular-nums">
                      {b.yard_line ?? '–'}
                    </td>

                    <td className="px-2 py-1 font-mono">
                      {istAktiv && istCoach ? (
                        <select
                          aria-label={`Hash Play ${play.play_number}`}
                          value={b.hash ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onBreakdownAendern(play.play_number, {
                              hash: (e.target.value || undefined) as HashWert | undefined,
                            })
                          }
                          className="w-12 rounded border border-[#36404F] bg-[#0B0E11] px-1 py-0.5 font-mono text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                        >
                          <option value="">–</option>
                          <option value="L">L</option>
                          <option value="M">M</option>
                          <option value="R">R</option>
                        </select>
                      ) : (
                        b.hash ?? '–'
                      )}
                    </td>

                    <td className="px-2 py-1">
                      {istAktiv && istCoach ? (
                        <select
                          aria-label={`Play Type Play ${play.play_number}`}
                          value={b.play_type ?? ''}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) =>
                            onBreakdownAendern(play.play_number, {
                              play_type: (e.target.value || undefined) as PlayTyp | undefined,
                            })
                          }
                          className="w-20 rounded border border-[#36404F] bg-[#0B0E11] px-1 py-0.5 text-xs text-white focus:border-[#F59E0B] focus:outline-none"
                        >
                          <option value="">–</option>
                          <option value="RUN">RUN</option>
                          <option value="PASS">PASS</option>
                          <option value="SPECIAL">SPECIAL</option>
                          <option value="PENALTY">PENALTY</option>
                        </select>
                      ) : (
                        b.play_type ?? '–'
                      )}
                    </td>

                    <td className="px-2 py-1 whitespace-nowrap">{b.off_form || '–'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{b.def_front || '–'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{b.coverage || '–'}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{b.result || '–'}</td>

                    <td
                      className={`px-2 py-1 text-right font-mono tabular-nums ${
                        b.gn_ls !== undefined && b.gn_ls > 0
                          ? 'text-[#4ADE80]'
                          : b.gn_ls !== undefined && b.gn_ls < 0
                            ? 'text-[#FCA5A5]'
                            : 'text-[#8B949E]'
                      }`}
                    >
                      {b.gn_ls !== undefined ? (b.gn_ls > 0 ? `+${b.gn_ls}` : b.gn_ls) : '–'}
                    </td>

                    <td className="px-3 py-1 text-right font-mono text-[11px] text-[#8B949E] whitespace-nowrap">
                      {vorhandeneWinkel.join(' / ')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

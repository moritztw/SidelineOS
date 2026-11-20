import { useState } from 'react';
import { HardDrive, RotateCcw, ShieldAlert, Trash2 } from 'lucide-react';
import { DEMO_TEAMS } from '../modules/video-analysis/data/demoReels.ts';

interface CleanupEintrag {
  id: string;
  assetPfad: string;
  groesseGb: number;
  geplanteLoeschung: string;
  restTage: number;
}

const INITIALE_QUEUE: CleanupEintrag[] = [
  {
    id: 'gc-1',
    assetPfad: 'assets/reels/a8f12c90-4b21/clips/',
    groesseGb: 3.4,
    geplanteLoeschung: '04.12.2026',
    restTage: 14,
  },
  {
    id: 'gc-2',
    assetPfad: 'assets/reels/d390e112-90ab/raw_source.mp4',
    groesseGb: 8.7,
    geplanteLoeschung: '22.11.2026',
    restTage: 2,
  },
];

export function SysadminIsolationView() {
  const [retentionTage, setRetentionTage] = useState<number>(14);
  const [queue, setQueue] = useState<CleanupEintrag[]>(INITIALE_QUEUE);
  const [statusMeldung, setStatusMeldung] = useState<string | null>(null);

  const handleWiederherstellen = (id: string) => {
    setQueue((alt) => alt.filter((item) => item.id !== id));
    setStatusMeldung('Löschung zurückgenommen – Asset-Referenz wurde wiederhergestellt.');
  };

  const handleSofortBereinigen = () => {
    const anzahl = queue.length;
    if (anzahl === 0) return;
    setQueue([]);
    setStatusMeldung(`${anzahl} vorgemerkte S3-Assets wurden sofort aus dem Bucket bereinigt.`);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-[#232933] bg-[#13171D] p-6">
        <div className="flex items-start gap-4">
          <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-2.5 text-[#F59E0B]">
            <ShieldAlert className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h1 className="text-lg font-semibold text-white">
              Instanz-Administration (Kein Zugriff auf Team-Inhalte)
            </h1>
            <p className="max-w-3xl text-sm text-[#8B949E]">
              Als Instance Admin verwaltest du Mandanten, S3-Storage und Cleanup-Regeln. Videos,
              Breakdowns, Spielernotizen und Team-Zeichnungen sind aus Datenschutzgründen in dieser
              Rolle vollständig ausgeblendet.
            </p>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Mandanten-Übersicht */}
        <section className="rounded-lg border border-[#232933] bg-[#13171D] p-5">
          <h2 className="text-sm font-semibold text-white">Aktive Mandanten</h2>
          <p className="mt-1 text-xs text-[#8B949E]">
            Reine Instanz-Metadaten ohne Einsicht in Videos oder Playbooks.
          </p>
          <ul className="mt-4 divide-y divide-[#232933]">
            {DEMO_TEAMS.map((team) => (
              <li key={team.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <div className="font-medium text-[#E6EDF3]">{team.name}</div>
                  <div className="text-xs text-[#8B949E]">Saison {team.saison} · Modul A aktiv</div>
                </div>
                <span className="font-mono text-xs text-[#8B949E] tabular-nums">{team.kurzname}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* S3 Cleanup Queue & Retention Delay */}
        <section className="rounded-lg border border-[#232933] bg-[#13171D] p-5 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#232933] pb-4">
            <div className="flex items-center gap-2.5">
              <HardDrive className="h-4 w-4 text-[#8B949E]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  S3-Cleanup-Queue (ref_count = 0)
                </h2>
                <p className="text-xs text-[#8B949E]">
                  Verwaiste Assets bleiben bis zum Ablauf der Schonfrist wiederherstellbar.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-[#8B949E]">
                Schonfrist (Tage)
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={retentionTage}
                  onChange={(e) => setRetentionTage(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 rounded border border-[#232933] bg-[#0B0E11] px-2 py-1 font-mono text-xs text-white tabular-nums focus:border-[#F59E0B] focus:outline-none"
                />
              </label>

              <button
                type="button"
                disabled={queue.length === 0}
                onClick={handleSofortBereinigen}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#DC2626]/40 bg-[#DC2626]/10 px-3 py-1.5 text-xs font-medium text-[#FCA5A5] transition-colors hover:bg-[#DC2626]/20 disabled:cursor-not-allowed disabled:opacity-40 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Cleanup jetzt ausführen
              </button>
            </div>
          </div>

          {statusMeldung && (
            <div
              role="status"
              className="mt-4 rounded-md border border-[#16A34A]/30 bg-[#16A34A]/10 px-3 py-2 text-xs text-[#86EFAC]"
            >
              {statusMeldung}
            </div>
          )}

          {queue.length === 0 ? (
            <div className="py-10 text-center text-sm text-[#8B949E]">
              Keine verwaisten S3-Objekte in der Löschwarteschlange.
            </div>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#232933] text-[#8B949E]">
                    <th className="py-2 font-medium">Anonymisierter S3-Pfad</th>
                    <th className="py-2 text-right font-medium">Größe</th>
                    <th className="py-2 text-right font-medium">Löschung am</th>
                    <th className="py-2 text-right font-medium">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232933]">
                  {queue.map((eintrag) => (
                    <tr key={eintrag.id} className="hover:bg-[#191F27]">
                      <td className="py-3 font-mono text-[#E6EDF3]">{eintrag.assetPfad}</td>
                      <td className="py-3 text-right font-mono text-[#E6EDF3] tabular-nums">
                        {eintrag.groesseGb.toFixed(1)} GB
                      </td>
                      <td className="py-3 text-right font-mono text-[#8B949E] tabular-nums">
                        {eintrag.geplanteLoeschung} ({eintrag.restTage} T.)
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleWiederherstellen(eintrag.id)}
                          className="inline-flex items-center gap-1 rounded border border-[#232933] bg-[#0B0E11] px-2.5 py-1 text-xs font-medium text-[#E6EDF3] transition-colors hover:border-[#F59E0B] hover:text-white"
                        >
                          <RotateCcw className="h-3 w-3" aria-hidden="true" />
                          Wiederherstellen
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

import { ArrowLeft, BookOpen, ClipboardCheck } from 'lucide-react';
import type { ModulId } from '../../shared/types.ts';
import { findeModulManifest } from '../moduleRegistry.ts';

interface ModulePreviewViewProps {
  modulId: Exclude<ModulId, 'video-analysis'>;
  onZurUebersicht: () => void;
}

export function ModulePreviewView({ modulId, onZurUebersicht }: ModulePreviewViewProps) {
  const manifest = findeModulManifest(modulId);
  const Icon = modulId === 'playbook' ? BookOpen : ClipboardCheck;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onZurUebersicht}
        className="inline-flex items-center gap-2 text-sm text-[#8B949E] transition-colors hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Zurück zur SidelineOS-Übersicht
      </button>

      <section className="rounded-lg border border-[#232933] bg-[#13171D] p-8">
        <div className="flex items-start gap-4">
          <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-3 text-[#F59E0B]">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-2">
            <div className="font-mono text-xs text-[#F59E0B]">
              Modulares Testmodul · {manifest?.version ?? '0.1.0-preview'}
            </div>
            <h1 className="text-xl font-semibold text-white">{manifest?.name ?? modulId}</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-[#8B949E]">
              {manifest?.kurzbeschreibung}
            </p>
            <p className="pt-2 text-xs text-[#6E7681]">
              Dieses Modul demonstriert die modulare SidelineOS-Architektur: Es lässt sich im
              Sysadmin-Bereich sowohl instanzweit (analog{' '}
              <span className="font-mono text-[#8B949E]">ENABLED_MODULES</span>) als auch gezielt
              pro Team aktivieren oder ausblenden.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

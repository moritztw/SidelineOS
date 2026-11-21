import { ArrowLeft, BookOpen, ClipboardCheck, Puzzle } from 'lucide-react';
import type { PluginManifest, SidelinePlugin } from '../sdk/plugin.ts';

/**
 * Erstellt ein typsicheres Vorschau-Plugin aus einem deklarativen PluginManifest.
 * Wird für noch nicht implementierte Store-Module sowie manuell per GitHub-URL
 * eingebundene Dritt-Plugins im Prototyp verwendet.
 */
export function erstelleVorschauPluginAusManifest(manifest: PluginManifest): SidelinePlugin {
  const Icon =
    manifest.icon === 'book-open'
      ? BookOpen
      : manifest.icon === 'clipboard-check'
        ? ClipboardCheck
        : Puzzle;

  return {
    manifest,
    defaultTab: 'uebersicht',
    getTabs: () => [{ id: 'uebersicht', label: 'Modul-Übersicht' }],
    PrimaerAktion: ({ ctx, className }) => (
      <button type="button" onClick={ctx.onZurueckZurStartseite} className={className}>
        Zur Startseite
      </button>
    ),
    renderMainView: (ctx) => (
      <div className="space-y-6">
        <button
          type="button"
          onClick={ctx.onZurueckZurStartseite}
          className="inline-flex items-center gap-2 text-sm text-[#8B949E] transition-colors hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Zurück zur SidelineOS-Startseite
        </button>

        <section className="rounded-lg border border-[#232933] bg-[#13171D] p-8 space-y-4">
          <div className="flex items-start gap-4">
            <div className="rounded-md border border-[#232933] bg-[#0B0E11] p-3 text-[#F59E0B]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <div className="font-mono text-xs text-[#F59E0B]">
                Externes SidelineOS-Plugin · v{manifest.version} · SDK {manifest.sdkVersion}
              </div>
              <h1 className="text-xl font-semibold text-white">{manifest.name}</h1>
              <p className="max-w-2xl text-sm leading-relaxed text-[#8B949E]">
                {manifest.kurzbeschreibung}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 border-t border-[#232933] pt-4 text-xs sm:grid-cols-3">
            <div className="rounded border border-[#232933] bg-[#0B0E11] p-3">
              <div className="text-[#8B949E]">Repository</div>
              <div className="mt-1 truncate font-mono text-[#E6EDF3]">
                {manifest.repositoryUrl}
              </div>
            </div>
            <div className="rounded border border-[#232933] bg-[#0B0E11] p-3">
              <div className="text-[#8B949E]">Isoliertes DB-Präfix</div>
              <div className="mt-1 font-mono text-[#E6EDF3]">{manifest.dbPrefix}*</div>
            </div>
            <div className="rounded border border-[#232933] bg-[#0B0E11] p-3">
              <div className="text-[#8B949E]">Berechtigungen</div>
              <div className="mt-1 font-mono text-[#E6EDF3]">
                {manifest.permissions.join(', ')}
              </div>
            </div>
          </div>
        </section>
      </div>
    ),
  };
}

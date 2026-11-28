import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { HardDrive, PackagePlus, ShieldAlert, Trash2 } from 'lucide-react';
import {
  istPrivilegierteCapability,
  type PrivilegiertePluginPermission,
} from '../../sdk/plugin.ts';
import { STANDARD_THEME_REF, type VerfuegbaresThemeEintrag } from '../../shared/theme.ts';
import type { ClubSpeicherStatus } from '../../shared/types.ts';
import {
  CoreApiError,
  coreApi,
  type InstalliertesPluginDTO,
  type SystemStatusDTO,
} from '../apiClient.ts';
import { formatiereBytes } from '../layout/SystemBanner.tsx';

interface SystemRecoveryPanelProps {
  verfuegbareThemes: VerfuegbaresThemeEintrag[];
  onSystemGeaendert: () => Promise<void>;
}

/**
 * Minimaler Core-Notfall-Admin (`/admin/system/recovery`):
 * Bewusst schlank gehalten — Systemstatus, `.tar.gz`-Archiv-Installer, Plugin-Enable/Capabilities,
 * Instanz-Theme und reine Speicher-Metadaten (#21–#24, strikt ohne Vereinsinhalte).
 */
export function SystemRecoveryPanel({
  verfuegbareThemes,
  onSystemGeaendert,
}: SystemRecoveryPanelProps) {
  const [status, setStatus] = useState<SystemStatusDTO | null>(null);
  const [plugins, setPlugins] = useState<InstalliertesPluginDTO[]>([]);
  const [clubsSpeicher, setClubsSpeicher] = useState<
    Array<{ id: string; slug: string; name: string; speicher: ClubSpeicherStatus }>
  >([]);
  const [archiveUrl, setArchiveUrl] = useState('');
  const [autoEnable, setAutoEnable] = useState(true);
  const [laedt, setLaedt] = useState(true);
  const [aktionLaeuft, setAktionLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);

  const ladeDaten = useCallback(async () => {
    setLaedt(true);
    setFehler(null);
    try {
      const [statusRes, pluginsRes, clubsRes] = await Promise.all([
        coreApi.holeSystemStatus(),
        coreApi.listeSystemPlugins(),
        coreApi.listeClubsSpeicher(),
      ]);
      setStatus(statusRes);
      setPlugins(pluginsRes.plugins);
      setClubsSpeicher(clubsRes.clubs);
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Systemdaten nicht ladbar.');
    } finally {
      setLaedt(false);
    }
  }, []);

  useEffect(() => {
    void ladeDaten();
  }, [ladeDaten]);

  const installiereVonUrl = async (e: FormEvent) => {
    e.preventDefault();
    if (!archiveUrl.trim()) return;
    setAktionLaeuft(true);
    setFehler(null);
    setMeldung(null);
    try {
      const res = await coreApi.installierePluginArchiv({
        archiveUrl: archiveUrl.trim(),
        autoEnable,
      });
      setArchiveUrl('');
      setMeldung(`Plugin "${res.plugin.pluginId}" v${res.plugin.version} installiert.`);
      await ladeDaten();
      await onSystemGeaendert();
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Archiv-Installation fehlgeschlagen.');
    } finally {
      setAktionLaeuft(false);
    }
  };

  const installiereVonDatei = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAktionLaeuft(true);
    setFehler(null);
    setMeldung(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      const res = await coreApi.installierePluginArchiv({
        archiveBase64: btoa(binary),
        fileName: file.name,
        autoEnable,
      });
      setMeldung(`Plugin "${res.plugin.pluginId}" v${res.plugin.version} installiert.`);
      await ladeDaten();
      await onSystemGeaendert();
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Datei-Installation fehlgeschlagen.');
    } finally {
      setAktionLaeuft(false);
    }
  };

  const togglePluginAktiv = async (plugin: InstalliertesPluginDTO) => {
    setAktionLaeuft(true);
    setFehler(null);
    try {
      await coreApi.aktualisiereSystemPlugin(plugin.pluginId, {
        enabledGlobally: !plugin.enabledGlobally,
      });
      await ladeDaten();
      await onSystemGeaendert();
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Statuswechsel fehlgeschlagen.');
    } finally {
      setAktionLaeuft(false);
    }
  };

  const toggleCapability = async (
    plugin: InstalliertesPluginDTO,
    cap: PrivilegiertePluginPermission
  ) => {
    setAktionLaeuft(true);
    setFehler(null);
    const aktuell = new Set(plugin.approvedCapabilities);
    if (aktuell.has(cap)) aktuell.delete(cap);
    else aktuell.add(cap);
    try {
      await coreApi.aktualisiereSystemPlugin(plugin.pluginId, {
        approvedCapabilities: Array.from(aktuell),
      });
      await ladeDaten();
      await onSystemGeaendert();
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Freigabe fehlgeschlagen.');
    } finally {
      setAktionLaeuft(false);
    }
  };

  const deinstalliere = async (pluginId: string) => {
    setAktionLaeuft(true);
    setFehler(null);
    try {
      await coreApi.deinstalliereSystemPlugin(pluginId);
      setMeldung(`Plugin "${pluginId}" wurde deinstalliert.`);
      await ladeDaten();
      await onSystemGeaendert();
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Deinstallation fehlgeschlagen.');
    } finally {
      setAktionLaeuft(false);
    }
  };

  const aendereInstanzTheme = async (theme: string) => {
    setFehler(null);
    try {
      await coreApi.setzeInstanzTheme(theme);
      await ladeDaten();
      await onSystemGeaendert();
    } catch (err) {
      setFehler(err instanceof CoreApiError ? err.message : 'Theme-Update fehlgeschlagen.');
    }
  };

  if (laedt && !status) {
    return <p className="text-xs text-sl-muted">Lade Systemstatus…</p>;
  }

  return (
    <section className="max-w-5xl space-y-6">
      <header className="border-b border-sl-border pb-4">
        <h1 className="font-display text-lg font-semibold text-sl-heading">
          Notfall-Administration & Systemstatus
        </h1>
        <p className="mt-1 text-xs text-sl-muted">
          Core-Basisverwaltung für Archive, Capability-Freigaben und Instanz-Metadaten (strikt ohne
          Zugriff auf Vereinsinhalte).
        </p>
      </header>

      {fehler && (
        <div
          role="alert"
          className="rounded-md border border-sl-danger/50 bg-sl-danger/10 px-4 py-2.5 text-xs text-sl-danger-text"
        >
          {fehler}
        </div>
      )}
      {meldung && (
        <div
          role="status"
          className="rounded-md border border-sl-success/50 bg-sl-success/10 px-4 py-2.5 text-xs text-sl-success-text"
        >
          {meldung}
        </div>
      )}

      {/* Status-Kennzahlen */}
      {status && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-sl-border bg-sl-surface p-4">
            <div className="text-[11px] text-sl-subtle">Core / SDK</div>
            <div className="mt-1.5 font-mono text-sm font-semibold text-sl-heading tabular-nums">
              v{status.coreVersion} / SDK {status.sdkVersion}
            </div>
          </div>
          <div className="rounded-lg border border-sl-border bg-sl-surface p-4">
            <div className="text-[11px] text-sl-subtle">Datenbank</div>
            <div className="mt-1.5 font-mono text-sm font-semibold text-sl-heading">
              {status.dbDialekt}
            </div>
          </div>
          <div className="rounded-lg border border-sl-border bg-sl-surface p-4">
            <div className="text-[11px] text-sl-subtle">Storage-Provider</div>
            <div className="mt-1.5 truncate font-mono text-sm font-semibold text-sl-heading">
              {status.storageProvider.konfiguriert
                ? status.storageProvider.pluginId
                : 'Nicht installiert'}
            </div>
          </div>
          <div className="rounded-lg border border-sl-border bg-sl-surface p-4">
            <div className="text-[11px] text-sl-subtle">Plugins aktiv</div>
            <div className="mt-1.5 font-mono text-sm font-semibold text-sl-heading tabular-nums">
              {status.pluginsAktiv} / {status.pluginsGesamt}
            </div>
          </div>
        </div>
      )}

      {/* Minimaler .tar.gz Archiv-Installer */}
      <div className="rounded-lg border border-sl-border bg-sl-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <PackagePlus className="h-4 w-4 text-sl-accent" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-sl-heading">
            Plugin aus `.tar.gz`-Archiv installieren
          </h2>
        </div>

        <form onSubmit={installiereVonUrl} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="url"
            value={archiveUrl}
            onChange={(e) => setArchiveUrl(e.target.value)}
            placeholder="https://github.com/.../releases/download/.../plugin.tar.gz"
            className="flex-1 rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading placeholder-sl-subtle focus:border-sl-accent focus:outline-none"
          />
          <button
            type="submit"
            disabled={aktionLaeuft || !archiveUrl.trim()}
            className="rounded-md bg-sl-accent px-4 py-2 text-xs font-semibold text-sl-accent-contrast hover:bg-sl-accent-hover disabled:opacity-50 whitespace-nowrap"
          >
            Von URL installieren
          </button>
        </form>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-sl-border pt-3 text-xs">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sl-primary hover:text-sl-heading">
            <span className="rounded-md border border-sl-border bg-sl-canvas px-3 py-1.5 font-medium">
              Lokale `.tar.gz` hochladen
            </span>
            <input
              type="file"
              accept=".tar.gz,.tgz,application/gzip"
              onChange={installiereVonDatei}
              disabled={aktionLaeuft}
              className="hidden"
            />
          </label>

          <label className="inline-flex cursor-pointer items-center gap-2 text-sl-muted">
            <input
              type="checkbox"
              checked={autoEnable}
              onChange={(e) => setAutoEnable(e.target.checked)}
              className="accent-sl-accent"
            />
            <span>Nach Installation global aktivieren</span>
          </label>
        </div>
      </div>

      {/* Installierte Plugins & Privilegierte Capabilities */}
      <div className="rounded-lg border border-sl-border bg-sl-surface p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-sl-heading">Installierte Plugins</h2>
          <span className="font-mono text-xs text-sl-subtle tabular-nums">
            {plugins.length} gesamt
          </span>
        </div>

        {plugins.length === 0 ? (
          <p className="text-xs text-sl-muted">
            Noch keine Plugins installiert. Installiere z. B. <span className="font-mono">SidelineOS-org-admin</span>,{' '}
            <span className="font-mono">SidelineOS-storage-s3</span> oder{' '}
            <span className="font-mono">SidelineOS-plugin-store</span> als `.tar.gz`.
          </p>
        ) : (
          <div className="divide-y divide-sl-border">
            {plugins.map((plugin) => {
              const angefordertePrivilegien = plugin.manifest.permissions.filter(
                istPrivilegierteCapability
              );

              return (
                <div key={plugin.pluginId} className="py-4 first:pt-0 last:pb-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-sl-heading">
                          {plugin.manifest.name}
                        </span>
                        <span className="font-mono text-xs text-sl-subtle">
                          {plugin.pluginId} · v{plugin.version}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-sl-muted">
                        {plugin.manifest.kurzbeschreibung}
                      </p>
                      {plugin.lastError && (
                        <p className="mt-1 text-xs text-sl-danger-text">
                          Fehler: {plugin.lastError}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={aktionLaeuft}
                        onClick={() => togglePluginAktiv(plugin)}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                          plugin.enabledGlobally
                            ? 'border-sl-success/50 bg-sl-success/10 text-sl-success-text'
                            : 'border-sl-border bg-sl-canvas text-sl-muted hover:text-sl-heading'
                        }`}
                      >
                        {plugin.enabledGlobally ? 'Aktiv' : 'Deaktiviert'}
                      </button>
                      <button
                        type="button"
                        disabled={aktionLaeuft}
                        onClick={() => deinstalliere(plugin.pluginId)}
                        aria-label={`${plugin.manifest.name} deinstallieren`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-sl-border text-sl-muted hover:border-sl-danger hover:text-sl-danger-text"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {angefordertePrivilegien.length > 0 && (
                    <div className="rounded-md border border-sl-border bg-sl-canvas p-3 space-y-2">
                      <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sl-warning-text">
                        <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Privilegierte Capabilities (explizite Freigabe erforderlich)</span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {angefordertePrivilegien.map((cap) => {
                          const freigegeben = plugin.approvedCapabilities.includes(cap);
                          return (
                            <label
                              key={cap}
                              className="inline-flex cursor-pointer items-center gap-1.5 font-mono text-[11px] text-sl-primary"
                            >
                              <input
                                type="checkbox"
                                checked={freigegeben}
                                disabled={aktionLaeuft}
                                onChange={() => toggleCapability(plugin, cap)}
                                className="accent-sl-accent"
                              />
                              <span>{cap}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Instanz-Standard-Theme */}
      {status && (
        <div className="rounded-lg border border-sl-border bg-sl-surface p-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-sl-heading">Instanz-Standard-Theme</h2>
            <p className="mt-0.5 text-xs text-sl-muted">
              Wird verwendet, solange ein Benutzer kein eigenes Theme gewählt hat.
            </p>
          </div>
          <select
            value={status.instanzTheme}
            onChange={(e) => aendereInstanzTheme(e.target.value)}
            className="rounded-md border border-sl-border bg-sl-canvas px-3 py-2 text-xs text-sl-heading focus:border-sl-accent focus:outline-none"
          >
            <option value={STANDARD_THEME_REF}>SidelineOS Standard (Dark)</option>
            {verfuegbareThemes.map((t) => (
              <option key={t.themeRef} value={t.themeRef}>
                {t.preset.name} ({t.pluginName})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Reine Speicher-Metadaten pro Verein (#21, #22, #24 — ohne Vereinsinhalte #23) */}
      {clubsSpeicher.length > 0 && (
        <div className="rounded-lg border border-sl-border bg-sl-surface p-5 space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-sl-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-sl-heading">
              Vereins-Speicherkontingente (Metadaten)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-sl-border text-sl-subtle">
                  <th className="py-2 pr-4 font-medium">Verein</th>
                  <th className="py-2 pr-4 font-medium">Node</th>
                  <th className="py-2 pr-4 font-medium">Belegt</th>
                  <th className="py-2 font-medium">Limit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sl-border">
                {clubsSpeicher.map((c) => (
                  <tr key={c.id}>
                    <td className="py-2.5 pr-4 font-medium text-sl-heading">{c.name}</td>
                    <td className="py-2.5 pr-4 font-mono text-sl-muted">
                      {c.speicher.nodeId}
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-sl-primary tabular-nums">
                      {formatiereBytes(c.speicher.usedBytes)}
                    </td>
                    <td className="py-2.5 font-mono text-sl-muted tabular-nums">
                      {c.speicher.quotaBytes !== null
                        ? formatiereBytes(c.speicher.quotaBytes)
                        : 'Unbegrenzt'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

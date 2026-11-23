import type { PluginStoreEintrag } from '../sdk/plugin.ts';

/**
 * Kuratierter Plugin-Katalog beim Erststart leer halten:
 * Externe Plugins (inkl. offizieller Module) werden gezielt über URL/Release/Upload
 * oder ein eigenes Katalog-Plugin nachgeladen.
 */
export const OFFIZIELLER_PLUGIN_KATALOG: PluginStoreEintrag[] = [];

export const STANDARD_INSTALLIERTE_PLUGIN_IDS: string[] = [];

export const STANDARD_AKTIVIERTE_PLUGIN_IDS: string[] = [];

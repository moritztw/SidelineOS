import * as ReactNamespace from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import * as ReactDom from 'react-dom';
import * as ReactDomClient from 'react-dom/client';
import * as LucideReact from 'lucide-react';
import * as PluginSdk from '../sdk/plugin.ts';

export interface SidelineSharedRuntime {
  react: typeof ReactNamespace;
  reactJsxRuntime: typeof ReactJsxRuntime;
  reactDom: typeof ReactDom;
  reactDomClient: typeof ReactDomClient;
  lucideReact: typeof LucideReact;
  pluginSdk: typeof PluginSdk;
}

declare global {
  // eslint-disable-next-line no-var
  var __SIDELINE_RUNTIME__: SidelineSharedRuntime | undefined;
}

/**
 * Stellt der Browser-ImportMap eine einzige gemeinsame Instanz von React,
 * Lucide-Icons und `@sidelineos/plugin-sdk` für dynamisch geladene Plugin-Bundles bereit.
 */
export function registriereCoreSharedRuntime(): void {
  globalThis.__SIDELINE_RUNTIME__ = {
    react: ReactNamespace,
    reactJsxRuntime: ReactJsxRuntime,
    reactDom: ReactDom,
    reactDomClient: ReactDomClient,
    lucideReact: LucideReact,
    pluginSdk: PluginSdk,
  };
}

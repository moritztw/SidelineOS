export interface BrandKonfiguration {
  produktName: string;
  coreName: string;
  kurzName: string;
  sdkScope: '@sidelineos/plugin-sdk';
  paketFormat: 'sideline-plugin-v1';
}

export const DEFAULT_BRAND: BrandKonfiguration = {
  produktName: 'SidelineOS',
  coreName: 'SidelineOS-Core',
  kurzName: 'SidelineOS',
  sdkScope: '@sidelineos/plugin-sdk',
  paketFormat: 'sideline-plugin-v1',
};

let runtimeBrandNameOverride: string | undefined;

function leseProcessEnvBrand(): string | undefined {
  const proc = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process;
  const wert = proc?.env?.APP_BRAND_NAME?.trim();
  return wert || undefined;
}

export function setzeRuntimeBrandName(name?: string | null): void {
  const bereinigt = typeof name === 'string' ? name.trim() : '';
  runtimeBrandNameOverride = bereinigt || undefined;
}

export function holeAktuelleBrandKonfig(explizitName?: string): BrandKonfiguration {
  const produktName =
    explizitName?.trim() ||
    runtimeBrandNameOverride ||
    leseProcessEnvBrand() ||
    DEFAULT_BRAND.produktName;

  const coreName =
    produktName === DEFAULT_BRAND.produktName
      ? DEFAULT_BRAND.coreName
      : `${produktName}-Core`;

  return {
    produktName,
    coreName,
    kurzName: produktName,
    sdkScope: DEFAULT_BRAND.sdkScope,
    paketFormat: DEFAULT_BRAND.paketFormat,
  };
}

export function teileWortmarke(produktName: string): {
  basis: string;
  akzent: string;
} {
  if (produktName.length > 2 && produktName.endsWith('OS')) {
    return {
      basis: produktName.slice(0, -2),
      akzent: 'OS',
    };
  }
  return {
    basis: produktName,
    akzent: '',
  };
}

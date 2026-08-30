export const APP_SETTINGS_KEY = 'thiepn.library.settings.v1';
export const APP_SETTINGS_SCHEMA_VERSION = 1 as const;

export type AppAppearance = 'system' | 'light' | 'dark';

export interface AppSettingsV1 {
  schemaVersion: typeof APP_SETTINGS_SCHEMA_VERSION;
  appearance: AppAppearance;
}

export const APP_SETTINGS_DEFAULTS: AppSettingsV1 = {
  schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
  appearance: 'system',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAppSettings(value: unknown): AppSettingsV1 | null {
  if (!isRecord(value)) return null;
  const appearance = value.appearance;
  if (appearance !== 'system' && appearance !== 'light' && appearance !== 'dark') return null;
  const schemaVersion = value.schemaVersion;
  if (schemaVersion !== undefined && schemaVersion !== APP_SETTINGS_SCHEMA_VERSION) return null;
  return { schemaVersion: APP_SETTINGS_SCHEMA_VERSION, appearance };
}

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function getAppSettings(storage: Storage | null = browserStorage()): AppSettingsV1 {
  if (!storage) return { ...APP_SETTINGS_DEFAULTS };
  try {
    const raw = storage.getItem(APP_SETTINGS_KEY);
    if (!raw) return { ...APP_SETTINGS_DEFAULTS };
    const parsed = parseAppSettings(JSON.parse(raw));
    if (!parsed) return { ...APP_SETTINGS_DEFAULTS };

    // Upgrade the historical unversioned { appearance } record in place.
    const decoded = JSON.parse(raw) as Record<string, unknown>;
    if (decoded.schemaVersion !== APP_SETTINGS_SCHEMA_VERSION) {
      try { storage.setItem(APP_SETTINGS_KEY, JSON.stringify(parsed)); } catch {}
    }
    return parsed;
  } catch {
    return { ...APP_SETTINGS_DEFAULTS };
  }
}

export function setAppSettings(settings: AppSettingsV1, storage: Storage | null = browserStorage()): AppSettingsV1 {
  const parsed = parseAppSettings(settings) ?? { ...APP_SETTINGS_DEFAULTS };
  try { storage?.setItem(APP_SETTINGS_KEY, JSON.stringify(parsed)); } catch {}
  return parsed;
}

export function nextAppAppearance(appearance: AppAppearance): AppAppearance {
  return appearance === 'system' ? 'light' : appearance === 'light' ? 'dark' : 'system';
}

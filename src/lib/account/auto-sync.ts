/**
 * Optional periodic reconciliation preference. The original Library Account
 * per-device sync grant remains authoritative and is never enabled here.
 */
export const LIBRARY_AUTO_SYNC_PREFERENCE_KEY = 'thiepn.library.auto-sync.v1';
type Preference = { version: 1; ownerId: string; enabled: boolean };
export function parseAutoSyncPreference(raw: string | null, ownerId: string): boolean {
  if (!ownerId || !raw || raw.length > 1024) return true;
  try {
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== 'object') return true;
    const v = p as Partial<Preference>;
    return v.version === 1 && v.ownerId === ownerId && typeof v.enabled === 'boolean'
      ? v.enabled : true;
  } catch { return true; }
}
export function isLibraryAutomaticSyncEnabled(ownerId: string): boolean {
  try { return parseAutoSyncPreference(localStorage.getItem(LIBRARY_AUTO_SYNC_PREFERENCE_KEY), ownerId); }
  catch { return false; } // Fail closed when preference storage is unavailable.
}
export function setLibraryAutomaticSync(ownerId: string, enabled: boolean): boolean {
  if (!ownerId) return false;
  try {
    localStorage.setItem(LIBRARY_AUTO_SYNC_PREFERENCE_KEY,
      JSON.stringify({ version: 1, ownerId, enabled } satisfies Preference));
    window.dispatchEvent(new CustomEvent('thiepn:library-auto-sync', {
      detail: { ownerId, enabled },
    }));
    return true;
  } catch { return false; }
}

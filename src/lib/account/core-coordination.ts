import {
  getVerifiedLibraryAccountUser,
} from './supabase';
import {
  isLibrarySyncEnabledForUser,
  reconcileLibraryAccountSync,
  type LibrarySyncResult,
} from './sync';

export const LIBRARY_CORE_COORDINATION_KEY = 'thiepn.library.core-coordination.v1';
type DeviceGrant = {
  schemaVersion: 1;
  ownerId: string;
  allowed: boolean;
  revision: number;
};
const ownerKey = (ownerId: string) => LIBRARY_CORE_COORDINATION_KEY + ':' + ownerId;

export function readLibraryCoreGrant(raw: string | null, ownerId: string): DeviceGrant | null {
  if (!ownerId || !raw || raw.length > 1024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const grant = value as Partial<DeviceGrant>;
    if (grant.schemaVersion !== 1 || grant.ownerId !== ownerId ||
      typeof grant.allowed !== 'boolean' || !Number.isSafeInteger(grant.revision) ||
      (grant.revision ?? 0) < 1)
      return null;
    return grant as DeviceGrant;
  } catch { return null; }
}
export function getLibraryCoreGrant(ownerId: string): DeviceGrant | null {
  try { return readLibraryCoreGrant(localStorage.getItem(ownerKey(ownerId)), ownerId); }
  catch { return null; }
}
/** This grant only allows requests to native Library, never Core data export. */
export function changeLibraryCoreGrant(ownerId: string, allowed: boolean): boolean {
  if (!ownerId || !isLibrarySyncEnabledForUser(ownerId)) return false;
  try {
    const old = getLibraryCoreGrant(ownerId);
    if (old?.revision === Number.MAX_SAFE_INTEGER) return false;
    const value: DeviceGrant = {
      schemaVersion: 1, ownerId, allowed, revision: (old?.revision ?? 0) + 1,
    };
    localStorage.setItem(ownerKey(ownerId), JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('thiepn:library-core-grant', {
      detail: { ownerId, allowed },
    }));
    return true;
  } catch { return false; }
}
export type CoreRequestResult =
  | { status: 'denied' | 'revoked'; message: string }
  | { status: 'native'; result: LibrarySyncResult };

/**
 * Explicit owner-initiated reconciliation. Only the original Library Account
 * engine performs any CAS write. A revoked grant cannot be reported as success.
 */
export async function requestLibrarySyncFromCore(
  expectedOwner: string,
  previous: DeviceGrant | null = getLibraryCoreGrant(expectedOwner),
): Promise<CoreRequestResult> {
  const active = await getVerifiedLibraryAccountUser();
  const current = getLibraryCoreGrant(expectedOwner);
  if (!active || active.id !== expectedOwner || !isLibrarySyncEnabledForUser(expectedOwner) ||
    !previous?.allowed || !current?.allowed || current.revision !== previous.revision)
    return { status: 'denied', message: 'Library coordination is not authorized on this device.' };
  const result = await reconcileLibraryAccountSync(active);
  const afterUser = await getVerifiedLibraryAccountUser();
  const after = getLibraryCoreGrant(expectedOwner);
  if (afterUser?.id !== expectedOwner || !isLibrarySyncEnabledForUser(expectedOwner) ||
    !after?.allowed || after.revision !== current.revision)
    return { status: 'revoked', message: 'Library authorization changed while the request ran. Review native Library status.' };
  return { status: 'native', result };
}

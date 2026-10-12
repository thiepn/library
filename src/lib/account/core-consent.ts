export type DeviceGrant = {
  schemaVersion: 1;
  ownerId: string;
  allowed: boolean;
  revision: number;
};
export const ownerKey = (ownerId: string) => 'thiepn.library.core-coordination.v1:' + ownerId;
export function readLibraryCoreGrant(raw: string | null, ownerId: string): DeviceGrant | null {
  if (!ownerId || !raw || raw.length > 1024) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const grant = value as Partial<DeviceGrant>;
    if (grant.schemaVersion !== 1 || grant.ownerId !== ownerId ||
      typeof grant.allowed !== 'boolean' || !Number.isSafeInteger(grant.revision) ||
      (grant.revision ?? 0) < 1) return null;
    return grant as DeviceGrant;
  } catch { return null; }
}

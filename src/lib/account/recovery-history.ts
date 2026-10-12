/** Ephemeral owner-bound incident metadata; never localStorage, cloud or personal records. */
export type LibraryIncidentKind =
  | 'inspect' | 'revoked' | 'native-conflict' | 'native-error' |
    'native-offline' | 'native-confirmed' | 'resolution-chosen';
export interface LibraryIncident {
  sequence: number;
  kind: LibraryIncidentKind;
  observedAt: number;
}
export function createLibraryRecoveryHistory(now: () => number = Date.now) {
  let owner: string | null = null;
  let sequence = 0;
  let entries: LibraryIncident[] = [];
  return {
    switchOwner(next: string | null) {
      if (next !== owner) { owner = next; entries = []; sequence = 0; }
    },
    append(expectedOwner: string | null, kind: LibraryIncidentKind) {
      if (!expectedOwner || expectedOwner !== owner) return false;
      entries = [...entries, { sequence: ++sequence, kind, observedAt: now() }].slice(-12);
      return true;
    },
    list(expectedOwner: string | null) {
      return expectedOwner && expectedOwner === owner
        ? entries.map(e => ({ ...e })) : [];
    },
    clear() { owner = null; entries = []; sequence = 0; },
  };
}

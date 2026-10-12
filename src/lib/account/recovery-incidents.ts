import type { LibrarySyncResult } from './sync';

export type LibraryRecoveryAction = 'inspect' | 'native-sync' | 'choose-device' |
  'choose-cloud' | 'core-revoked' | 'native-backup';
export interface LibraryRecoveryIncident {
  action: LibraryRecoveryAction;
  outcome: string;
  observedAt: number;
  baselineRevision: number | null;
  reportedCloudRevision: number | null;
  authority: 'native-library';
  externalCustody: 'NOT_TESTED';
}

/** RAM-only, owner-scoped observations; never an independent audit or backup. */
export function createLibraryRecoveryIncidentHistory(now: () => number = Date.now) {
  let owner: string | null = null;
  let entries: LibraryRecoveryIncident[] = [];
  const switchOwner = (next: string | null) => {
    if (owner !== next) {
      owner = next;
      entries = [];
    }
  };
  return {
    forOwner(current: string | null) {
      switchOwner(current);
      return entries.map((entry) => ({ ...entry }));
    },
    record(current: string | null, action: LibraryRecoveryAction,
      outcome: string, baselineRevision: number | null,
      reportedCloudRevision: number | null) {
      switchOwner(current);
      if (!current || !/^[a-z0-9-]{10,128}$/i.test(current) || outcome.length > 80) return;
      entries = [...entries, {
        action, outcome, observedAt: now(), baselineRevision,
        reportedCloudRevision, authority: 'native-library' as const,
        externalCustody: 'NOT_TESTED' as const,
      }].slice(-16);
    },
    clear() {
      owner = null;
      entries = [];
    },
  };
}

/** Describes ORIGINAL Library CAS without attempting reconciliation/import. */
export function describeNativeLibraryRecovery(
  result: LibrarySyncResult, baselineRevision: number | null,
) {
  const conflict = result.status === 'conflict';
  return {
    original: baselineRevision === null ? 'No confirmed baseline revision'
      : 'Device baseline revision ' + baselineRevision,
    remote: result.revision === undefined ? 'Cloud revision unknown'
      : 'Reported cloud revision ' + result.revision,
    action: conflict
      ? 'Export a native Library backup before choosing Device or Cloud in the original CAS conflict chooser. Core cannot resolve this conflict.'
      : ['pushed', 'pulled', 'synced'].includes(result.status)
        ? 'Native Library confirmed this result, not third-party backup durability.'
        : 'Preserve local Library records and open the original backup page before recovery.',
    requiresNativeChoice: conflict,
    externalCustody: 'NOT_TESTED' as const,
  };
}

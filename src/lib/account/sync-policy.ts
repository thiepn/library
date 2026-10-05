import type { LibraryBackupV1 } from '../client/library-portability';

export interface LibrarySyncBaseline {
  revision: number;
  hash: string;
}

export interface LibrarySyncCloudHead {
  revision: number;
  hash: string;
}

export type LibrarySyncDecision = 'push' | 'pull' | 'conflict' | 'noop';

function recordCount(value: unknown): number {
  if (typeof value !== 'object' || value === null) return 0;
  const records = (value as { records?: unknown }).records;
  return Array.isArray(records) ? records.length : 0;
}

export function backupHasMeaningfulLibraryState(backup: LibraryBackupV1): boolean {
  const main = backup.state.main;
  const pdf = backup.state.pdf;
  const personal = backup.state.personalBooks;

  return Boolean(
    (main && (
      recordCount(main.favorites)
      + recordCount(main.epubProgress)
      + recordCount(main.legacyProgress)
      + recordCount(main.bookmarks)
      + recordCount(main.annotations)
      + recordCount(main.readingActivity)
    ) > 0)
    || (pdf && (recordCount(pdf.progress) + recordCount(pdf.bookmarks)) > 0)
    || (personal && personal.records.length > 0)
  );
}

export function decideLibrarySync(input: {
  baseline?: LibrarySyncBaseline;
  cloud?: LibrarySyncCloudHead;
  localHash: string;
  localMeaningful: boolean;
}): LibrarySyncDecision {
  const { baseline, cloud, localHash, localMeaningful } = input;

  if (!cloud) return baseline ? 'conflict' : 'push';
  if (localHash === cloud.hash) return 'noop';

  if (!baseline) return localMeaningful ? 'conflict' : 'pull';

  const localChanged = localHash !== baseline.hash;
  const cloudChanged = cloud.hash !== baseline.hash;

  if (localChanged && cloudChanged) return 'conflict';
  if (localChanged) return 'push';
  if (cloudChanged) return 'pull';
  return 'noop';
}

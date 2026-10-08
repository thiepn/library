import type { LibraryBackupV1 } from '../client/library-portability';
import { READER_SETTINGS_DEFAULTS } from '../reader/settings';

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
  const settings = backup.state.settings;
  // A new device with factory defaults should pull the cloud automatically.
  // Customized reading preferences are user data, however: never silently
  // overwrite them during a first-time sync against a different cloud copy.
  const customizedReader = settings?.reader
    && (Object.keys(READER_SETTINGS_DEFAULTS) as Array<keyof typeof READER_SETTINGS_DEFAULTS>)
      .some((key) => settings.reader?.[key] !== READER_SETTINGS_DEFAULTS[key]);
  const customizedPdf = pdf?.settings
    && (pdf.settings.fit !== 'width' || pdf.settings.zoom !== 1);
  const customizedSite = settings?.site && settings.site.appearance !== 'system';
  const customizedLegacy = settings?.legacyReader
    && (settings.legacyReader.scale !== 1 || settings.legacyReader.measure !== 68);

  return Boolean(
    (main && (
      recordCount(main.favorites)
      + recordCount(main.epubProgress)
      + recordCount(main.legacyProgress)
      + recordCount(main.bookmarks)
      + recordCount(main.annotations)
      + recordCount(main.readingActivity)
    ) > 0)
    || (pdf && (
      recordCount(pdf.progress)
      + recordCount(pdf.bookmarks)
      + recordCount(pdf.annotations)
    ) > 0)
    || (personal && personal.records.length > 0)
    || customizedReader
    || customizedPdf
    || customizedSite
    || customizedLegacy
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

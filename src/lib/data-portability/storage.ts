import {
  LIBRARY_CHANNEL,
  isFavoriteRecordV1,
  isLegacyAnnotationRecordV1,
  isReaderProgressRecordV2,
  isReadingActivityRecordV1,
  isStoredLegacyProgressRecordV1,
  openLibraryDb,
  type FavoriteRecordV1,
  type LegacyAnnotationRecordV1,
  type ReaderProgressRecordV2,
  type ReadingActivityRecordV1,
  type StoredLegacyProgressRecordV1,
} from '../client/library-db';
import { APP_SETTINGS_KEY, getAppSettings, setAppSettings } from '../client/app-settings';
import { getPersonalBooks } from '../client/personal-books';
import {
  PDF_SETTINGS_KEY,
  getAllPdfStateForPortability,
  getPdfReaderSettings,
  isPdfBookmarkRecord,
  isPdfProgressRecord,
  setPdfReaderSettings,
  type PdfBookmarkRecord,
  type PdfProgressRecord,
} from '../pdf-reader/state';
import { isReaderAnnotationRecordV2, type ReaderAnnotationRecordV2 } from '../reader/annotation-store';
import { isReaderBookmarkRecordV2, type ReaderBookmarkRecordV2 } from '../reader/bookmark-store';
import {
  READER_SETTINGS_KEY,
  ReaderSettingsStore,
  parseReaderSettings,
  type ReaderSettingsRecord,
} from '../reader/settings';
import {
  createLibraryBackupArchive,
  parseLibraryBackupText,
  summarizeLibraryBackup,
  type LibraryBackupArchiveV1,
  type LibraryBackupSectionsV1,
  type LibraryBackupSummary,
} from './archive';
import {
  getPortablePersonalBookMetadataRecords,
  isPortablePersonalBookMetadataV1,
  portablePersonalBookMetadata,
  type PortablePersonalBookMetadataV1,
} from './personal-metadata';

const PDF_CHANNEL = 'thiepn-library-pdf-reader';

const MAIN_PORTABLE_STORES = [
  'favorites',
  'progress',
  'legacyProgress',
  'bookmarks',
  'annotations',
  'readingActivity',
  'portablePersonalMetadata',
] as const;

type MainPortableStore = typeof MAIN_PORTABLE_STORES[number]
  | 'pdfProgress'
  | 'pdfBookmarks';

export interface LibraryBackupExport {
  archive: LibraryBackupArchiveV1;
  json: string;
  summary: LibraryBackupSummary;
  warnings: string[];
}

export interface LibraryRestoreReport {
  summary: LibraryBackupSummary;
  restoredRecords: number;
  keptCurrentRecords: number;
  restoredSettings: number;
  warnings: string[];
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.addEventListener('success', () => resolve(value.result));
    value.addEventListener('error', () => reject(value.error ?? new Error('Library portability storage request failed.')));
  });
}

function transactionCompletion(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', () => resolve(), { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error ?? new Error('Library restore transaction aborted.')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error ?? new Error('Library restore transaction failed.')), { once: true });
  });
}

function portableRecordWarning(store: string): string {
  return `Skipped an invalid or unsupported record from ${store}.`;
}

function collectValid<T>(
  values: unknown[],
  validator: (value: unknown) => value is T,
  store: string,
  warnings: string[],
): T[] {
  const valid: T[] = [];
  for (const value of values) {
    if (validator(value)) valid.push(value);
    else warnings.push(portableRecordWarning(store));
  }
  return valid;
}

function uniqueBy<T>(records: T[], key: (record: T) => string, prefer: (a: T, b: T) => T = (a) => a): T[] {
  const map = new Map<string, T>();
  for (const record of records) {
    const id = key(record);
    const existing = map.get(id);
    map.set(id, existing ? prefer(existing, record) : record);
  }
  return [...map.values()];
}

function newerBy<T>(timestamp: (record: T) => string): (a: T, b: T) => T {
  return (a, b) => timestamp(b) > timestamp(a) ? b : a;
}

async function readMainPortableState(): Promise<{
  sections: Omit<LibraryBackupSectionsV1, 'pdfProgress' | 'pdfBookmarks' | 'personalBooks'>;
  pendingPersonal: PortablePersonalBookMetadataV1[];
  warnings: string[];
}> {
  const db = await openLibraryDb();
  const warnings: string[] = [];
  try {
    const transaction = db.transaction([...MAIN_PORTABLE_STORES], 'readonly');
    const completion = transactionCompletion(transaction);
    const entries = await Promise.all(MAIN_PORTABLE_STORES.map(async (storeName) => [
      storeName,
      await request<unknown[]>(transaction.objectStore(storeName).getAll()),
    ] as const));
    await completion;
    const raw = Object.fromEntries(entries) as Record<typeof MAIN_PORTABLE_STORES[number], unknown[]>;

    const favorites = collectValid(raw.favorites, isFavoriteRecordV1, 'favorites', warnings);
    const progressValues = raw.progress;
    const epubProgress = collectValid(progressValues.filter(isReaderProgressRecordV2), isReaderProgressRecordV2, 'progress', warnings);
    const sharedLegacy = progressValues.filter(isStoredLegacyProgressRecordV1);
    const knownProgressCount = epubProgress.length + sharedLegacy.length;
    for (let index = knownProgressCount; index < progressValues.length; index++) {
      // Avoid double-counting values already accepted by one of the two validators.
    }
    progressValues.forEach((value) => {
      if (!isReaderProgressRecordV2(value) && !isStoredLegacyProgressRecordV1(value)) warnings.push(portableRecordWarning('progress'));
    });

    const sidecarLegacy = collectValid(raw.legacyProgress, isStoredLegacyProgressRecordV1, 'legacyProgress', warnings);
    const legacyProgress = uniqueBy(
      [...sharedLegacy, ...sidecarLegacy],
      (record) => record.workId,
      newerBy((record) => record.updatedAt),
    );

    const epubBookmarks = collectValid(raw.bookmarks, isReaderBookmarkRecordV2, 'bookmarks', warnings);
    const epubAnnotations: ReaderAnnotationRecordV2[] = [];
    const legacyAnnotations: LegacyAnnotationRecordV1[] = [];
    for (const value of raw.annotations) {
      if (isReaderAnnotationRecordV2(value)) epubAnnotations.push(value);
      else if (isLegacyAnnotationRecordV1(value)) legacyAnnotations.push(value);
      else warnings.push(portableRecordWarning('annotations'));
    }
    const readingActivity = collectValid(raw.readingActivity, isReadingActivityRecordV1, 'readingActivity', warnings);
    const pendingPersonal = collectValid(raw.portablePersonalMetadata, isPortablePersonalBookMetadataV1, 'portablePersonalMetadata', warnings);

    return {
      sections: {
        favorites,
        epubProgress,
        legacyProgress,
        epubBookmarks,
        epubAnnotations,
        legacyAnnotations,
        readingActivity,
      },
      pendingPersonal,
      warnings,
    };
  } finally {
    db.close();
  }
}

function currentSettings() {
  return {
    app: getAppSettings(),
    epub: new ReaderSettingsStore().snapshot,
    pdf: getPdfReaderSettings(),
  };
}

export async function createLibraryBackup(): Promise<LibraryBackupExport> {
  const [main, pdfState, currentPersonal, pendingPersonal] = await Promise.all([
    readMainPortableState(),
    getAllPdfStateForPortability(),
    getPersonalBooks(),
    getPortablePersonalBookMetadataRecords().catch(() => []),
  ]);

  const personalBooks = uniqueBy(
    [
      ...pendingPersonal,
      ...currentPersonal.map((book) => portablePersonalBookMetadata(book)),
    ],
    (record) => record.id,
    newerBy((record) => record.updatedAt),
  );
  const warnings = [...main.warnings];
  if (personalBooks.length) warnings.push('Personal EPUB/PDF file bytes are not included. Re-import matching files after restore to reconnect them by content hash.');

  const archive = createLibraryBackupArchive({
    sections: {
      ...main.sections,
      pdfProgress: pdfState.progress,
      pdfBookmarks: pdfState.bookmarks,
      personalBooks,
    },
    settings: currentSettings(),
    skippedCorruptRecords: main.warnings.length,
    warnings,
  });
  return {
    archive,
    json: JSON.stringify(archive, null, 2),
    summary: summarizeLibraryBackup(archive),
    warnings,
  };
}

function browserStorage(): Storage {
  if (typeof localStorage === 'undefined') throw new Error('Browser settings storage is unavailable.');
  return localStorage;
}

function rawSettingSnapshot(storage: Storage): Record<string, string | null> {
  return {
    [APP_SETTINGS_KEY]: storage.getItem(APP_SETTINGS_KEY),
    [READER_SETTINGS_KEY]: storage.getItem(READER_SETTINGS_KEY),
    [PDF_SETTINGS_KEY]: storage.getItem(PDF_SETTINGS_KEY),
  };
}

function restoreRawSettings(storage: Storage, snapshot: Record<string, string | null>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  }
}

function applyArchiveSettings(archive: LibraryBackupArchiveV1, storage: Storage): number {
  let count = 0;
  if (archive.settings?.app) {
    setAppSettings(archive.settings.app, storage);
    count++;
  }
  if (archive.settings?.epub) {
    const parsed = parseReaderSettings(archive.settings.epub);
    if (!parsed) throw new Error('EPUB settings failed validation during restore.');
    storage.setItem(READER_SETTINGS_KEY, JSON.stringify(parsed));
    count++;
  }
  if (archive.settings?.pdf) {
    setPdfReaderSettings(archive.settings.pdf);
    count++;
  }
  return count;
}

function presentRestoreStores(sections?: LibraryBackupSectionsV1): MainPortableStore[] {
  if (!sections) return [];
  const stores = new Set<MainPortableStore>();
  if (sections.favorites) stores.add('favorites');
  if (sections.epubProgress) stores.add('progress');
  if (sections.legacyProgress) stores.add('legacyProgress');
  if (sections.epubBookmarks) stores.add('bookmarks');
  if (sections.epubAnnotations || sections.legacyAnnotations) stores.add('annotations');
  if (sections.readingActivity) stores.add('readingActivity');
  if (sections.pdfProgress) stores.add('pdfProgress');
  if (sections.pdfBookmarks) stores.add('pdfBookmarks');
  if (sections.personalBooks) stores.add('portablePersonalMetadata');
  return [...stores];
}

function sameEpubProgressIdentity(a: ReaderProgressRecordV2, b: ReaderProgressRecordV2): boolean {
  return a.workId === b.workId && a.edition === b.edition && a.releaseVersion === b.releaseVersion;
}

async function putIfNewer<T extends { updatedAt: string }>(
  store: IDBObjectStore,
  key: IDBValidKey,
  incoming: T,
  validator: (value: unknown) => value is T,
  counters: { restored: number; kept: number },
): Promise<void> {
  const existing = await request<unknown>(store.get(key));
  if (validator(existing) && existing.updatedAt >= incoming.updatedAt) {
    counters.kept++;
    return;
  }
  await request(store.put(incoming));
  counters.restored++;
}

async function restoreSections(
  archive: LibraryBackupArchiveV1,
  warnings: string[],
): Promise<{ restored: number; kept: number }> {
  const sections = archive.sections;
  const stores = presentRestoreStores(sections);
  if (!sections || !stores.length) return { restored: 0, kept: 0 };

  const db = await openLibraryDb();
  const counters = { restored: 0, kept: 0 };
  try {
    const transaction = db.transaction(stores, 'readwrite');
    const completion = transactionCompletion(transaction);
    try {
      if (sections.favorites) {
        const store = transaction.objectStore('favorites');
        for (const incoming of sections.favorites) {
          const existing = await request<unknown>(store.get(incoming.workId));
          if (isFavoriteRecordV1(existing)) {
            if (existing.savedAt <= incoming.savedAt) counters.kept++;
            else {
              await request(store.put(incoming));
              counters.restored++;
            }
          } else {
            await request(store.put(incoming));
            counters.restored++;
          }
        }
      }

      if (sections.epubProgress) {
        const store = transaction.objectStore('progress');
        for (const incoming of sections.epubProgress) {
          const existing = await request<unknown>(store.get(incoming.workId));
          if (isReaderProgressRecordV2(existing)) {
            if (!sameEpubProgressIdentity(existing, incoming)) {
              counters.kept++;
              warnings.push(`Kept current EPUB position for ${incoming.workId}; the backup belongs to a different edition or release.`);
            } else if (existing.updatedAt >= incoming.updatedAt) counters.kept++;
            else {
              await request(store.put(incoming));
              counters.restored++;
            }
          } else {
            await request(store.put(incoming));
            counters.restored++;
          }
        }
      }

      if (sections.legacyProgress) {
        const store = transaction.objectStore('legacyProgress');
        for (const incoming of sections.legacyProgress) {
          await putIfNewer(store, incoming.workId, incoming, isStoredLegacyProgressRecordV1, counters);
        }
      }

      if (sections.epubBookmarks) {
        const store = transaction.objectStore('bookmarks');
        for (const incoming of sections.epubBookmarks) {
          const existing = await request<unknown>(store.get(incoming.id));
          if (isReaderBookmarkRecordV2(existing) && existing.updatedAt >= incoming.updatedAt) counters.kept++;
          else {
            await request(store.put(incoming));
            counters.restored++;
          }
        }
      }

      if (sections.epubAnnotations || sections.legacyAnnotations) {
        const store = transaction.objectStore('annotations');
        for (const incoming of sections.epubAnnotations ?? []) {
          const existing = await request<unknown>(store.get(incoming.id));
          if (isReaderAnnotationRecordV2(existing) && existing.updatedAt >= incoming.updatedAt) counters.kept++;
          else {
            await request(store.put(incoming));
            counters.restored++;
          }
        }
        for (const incoming of sections.legacyAnnotations ?? []) {
          await putIfNewer(store, incoming.id, incoming, isLegacyAnnotationRecordV1, counters);
        }
      }

      if (sections.readingActivity) {
        const store = transaction.objectStore('readingActivity');
        for (const incoming of sections.readingActivity) {
          const existing = await request<unknown>(store.get(incoming.workId));
          if (isReadingActivityRecordV1(existing) && existing.openedAt >= incoming.openedAt) counters.kept++;
          else {
            await request(store.put(incoming));
            counters.restored++;
          }
        }
      }

      if (sections.pdfProgress) {
        const store = transaction.objectStore('pdfProgress');
        for (const incoming of sections.pdfProgress) {
          await putIfNewer(store, incoming.id, incoming, isPdfProgressRecord, counters);
        }
      }

      if (sections.pdfBookmarks) {
        const store = transaction.objectStore('pdfBookmarks');
        for (const incoming of sections.pdfBookmarks) {
          const existing = await request<unknown>(store.get(incoming.id));
          if (isPdfBookmarkRecord(existing)) counters.kept++;
          else {
            await request(store.put(incoming));
            counters.restored++;
          }
        }
      }

      if (sections.personalBooks) {
        const store = transaction.objectStore('portablePersonalMetadata');
        for (const incoming of sections.personalBooks) {
          await putIfNewer(store, incoming.id, incoming, isPortablePersonalBookMetadataV1, counters);
        }
      }

      await completion;
      return counters;
    } catch (error) {
      try { transaction.abort(); } catch {}
      try { await completion; } catch {}
      throw error;
    }
  } finally {
    db.close();
  }
}

function broadcastRestore(): void {
  for (const name of [LIBRARY_CHANNEL, PDF_CHANNEL]) {
    try {
      const channel = new BroadcastChannel(name);
      channel.postMessage({ kind: 'restore', at: Date.now() });
      channel.close();
    } catch {}
  }
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: APP_SETTINGS_KEY }));
  } catch {}
}

export async function restoreLibraryBackupText(text: string): Promise<LibraryRestoreReport> {
  const archive = parseLibraryBackupText(text);
  const storage = browserStorage();
  const rawSettings = rawSettingSnapshot(storage);
  const warnings = [...archive.integrity.warnings];
  let restoredSettings = 0;

  try {
    restoredSettings = applyArchiveSettings(archive, storage);
  } catch (error) {
    try { restoreRawSettings(storage, rawSettings); } catch {}
    throw error;
  }

  try {
    const result = await restoreSections(archive, warnings);
    broadcastRestore();
    return {
      summary: summarizeLibraryBackup(archive),
      restoredRecords: result.restored,
      keptCurrentRecords: result.kept,
      restoredSettings,
      warnings,
    };
  } catch (error) {
    try { restoreRawSettings(storage, rawSettings); } catch {}
    throw error;
  }
}

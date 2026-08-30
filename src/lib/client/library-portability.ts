import {
  FAVORITE_SCHEMA_VERSION,
  LEGACY_PROGRESS_SCHEMA_VERSION,
  getLibraryDbPortabilitySnapshot,
  isReaderProgressRecordV2,
  isReadingActivityRecordV1,
  replaceLibraryDbPortabilitySnapshot,
  type AnnotationRecord,
  type FavoriteRecord,
  type LibraryDbPortabilityPatch,
  type ReaderProgressRecordV2,
  type ReadingActivityRecordV1,
  type StoredLegacyProgressRecordV1,
} from './library-db';
import {
  getPendingPersonalBookMetadata,
  getPersonalBookPortableMetadata,
  getPersonalBooks,
  isPersonalBookPortableMetadataV1,
  replacePendingPersonalBookMetadata,
  type PersonalBookPortableMetadataV1,
} from './personal-books';
import { pdfReaderIdentityKey } from '../pdf-reader/canonical';
import {
  getPdfReaderStateSnapshot,
  isPdfBookmarkRecord,
  isPdfProgressRecord,
  isPdfReaderSettings,
  replacePdfReaderStateSnapshot,
  type PdfBookmarkRecord,
  type PdfProgressRecord,
  type PdfReaderSettings,
} from '../pdf-reader/state';
import { isReaderAnnotationRecordV2, type ReaderAnnotationRecordV2 } from '../reader/annotation-store';
import { isReaderBookmarkRecordV2, type ReaderBookmarkRecordV2 } from '../reader/bookmark-store';
import {
  READER_SETTINGS_KEY,
  ReaderSettingsStore,
  parseReaderSettings,
  type ReaderSettingsRecord,
} from '../reader/settings';

export const LIBRARY_BACKUP_FORMAT = 'thiepn-library-backup' as const;
export const LIBRARY_BACKUP_SCHEMA_VERSION = 1 as const;
const COLLECTION_SCHEMA_VERSION = 1 as const;
const SITE_SETTINGS_KEY = 'thiepn.library.settings.v1';
const LEGACY_READER_SETTINGS_KEY = 'thiepn.library.reader.v1';

type CollectionV1<T> = {
  schemaVersion: typeof COLLECTION_SCHEMA_VERSION;
  records: T[];
};

type PortableAnnotationRecord = ReaderAnnotationRecordV2 | AnnotationRecord;

export interface PortableMainStateV1 {
  schemaVersion: 1;
  favorites?: CollectionV1<FavoriteRecord>;
  epubProgress?: CollectionV1<ReaderProgressRecordV2>;
  legacyProgress?: CollectionV1<StoredLegacyProgressRecordV1>;
  bookmarks?: CollectionV1<ReaderBookmarkRecordV2>;
  annotations?: CollectionV1<PortableAnnotationRecord>;
  readingActivity?: CollectionV1<ReadingActivityRecordV1>;
}

export interface PortablePdfStateV1 {
  schemaVersion: 1;
  progress?: CollectionV1<PdfProgressRecord>;
  bookmarks?: CollectionV1<PdfBookmarkRecord>;
  settings?: PdfReaderSettings;
}

export interface PortableSiteSettingsV1 {
  schemaVersion: 1;
  appearance: 'system' | 'light' | 'dark';
}

export interface PortableLegacyReaderSettingsV1 {
  schemaVersion: 1;
  scale: number;
  measure: number;
}

export interface PortableSettingsStateV1 {
  schemaVersion: 1;
  reader?: ReaderSettingsRecord;
  site?: PortableSiteSettingsV1;
  legacyReader?: PortableLegacyReaderSettingsV1;
}

export interface PortablePersonalBooksStateV1 {
  schemaVersion: 1;
  records: PersonalBookPortableMetadataV1[];
  includesFiles: false;
}

export interface LibraryBackupV1 {
  format: typeof LIBRARY_BACKUP_FORMAT;
  schemaVersion: typeof LIBRARY_BACKUP_SCHEMA_VERSION;
  exportedAt: string;
  state: {
    main?: PortableMainStateV1;
    pdf?: PortablePdfStateV1;
    settings?: PortableSettingsStateV1;
    personalBooks?: PortablePersonalBooksStateV1;
  };
}

export interface LibraryRestoreResult {
  schemaVersion: 1;
  restoredCategories: string[];
  personalBooksNeedingFiles: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isFavoriteRecord(value: unknown): value is FavoriteRecord {
  return isRecord(value)
    && value.schemaVersion === FAVORITE_SCHEMA_VERSION
    && typeof value.workId === 'string' && value.workId.length > 0
    && typeof value.savedAt === 'string';
}

function isLegacyProgressRecord(value: unknown): value is StoredLegacyProgressRecordV1 {
  return isRecord(value)
    && value.schemaVersion === LEGACY_PROGRESS_SCHEMA_VERSION
    && typeof value.workId === 'string' && value.workId.length > 0
    && typeof value.chapterId === 'string'
    && isFiniteNumber(value.percent) && value.percent >= 0 && value.percent <= 100
    && typeof value.updatedAt === 'string';
}

function isLegacyAnnotationRecord(value: unknown): value is AnnotationRecord {
  if (!isRecord(value) || 'schemaVersion' in value) return false;
  return typeof value.id === 'string' && value.id.length > 0
    && typeof value.workId === 'string' && value.workId.length > 0
    && (value.chapterId === undefined || typeof value.chapterId === 'string')
    && (value.quote === undefined || typeof value.quote === 'string')
    && typeof value.note === 'string'
    && typeof value.createdAt === 'string'
    && typeof value.updatedAt === 'string';
}

function isPortableAnnotationRecord(value: unknown): value is PortableAnnotationRecord {
  return isReaderAnnotationRecordV2(value) || isLegacyAnnotationRecord(value);
}

function isCollection<T>(value: unknown, validator: (candidate: unknown) => candidate is T): value is CollectionV1<T> {
  return isRecord(value)
    && value.schemaVersion === COLLECTION_SCHEMA_VERSION
    && Array.isArray(value.records)
    && value.records.every(validator);
}

function assertUniqueRecords<T>(records: readonly T[], key: (record: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    const identity = key(record);
    if (seen.has(identity)) throw new Error(`Duplicate ${label} identity: ${identity}. No Library data was changed.`);
    seen.add(identity);
  }
}

function parseSiteSettings(value: unknown): PortableSiteSettingsV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (value.appearance !== 'system' && value.appearance !== 'light' && value.appearance !== 'dark') return null;
  return { schemaVersion: 1, appearance: value.appearance };
}

function parseLegacyReaderSettings(value: unknown): PortableLegacyReaderSettingsV1 | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (!isFiniteNumber(value.scale) || value.scale < 0.85 || value.scale > 1.3) return null;
  if (!isFiniteNumber(value.measure) || value.measure < 52 || value.measure > 82) return null;
  return { schemaVersion: 1, scale: value.scale, measure: value.measure };
}

function readSiteSettings(): PortableSiteSettingsV1 {
  try {
    const value = JSON.parse(localStorage.getItem(SITE_SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
    const appearance = value.appearance === 'light' || value.appearance === 'dark' ? value.appearance : 'system';
    return { schemaVersion: 1, appearance };
  } catch {
    return { schemaVersion: 1, appearance: 'system' };
  }
}

function readLegacyReaderSettings(): PortableLegacyReaderSettingsV1 {
  try {
    const value = JSON.parse(localStorage.getItem(LEGACY_READER_SETTINGS_KEY) ?? '{}') as Record<string, unknown>;
    const scale = isFiniteNumber(value.scale) ? Math.min(1.3, Math.max(0.85, value.scale)) : 1;
    const measure = isFiniteNumber(value.measure) ? Math.min(82, Math.max(52, value.measure)) : 68;
    return { schemaVersion: 1, scale, measure };
  } catch {
    return { schemaVersion: 1, scale: 1, measure: 68 };
  }
}

function writeJsonSetting(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

function restoreRawSetting(key: string, value: string | null): void {
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

function sortBy<T>(records: T[], key: (record: T) => string): T[] {
  return [...records].sort((a, b) => key(a).localeCompare(key(b)));
}

function category<T>(records: T[]): CollectionV1<T> {
  return { schemaVersion: COLLECTION_SCHEMA_VERSION, records };
}

function sanitizeMainForExport(snapshot: Awaited<ReturnType<typeof getLibraryDbPortabilitySnapshot>>): PortableMainStateV1 {
  return {
    schemaVersion: 1,
    favorites: category(sortBy(snapshot.favorites.filter(isFavoriteRecord), (record) => record.workId)),
    epubProgress: category(sortBy(snapshot.epubProgress.filter(isReaderProgressRecordV2), (record) => record.workId)),
    legacyProgress: category(sortBy(snapshot.legacyProgress.filter(isLegacyProgressRecord), (record) => record.workId)),
    bookmarks: category(sortBy(snapshot.bookmarks.filter(isReaderBookmarkRecordV2), (record) => record.id)),
    annotations: category(sortBy(snapshot.annotations.filter(isPortableAnnotationRecord), (record) => record.id)),
    readingActivity: category(sortBy(snapshot.readingActivity.filter(isReadingActivityRecordV1), (record) => record.workId)),
  };
}

export async function createLibraryBackup(): Promise<LibraryBackupV1> {
  const [main, pdf, personalBooks] = await Promise.all([
    getLibraryDbPortabilitySnapshot(),
    getPdfReaderStateSnapshot(),
    getPersonalBookPortableMetadata(),
  ]);
  const readerSettings = new ReaderSettingsStore().snapshot;
  return {
    format: LIBRARY_BACKUP_FORMAT,
    schemaVersion: LIBRARY_BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state: {
      main: sanitizeMainForExport(main),
      pdf: {
        schemaVersion: 1,
        progress: category(sortBy(pdf.progress.filter(isPdfProgressRecord), (record) => record.id)),
        bookmarks: category(sortBy(pdf.bookmarks.filter(isPdfBookmarkRecord), (record) => record.id)),
        settings: pdf.settings,
      },
      settings: {
        schemaVersion: 1,
        reader: readerSettings,
        site: readSiteSettings(),
        legacyReader: readLegacyReaderSettings(),
      },
      personalBooks: {
        schemaVersion: 1,
        records: sortBy(personalBooks.filter(isPersonalBookPortableMetadataV1), (record) => record.sha256),
        includesFiles: false,
      },
    },
  };
}

export async function createLibraryBackupJson(): Promise<string> {
  return `${JSON.stringify(await createLibraryBackup(), null, 2)}\n`;
}

function validateMain(value: unknown): asserts value is PortableMainStateV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('Unsupported main-state backup schema.');

  if (value.favorites !== undefined) {
    const collection = value.favorites;
    if (!isCollection(collection, isFavoriteRecord)) throw new Error('Invalid favorites backup records.');
    assertUniqueRecords(collection.records, (record) => record.workId, 'favorite');
  }
  if (value.epubProgress !== undefined) {
    const collection = value.epubProgress;
    if (!isCollection(collection, isReaderProgressRecordV2)) throw new Error('Invalid EPUB progress backup records.');
    assertUniqueRecords(collection.records, (record) => record.workId, 'EPUB progress');
  }
  if (value.legacyProgress !== undefined) {
    const collection = value.legacyProgress;
    if (!isCollection(collection, isLegacyProgressRecord)) throw new Error('Invalid legacy progress backup records.');
    assertUniqueRecords(collection.records, (record) => record.workId, 'legacy progress');
  }
  if (value.bookmarks !== undefined) {
    const collection = value.bookmarks;
    if (!isCollection(collection, isReaderBookmarkRecordV2)) throw new Error('Invalid EPUB bookmark backup records.');
    assertUniqueRecords(collection.records, (record) => record.id, 'EPUB bookmark');
  }
  if (value.annotations !== undefined) {
    const collection = value.annotations;
    if (!isCollection(collection, isPortableAnnotationRecord)) throw new Error('Invalid annotation backup records.');
    assertUniqueRecords(collection.records, (record) => record.id, 'annotation');
  }
  if (value.readingActivity !== undefined) {
    const collection = value.readingActivity;
    if (!isCollection(collection, isReadingActivityRecordV1)) throw new Error('Invalid reading activity backup records.');
    assertUniqueRecords(collection.records, (record) => record.workId, 'reading activity');
  }
}

function validatePdf(value: unknown): asserts value is PortablePdfStateV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('Unsupported PDF-state backup schema.');

  if (value.progress !== undefined) {
    const collection = value.progress;
    if (!isCollection(collection, isPdfProgressRecord)) throw new Error('Invalid PDF progress backup records.');
    for (const record of collection.records) {
      if (record.id !== pdfReaderIdentityKey(record.identity)) throw new Error('Invalid PDF progress identity. No Library data was changed.');
    }
    assertUniqueRecords(collection.records, (record) => record.id, 'PDF progress');
  }
  if (value.bookmarks !== undefined) {
    const collection = value.bookmarks;
    if (!isCollection(collection, isPdfBookmarkRecord)) throw new Error('Invalid PDF bookmark backup records.');
    for (const record of collection.records) {
      const publicationKey = pdfReaderIdentityKey(record.identity);
      if (record.publicationKey !== publicationKey || record.id !== `${publicationKey}::page:${record.page}`) {
        throw new Error('Invalid PDF bookmark identity. No Library data was changed.');
      }
    }
    assertUniqueRecords(collection.records, (record) => record.id, 'PDF bookmark');
  }
  if (value.settings !== undefined && !isPdfReaderSettings(value.settings)) throw new Error('Invalid PDF settings backup record.');
}

function validateSettings(value: unknown): asserts value is PortableSettingsStateV1 {
  if (!isRecord(value) || value.schemaVersion !== 1) throw new Error('Unsupported settings backup schema.');
  if (value.reader !== undefined && !parseReaderSettings(value.reader)) throw new Error('Invalid reader settings backup record.');
  if (value.site !== undefined && !parseSiteSettings(value.site)) throw new Error('Invalid site settings backup record.');
  if (value.legacyReader !== undefined && !parseLegacyReaderSettings(value.legacyReader)) throw new Error('Invalid legacy reader settings backup record.');
}

function validatePersonalBooks(value: unknown): asserts value is PortablePersonalBooksStateV1 {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.includesFiles !== false || !Array.isArray(value.records)) {
    throw new Error('Unsupported personal-book backup schema. Personal book files are not accepted in JSON backups.');
  }
  if (!value.records.every((record) => isPersonalBookPortableMetadataV1(record)
    && isRecord(record)
    && !('file' in record) && !('cover' in record) && !('data' in record))) {
    throw new Error('Invalid personal-book metadata backup records.');
  }
  const records = value.records as PersonalBookPortableMetadataV1[];
  for (const record of records) {
    if (record.id !== `${record.format}-${record.sha256.slice(0, 32)}`) {
      throw new Error('Invalid personal-book identity. No Library data was changed.');
    }
  }
  assertUniqueRecords(records, (record) => record.sha256, 'personal-book content');
}

export function parseLibraryBackupJson(raw: string): LibraryBackupV1 {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    throw new Error('This is not valid JSON. No Library data was changed.');
  }
  if (!isRecord(decoded) || decoded.format !== LIBRARY_BACKUP_FORMAT) {
    throw new Error('This file is not a Thiepn Library backup. No Library data was changed.');
  }
  if (decoded.schemaVersion !== LIBRARY_BACKUP_SCHEMA_VERSION) {
    throw new Error(`Unsupported Library backup schema version: ${String(decoded.schemaVersion)}.`);
  }
  if (typeof decoded.exportedAt !== 'string' || !isRecord(decoded.state)) throw new Error('The Library backup header is incomplete.');

  const state = decoded.state;
  if (state.main !== undefined) validateMain(state.main);
  if (state.pdf !== undefined) validatePdf(state.pdf);
  if (state.settings !== undefined) validateSettings(state.settings);
  if (state.personalBooks !== undefined) validatePersonalBooks(state.personalBooks);
  return decoded as unknown as LibraryBackupV1;
}

function mainPatch(main: PortableMainStateV1): LibraryDbPortabilityPatch {
  return {
    ...(main.favorites ? { favorites: main.favorites.records } : {}),
    ...(main.epubProgress ? { epubProgress: main.epubProgress.records } : {}),
    ...(main.legacyProgress ? { legacyProgress: main.legacyProgress.records } : {}),
    ...(main.bookmarks ? { bookmarks: main.bookmarks.records } : {}),
    ...(main.annotations ? { annotations: main.annotations.records } : {}),
    ...(main.readingActivity ? { readingActivity: main.readingActivity.records } : {}),
  };
}

function categoryNames(backup: LibraryBackupV1): string[] {
  const names: string[] = [];
  const main = backup.state.main;
  if (main?.favorites) names.push('favorites');
  if (main?.epubProgress) names.push('EPUB progress');
  if (main?.legacyProgress) names.push('legacy progress');
  if (main?.bookmarks) names.push('EPUB bookmarks');
  if (main?.annotations) names.push('annotations');
  if (main?.readingActivity) names.push('reading activity');
  const pdf = backup.state.pdf;
  if (pdf?.progress) names.push('PDF progress');
  if (pdf?.bookmarks) names.push('PDF bookmarks');
  if (pdf?.settings) names.push('PDF settings');
  const settings = backup.state.settings;
  if (settings?.reader) names.push('reader settings');
  if (settings?.site) names.push('site settings');
  if (settings?.legacyReader) names.push('legacy reader settings');
  if (backup.state.personalBooks) names.push('personal-book metadata');
  return names;
}

export async function restoreLibraryBackupJson(raw: string): Promise<LibraryRestoreResult> {
  // Full validation happens before the first mutation.
  const backup = parseLibraryBackupJson(raw);
  const [beforeMain, beforePdf, currentPersonalBooks] = await Promise.all([
    getLibraryDbPortabilitySnapshot(),
    getPdfReaderStateSnapshot(),
    getPersonalBooks(),
  ]);
  const beforePending = getPendingPersonalBookMetadata();
  const rawSettings = {
    reader: localStorage.getItem(READER_SETTINGS_KEY),
    site: localStorage.getItem(SITE_SETTINGS_KEY),
    legacyReader: localStorage.getItem(LEGACY_READER_SETTINGS_KEY),
  };

  const existingHashes = new Set(currentPersonalBooks.map((book) => book.sha256));
  const pending = backup.state.personalBooks?.records.filter((record) => !existingHashes.has(record.sha256)) ?? [];

  try {
    if (backup.state.main) await replaceLibraryDbPortabilitySnapshot(mainPatch(backup.state.main));
    if (backup.state.pdf) {
      await replacePdfReaderStateSnapshot({
        ...(backup.state.pdf.progress ? { progress: backup.state.pdf.progress.records } : {}),
        ...(backup.state.pdf.bookmarks ? { bookmarks: backup.state.pdf.bookmarks.records } : {}),
        ...(backup.state.pdf.settings ? { settings: backup.state.pdf.settings } : {}),
      });
    }
    if (backup.state.settings?.reader) writeJsonSetting(READER_SETTINGS_KEY, backup.state.settings.reader);
    if (backup.state.settings?.site) writeJsonSetting(SITE_SETTINGS_KEY, backup.state.settings.site);
    if (backup.state.settings?.legacyReader) {
      const { scale, measure } = backup.state.settings.legacyReader;
      writeJsonSetting(LEGACY_READER_SETTINGS_KEY, { scale, measure });
    }
    if (backup.state.personalBooks) replacePendingPersonalBookMetadata(pending);
  } catch (error) {
    let rollbackError: unknown;
    try {
      await replaceLibraryDbPortabilitySnapshot(beforeMain);
      await replacePdfReaderStateSnapshot(beforePdf);
      restoreRawSetting(READER_SETTINGS_KEY, rawSettings.reader);
      restoreRawSetting(SITE_SETTINGS_KEY, rawSettings.site);
      restoreRawSetting(LEGACY_READER_SETTINGS_KEY, rawSettings.legacyReader);
      replacePendingPersonalBookMetadata(beforePending);
    } catch (rollbackFailure) {
      rollbackError = rollbackFailure;
    }
    if (rollbackError) {
      throw new Error(
        `Backup restore failed and the automatic rollback could not be completed. Reload before making further changes. ${rollbackError instanceof Error ? rollbackError.message : ''}`.trim(),
        { cause: error },
      );
    }
    throw new Error(`Backup restore failed; your previous state was restored. ${error instanceof Error ? error.message : ''}`.trim(), { cause: error });
  }

  return {
    schemaVersion: 1,
    restoredCategories: categoryNames(backup),
    personalBooksNeedingFiles: pending.length,
  };
}

export function suggestedLibraryBackupFileName(now = new Date()): string {
  return `thiepn-library-backup-${now.toISOString().slice(0, 10)}.json`;
}

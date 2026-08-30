import {
  FAVORITE_SCHEMA_VERSION,
  LEGACY_ANNOTATION_SCHEMA_VERSION,
  LEGACY_PROGRESS_SCHEMA_VERSION,
  LIBRARY_DB_VERSION,
  isFavoriteRecordV1,
  isLegacyAnnotationRecordV1,
  isReaderProgressRecordV2,
  isReadingActivityRecordV1,
  isStoredLegacyProgressRecordV1,
  type FavoriteRecordV1,
  type LegacyAnnotationRecordV1,
  type ReaderProgressRecordV2,
  type ReadingActivityRecordV1,
  type StoredLegacyProgressRecordV1,
} from '../client/library-db';
import { parseAppSettings, type AppSettingsV1 } from '../client/app-settings';
import {
  isPdfBookmarkRecord,
  isPdfProgressRecord,
  parsePdfReaderSettings,
  type PdfBookmarkRecord,
  type PdfProgressRecord,
  type PdfReaderSettings,
} from '../pdf-reader/state';
import { isReaderAnnotationRecordV2, type ReaderAnnotationRecordV2 } from '../reader/annotation-store';
import { isReaderBookmarkRecordV2, type ReaderBookmarkRecordV2 } from '../reader/bookmark-store';
import { parseReaderSettings, type ReaderSettingsRecord } from '../reader/settings';
import {
  isPortablePersonalBookMetadataV1,
  type PortablePersonalBookMetadataV1,
} from './personal-metadata';

export const LIBRARY_BACKUP_KIND = 'thiepn-library-backup' as const;
export const LIBRARY_BACKUP_SCHEMA_VERSION = 1 as const;
export const LIBRARY_BACKUP_MAX_BYTES = 8 * 1024 * 1024;

export interface LibraryBackupSectionsV1 {
  favorites?: FavoriteRecordV1[];
  epubProgress?: ReaderProgressRecordV2[];
  legacyProgress?: StoredLegacyProgressRecordV1[];
  epubBookmarks?: ReaderBookmarkRecordV2[];
  epubAnnotations?: ReaderAnnotationRecordV2[];
  legacyAnnotations?: LegacyAnnotationRecordV1[];
  readingActivity?: ReadingActivityRecordV1[];
  pdfProgress?: PdfProgressRecord[];
  pdfBookmarks?: PdfBookmarkRecord[];
  personalBooks?: PortablePersonalBookMetadataV1[];
}

export interface LibraryBackupSettingsV1 {
  app?: AppSettingsV1;
  epub?: ReaderSettingsRecord;
  pdf?: PdfReaderSettings;
}

export interface LibraryBackupIntegrityV1 {
  skippedCorruptRecords: number;
  warnings: string[];
}

export interface LibraryBackupArchiveV1 {
  kind: typeof LIBRARY_BACKUP_KIND;
  schemaVersion: typeof LIBRARY_BACKUP_SCHEMA_VERSION;
  createdAt: string;
  libraryDbVersion: number;
  sections?: LibraryBackupSectionsV1;
  settings?: LibraryBackupSettingsV1;
  integrity: LibraryBackupIntegrityV1;
}

export interface LibraryBackupSummary {
  records: number;
  favorites: number;
  epubProgress: number;
  legacyProgress: number;
  epubBookmarks: number;
  epubAnnotations: number;
  legacyAnnotations: number;
  readingActivity: number;
  pdfProgress: number;
  pdfBookmarks: number;
  personalBooks: number;
  settings: number;
}

export class LibraryBackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryBackupError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validIsoLike(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));
}

function assertUnique<T>(values: T[], key: (value: T) => string, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    const id = key(value);
    if (seen.has(id)) throw new LibraryBackupError(`${label} contains a duplicate identity: ${id}`);
    seen.add(id);
  }
}

function parseArray<T>(
  value: unknown,
  validator: (candidate: unknown) => candidate is T,
  key: (record: T) => string,
  label: string,
): T[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new LibraryBackupError(`${label} must be an array.`);
  if (!value.every(validator)) throw new LibraryBackupError(`${label} contains an invalid or unsupported record.`);
  assertUnique(value, key, label);
  return value;
}

function parseIntegrity(value: unknown): LibraryBackupIntegrityV1 {
  if (!isRecord(value)) throw new LibraryBackupError('Backup integrity metadata is missing.');
  if (!Number.isInteger(value.skippedCorruptRecords) || Number(value.skippedCorruptRecords) < 0) {
    throw new LibraryBackupError('Backup integrity metadata has an invalid skipped-record count.');
  }
  if (!Array.isArray(value.warnings) || !value.warnings.every((warning) => typeof warning === 'string')) {
    throw new LibraryBackupError('Backup integrity warnings are invalid.');
  }
  return {
    skippedCorruptRecords: Number(value.skippedCorruptRecords),
    warnings: [...value.warnings],
  };
}

function parseSections(value: unknown): LibraryBackupSectionsV1 | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new LibraryBackupError('Backup sections are invalid.');
  const favorites = parseArray(value.favorites, isFavoriteRecordV1, (record) => record.workId, 'Favorites');
  const epubProgress = parseArray(value.epubProgress, isReaderProgressRecordV2, (record) => record.workId, 'EPUB progress');
  const legacyProgress = parseArray(value.legacyProgress, isStoredLegacyProgressRecordV1, (record) => record.workId, 'Legacy progress');
  const epubBookmarks = parseArray(value.epubBookmarks, isReaderBookmarkRecordV2, (record) => record.id, 'EPUB bookmarks');
  const epubAnnotations = parseArray(value.epubAnnotations, isReaderAnnotationRecordV2, (record) => record.id, 'EPUB annotations');
  const legacyAnnotations = parseArray(value.legacyAnnotations, isLegacyAnnotationRecordV1, (record) => record.id, 'Legacy annotations');
  const readingActivity = parseArray(value.readingActivity, isReadingActivityRecordV1, (record) => record.workId, 'Reading activity');
  const pdfProgress = parseArray(value.pdfProgress, isPdfProgressRecord, (record) => record.id, 'PDF progress');
  const pdfBookmarks = parseArray(value.pdfBookmarks, isPdfBookmarkRecord, (record) => record.id, 'PDF bookmarks');
  const personalBooks = parseArray(value.personalBooks, isPortablePersonalBookMetadataV1, (record) => record.id, 'Personal-book metadata');
  return {
    ...(favorites ? { favorites } : {}),
    ...(epubProgress ? { epubProgress } : {}),
    ...(legacyProgress ? { legacyProgress } : {}),
    ...(epubBookmarks ? { epubBookmarks } : {}),
    ...(epubAnnotations ? { epubAnnotations } : {}),
    ...(legacyAnnotations ? { legacyAnnotations } : {}),
    ...(readingActivity ? { readingActivity } : {}),
    ...(pdfProgress ? { pdfProgress } : {}),
    ...(pdfBookmarks ? { pdfBookmarks } : {}),
    ...(personalBooks ? { personalBooks } : {}),
  };
}

function parseSettings(value: unknown): LibraryBackupSettingsV1 | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) throw new LibraryBackupError('Backup settings are invalid.');
  const app = value.app === undefined ? undefined : parseAppSettings(value.app);
  const epub = value.epub === undefined ? undefined : parseReaderSettings(value.epub);
  const pdf = value.pdf === undefined ? undefined : parsePdfReaderSettings(value.pdf);
  if (value.app !== undefined && !app) throw new LibraryBackupError('Application settings are invalid or unsupported.');
  if (value.epub !== undefined && !epub) throw new LibraryBackupError('EPUB reader settings are invalid or unsupported.');
  if (value.pdf !== undefined && !pdf) throw new LibraryBackupError('PDF reader settings are invalid or unsupported.');
  return {
    ...(app ? { app } : {}),
    ...(epub ? { epub } : {}),
    ...(pdf ? { pdf } : {}),
  };
}

export function parseLibraryBackup(value: unknown): LibraryBackupArchiveV1 {
  if (!isRecord(value)) throw new LibraryBackupError('This file is not a Library backup.');
  if (value.kind !== LIBRARY_BACKUP_KIND) throw new LibraryBackupError('This file is not a Thiepn Library backup.');
  if (value.schemaVersion !== LIBRARY_BACKUP_SCHEMA_VERSION) {
    throw new LibraryBackupError(`Backup schema ${String(value.schemaVersion)} is not supported by this Library version.`);
  }
  if (!validIsoLike(value.createdAt)) throw new LibraryBackupError('Backup creation date is invalid.');
  if (!Number.isInteger(value.libraryDbVersion) || Number(value.libraryDbVersion) < 1) {
    throw new LibraryBackupError('Backup database version is invalid.');
  }
  return {
    kind: LIBRARY_BACKUP_KIND,
    schemaVersion: LIBRARY_BACKUP_SCHEMA_VERSION,
    createdAt: value.createdAt,
    libraryDbVersion: Number(value.libraryDbVersion),
    ...(value.sections === undefined ? {} : { sections: parseSections(value.sections) }),
    ...(value.settings === undefined ? {} : { settings: parseSettings(value.settings) }),
    integrity: parseIntegrity(value.integrity),
  };
}

export function parseLibraryBackupText(text: string): LibraryBackupArchiveV1 {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > LIBRARY_BACKUP_MAX_BYTES) {
    throw new LibraryBackupError(`Backup is larger than the ${LIBRARY_BACKUP_MAX_BYTES / 1024 / 1024} MB metadata limit.`);
  }
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new LibraryBackupError('Backup JSON is corrupt or incomplete.');
  }
  return parseLibraryBackup(decoded);
}

export function createLibraryBackupArchive(input: {
  createdAt?: string;
  sections?: LibraryBackupSectionsV1;
  settings?: LibraryBackupSettingsV1;
  skippedCorruptRecords?: number;
  warnings?: string[];
}): LibraryBackupArchiveV1 {
  return parseLibraryBackup({
    kind: LIBRARY_BACKUP_KIND,
    schemaVersion: LIBRARY_BACKUP_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    libraryDbVersion: LIBRARY_DB_VERSION,
    ...(input.sections ? { sections: input.sections } : {}),
    ...(input.settings ? { settings: input.settings } : {}),
    integrity: {
      skippedCorruptRecords: input.skippedCorruptRecords ?? 0,
      warnings: input.warnings ?? [],
    },
  });
}

export function summarizeLibraryBackup(archive: LibraryBackupArchiveV1): LibraryBackupSummary {
  const sections = archive.sections ?? {};
  const summary = {
    favorites: sections.favorites?.length ?? 0,
    epubProgress: sections.epubProgress?.length ?? 0,
    legacyProgress: sections.legacyProgress?.length ?? 0,
    epubBookmarks: sections.epubBookmarks?.length ?? 0,
    epubAnnotations: sections.epubAnnotations?.length ?? 0,
    legacyAnnotations: sections.legacyAnnotations?.length ?? 0,
    readingActivity: sections.readingActivity?.length ?? 0,
    pdfProgress: sections.pdfProgress?.length ?? 0,
    pdfBookmarks: sections.pdfBookmarks?.length ?? 0,
    personalBooks: sections.personalBooks?.length ?? 0,
    settings: Object.keys(archive.settings ?? {}).length,
  };
  return {
    records: summary.favorites
      + summary.epubProgress
      + summary.legacyProgress
      + summary.epubBookmarks
      + summary.epubAnnotations
      + summary.legacyAnnotations
      + summary.readingActivity
      + summary.pdfProgress
      + summary.pdfBookmarks
      + summary.personalBooks,
    ...summary,
  };
}

// Keep explicit schema constants referenced by this archive module so source-level
// certification can prove every historical portable record has a frozen version.
export const RR8_PORTABLE_RECORD_SCHEMAS = {
  favorite: FAVORITE_SCHEMA_VERSION,
  legacyProgress: LEGACY_PROGRESS_SCHEMA_VERSION,
  legacyAnnotation: LEGACY_ANNOTATION_SCHEMA_VERSION,
} as const;

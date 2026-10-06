import {
  getPendingPersonalBookMetadata,
  getPersonalBook,
  getPersonalBooks,
  importPersonalBook,
  type PersonalBookPortableMetadataV1,
  type PersonalBookSummary,
} from '../client/personal-books';
import { getThiepnAccountClient, type LibraryAccountUser } from './supabase';

export const LIBRARY_PERSONAL_FILES_BUCKET = 'library-personal-books';
export const LIBRARY_PERSONAL_FILES_PERMISSION = 'personal_files.sync';
export const LIBRARY_PERSONAL_FILE_MAX_BYTES = 50 * 1024 * 1024;

const CLOUD_OBJECT_PATTERN = /^[a-f0-9]{64}\.(?:epub|pdf)$/i;
const LIST_PAGE_SIZE = 100;

export type PersonalFileCloudStatus = 'disabled' | 'synced' | 'partial' | 'offline' | 'error';

export interface PersonalFileCloudResult {
  status: PersonalFileCloudStatus;
  message: string;
  uploaded: number;
  downloaded: number;
  alreadyAvailable: number;
  missingFromCloud: number;
  tooLargeForCloud: number;
}

function emptyResult(status: PersonalFileCloudStatus, message: string): PersonalFileCloudResult {
  return {
    status,
    message,
    uploaded: 0,
    downloaded: 0,
    alreadyAvailable: 0,
    missingFromCloud: 0,
    tooLargeForCloud: 0,
  };
}

function objectName(book: Pick<PersonalBookPortableMetadataV1, 'sha256' | 'format'>): string {
  return `${book.sha256.toLowerCase()}.${book.format}`;
}

export function personalFileCloudPath(
  userId: string,
  book: Pick<PersonalBookPortableMetadataV1, 'sha256' | 'format'>,
): string {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Invalid THIEPN Account identity for personal-file storage.');
  return `${userId}/${objectName(book)}`;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message) return message;
  }
  return 'Personal-book cloud sync failed.';
}

export async function isLibraryPersonalFileCloudEnabled(userId: string): Promise<boolean> {
  const { data, error } = await getThiepnAccountClient()
    .from('account_app_grants')
    .select('status')
    .eq('user_id', userId)
    .eq('app_slug', 'library')
    .eq('permission_id', LIBRARY_PERSONAL_FILES_PERMISSION)
    .maybeSingle();
  if (error) throw error;
  return data?.status === 'granted';
}

async function listCloudObjects(userId: string): Promise<Set<string>> {
  const storage = getThiepnAccountClient().storage.from(LIBRARY_PERSONAL_FILES_BUCKET);
  const names = new Set<string>();
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await storage.list(userId, {
      limit: LIST_PAGE_SIZE,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    const page = data ?? [];
    for (const item of page) {
      if (CLOUD_OBJECT_PATTERN.test(item.name)) names.add(item.name.toLowerCase());
    }
    if (page.length < LIST_PAGE_SIZE) break;
  }
  return names;
}

async function sha256(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('This browser cannot verify personal-book cloud integrity.');
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function uploadBook(
  user: LibraryAccountUser,
  book: PersonalBookSummary,
  cloudObjects: Set<string>,
): Promise<'uploaded' | 'present' | 'too-large'> {
  if (book.size > LIBRARY_PERSONAL_FILE_MAX_BYTES) return 'too-large';
  const name = objectName(book);
  if (cloudObjects.has(name)) return 'present';

  const full = await getPersonalBook(book.id);
  if (!full) throw new Error(`${book.title} is no longer available on this device.`);
  if (full.sha256.toLowerCase() !== book.sha256.toLowerCase()) {
    throw new Error(`Local personal-book identity changed for ${book.title}.`);
  }

  const { error } = await getThiepnAccountClient()
    .storage
    .from(LIBRARY_PERSONAL_FILES_BUCKET)
    .upload(personalFileCloudPath(user.id, book), full.file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    // A second device may have won the immutable content-addressed upload race.
    const refreshed = await listCloudObjects(user.id);
    if (!refreshed.has(name)) throw error;
  }

  cloudObjects.add(name);
  return 'uploaded';
}

async function downloadPendingBook(
  user: LibraryAccountUser,
  metadata: PersonalBookPortableMetadataV1,
  cloudObjects: Set<string>,
): Promise<'downloaded' | 'present' | 'missing'> {
  const current = await getPersonalBook(metadata.id);
  if (current?.sha256.toLowerCase() === metadata.sha256.toLowerCase()) return 'present';

  const name = objectName(metadata);
  if (!cloudObjects.has(name)) return 'missing';

  const { data, error } = await getThiepnAccountClient()
    .storage
    .from(LIBRARY_PERSONAL_FILES_BUCKET)
    .download(personalFileCloudPath(user.id, metadata));
  if (error) throw error;

  if (data.size !== metadata.size) {
    throw new Error(`Cloud copy size mismatch for ${metadata.title}; the local library was not changed.`);
  }
  const digest = await sha256(data);
  if (digest.toLowerCase() !== metadata.sha256.toLowerCase()) {
    throw new Error(`Cloud copy integrity mismatch for ${metadata.title}; the local library was not changed.`);
  }

  const file = new File([data], metadata.fileName, {
    type: metadata.mimeType,
    lastModified: Date.now(),
  });
  const imported = await importPersonalBook(file);
  if (imported.record.sha256.toLowerCase() !== metadata.sha256.toLowerCase()) {
    throw new Error(`Downloaded personal-book identity mismatch for ${metadata.title}.`);
  }
  return 'downloaded';
}

export async function reconcileLibraryPersonalFiles(user: LibraryAccountUser): Promise<PersonalFileCloudResult> {
  if (!navigator.onLine) {
    return emptyResult('offline', 'Offline. Personal books already stored on this device remain available.');
  }

  try {
    if (!await isLibraryPersonalFileCloudEnabled(user.id)) {
      return emptyResult('disabled', 'Personal-book cloud continuity is not enabled in THIEPN Account.');
    }

    const [localBooks, pending, cloudObjects] = await Promise.all([
      getPersonalBooks(),
      Promise.resolve(getPendingPersonalBookMetadata()),
      listCloudObjects(user.id),
    ]);

    const result = emptyResult('synced', 'Personal books are available across this Account where cloud copies exist.');

    for (const book of localBooks) {
      const outcome = await uploadBook(user, book, cloudObjects);
      if (outcome === 'uploaded') result.uploaded += 1;
      else if (outcome === 'present') result.alreadyAvailable += 1;
      else result.tooLargeForCloud += 1;
    }

    for (const metadata of pending) {
      const outcome = await downloadPendingBook(user, metadata, cloudObjects);
      if (outcome === 'downloaded') result.downloaded += 1;
      else if (outcome === 'present') result.alreadyAvailable += 1;
      else result.missingFromCloud += 1;
    }

    const incomplete = result.missingFromCloud > 0 || result.tooLargeForCloud > 0;
    result.status = incomplete ? 'partial' : 'synced';

    const changes = [];
    if (result.uploaded) changes.push(`${result.uploaded} uploaded`);
    if (result.downloaded) changes.push(`${result.downloaded} restored to this device`);
    if (result.tooLargeForCloud) changes.push(`${result.tooLargeForCloud} over the 50 MB cloud limit`);
    if (result.missingFromCloud) changes.push(`${result.missingFromCloud} still need the original file`);
    result.message = changes.length
      ? `Personal-book cloud: ${changes.join(' · ')}.`
      : 'Personal-book cloud is up to date.';

    window.dispatchEvent(new CustomEvent<PersonalFileCloudResult>('thiepn:library-personal-files', { detail: result }));
    return result;
  } catch (error) {
    const result = emptyResult('error', describeError(error));
    window.dispatchEvent(new CustomEvent<PersonalFileCloudResult>('thiepn:library-personal-files', { detail: result }));
    return result;
  }
}

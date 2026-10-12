import {
  createLibraryBackup,
  restoreLibraryBackupJson,
  parseLibraryBackupJson,
  type LibraryBackup,
} from '../client/library-portability';
import {
  getThiepnAccountClient,
  isLibraryAccountConnectionActive,
  type LibraryAccountUser,
} from './supabase';
import { summarizeCopy, compareNotes, type CopySummary, type NoteComparison } from './sync-review';
import {
  backupHasMeaningfulLibraryState,
  decideLibrarySync,
  type LibrarySyncBaseline,
} from './sync-policy';

export const LIBRARY_ACCOUNT_SYNC_KEY = 'thiepn.library.account-sync.v1';
const DEVICE_ID_KEY = 'thiepn.library.device-id.v1';
const APP_VERSION = '1.1.0-notebook-v2';

export type LibrarySyncStatus =
  | 'disabled'
  | 'synced'
  | 'pushed'
  | 'pulled'
  | 'conflict'
  | 'offline'
  | 'error';

export interface LibrarySyncResult {
  status: LibrarySyncStatus;
  message: string;
  revision?: number;
  cloudUpdatedAt?: string;
}

interface LibrarySyncMeta {
  schemaVersion: 1;
  userId: string;
  enabled: boolean;
  revision?: number;
  hash?: string;
  lastSyncedAt?: string;
  deviceId: string;
}

interface CloudState {
  revision: number;
  state: LibraryBackup;
  updated_at?: string;
}

function safeParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; }
  catch { return null; }
}

function createDeviceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `library-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getDeviceId(): string {
  try {
    const current = localStorage.getItem(DEVICE_ID_KEY);
    if (current) return current;
    const next = createDeviceId();
    localStorage.setItem(DEVICE_ID_KEY, next);
    return next;
  } catch {
    return createDeviceId();
  }
}

export function readLibrarySyncMeta(): LibrarySyncMeta | null {
  let value: Partial<LibrarySyncMeta> | null = null;
  try {
    value = safeParse<Partial<LibrarySyncMeta>>(localStorage.getItem(LIBRARY_ACCOUNT_SYNC_KEY));
  } catch {
    return null;
  }
  if (!value || value.schemaVersion !== 1 || typeof value.userId !== 'string' || typeof value.enabled !== 'boolean') return null;
  return {
    schemaVersion: 1,
    userId: value.userId,
    enabled: value.enabled,
    ...(typeof value.revision === 'number' ? { revision: value.revision } : {}),
    ...(typeof value.hash === 'string' ? { hash: value.hash } : {}),
    ...(typeof value.lastSyncedAt === 'string' ? { lastSyncedAt: value.lastSyncedAt } : {}),
    deviceId: typeof value.deviceId === 'string' && value.deviceId ? value.deviceId : getDeviceId(),
  };
}

function writeLibrarySyncMeta(meta: LibrarySyncMeta): void {
  try { localStorage.setItem(LIBRARY_ACCOUNT_SYNC_KEY, JSON.stringify(meta)); }
  catch {
    // The reader remains functional; account sync will simply lack a durable baseline.
  }
}

function metaForUser(userId: string): LibrarySyncMeta {
  const existing = readLibrarySyncMeta();
  if (existing?.userId === userId) return existing;
  return {
    schemaVersion: 1,
    userId,
    enabled: false,
    deviceId: getDeviceId(),
  };
}

export function isLibrarySyncEnabledForUser(userId: string): boolean {
  const meta = readLibrarySyncMeta();
  return meta?.userId === userId && meta.enabled;
}

export function pauseLibrarySync(userId: string): void {
  const meta = metaForUser(userId);
  writeLibrarySyncMeta({ ...meta, enabled: false });
  emitSync({ status: 'disabled', message: 'Cloud sync is paused on this device.' });
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

async function hashBackup(backup: LibraryBackup): Promise<string> {
  const canonical = {
    format: backup.format,
    schemaVersion: backup.schemaVersion,
    state: backup.state,
  };
  const bytes = new TextEncoder().encode(stableStringify(canonical));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeCloudState(value: unknown): CloudState {
  if (typeof value !== 'object' || value === null) throw new Error('Invalid Library cloud state response.');
  const row = value as { revision?: unknown; state?: unknown; updated_at?: unknown };
  if (typeof row.revision !== 'number' || !Number.isFinite(row.revision) || typeof row.state !== 'object' || row.state === null) {
    throw new Error('Invalid Library cloud state response.');
  }
  return {
    revision: row.revision,
    state: parseLibraryBackupJson(JSON.stringify(row.state)),
    ...(typeof row.updated_at === 'string' ? { updated_at: row.updated_at } : {}),
  };
}

async function assertNotebookSyncProtocol(): Promise<void> {
  const { data, error } = await getThiepnAccountClient().rpc('library_note_sync_capabilities');
  if (error || !data || typeof data !== 'object') {
    throw new Error('Notebook cloud sync is paused: server V2 downgrade protection has not been independently enabled. Your local notes remain unchanged.');
  }
  const capability = data as Record<string, unknown>;
  if (capability.library_backup_schema !== 2 || capability.revision_cas !== true ||
      capability.notebook_rollback_guard !== true || capability.format !== 'thiepn-library-backup') {
    throw new Error('Notebook cloud sync is paused: required server V2 protections are missing. Your local notes remain unchanged.');
  }
}

async function readCloudState(): Promise<CloudState | undefined> {
  const { data, error } = await getThiepnAccountClient()
    .from('library_sync_state')
    .select('revision,state,updated_at')
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeCloudState(data) : undefined;
}

async function writeCloudState(
  expectedRevision: number | null,
  state: LibraryBackup,
  deviceId: string,
): Promise<CloudState> {
  const { data, error } = await getThiepnAccountClient().rpc('sync_thiepn_library_state', {
    p_expected_revision: expectedRevision,
    p_state: state,
    p_app_version: APP_VERSION,
    p_device_id: deviceId,
    p_client_updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return normalizeCloudState(data);
}

function setBaseline(userId: string, enabled: boolean, cloud: CloudState, hash: string): void {
  writeLibrarySyncMeta({
    schemaVersion: 1,
    userId,
    enabled,
    revision: cloud.revision,
    hash,
    lastSyncedAt: new Date().toISOString(),
    deviceId: metaForUser(userId).deviceId,
  });
}

function emitSync(result: LibrarySyncResult): void {
  window.dispatchEvent(new CustomEvent<LibrarySyncResult>('thiepn:library-sync', { detail: result }));
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return String((error as { message: string }).message);
  }
  return 'Library cloud sync failed.';
}

async function applyCloud(userId: string, cloud: CloudState): Promise<LibrarySyncResult> {
  await restoreLibraryBackupJson(JSON.stringify(cloud.state));
  const hash = await hashBackup(cloud.state);
  setBaseline(userId, true, cloud, hash);
  const result: LibrarySyncResult = {
    status: 'pulled',
    message: 'Cloud reading state was restored to this device.',
    revision: cloud.revision,
    ...(cloud.updated_at ? { cloudUpdatedAt: cloud.updated_at } : {}),
  };
  emitSync(result);
  return result;
}

async function pushLocal(
  userId: string,
  cloud: CloudState | undefined,
  local: LibraryBackup,
): Promise<LibrarySyncResult> {
  const meta = metaForUser(userId);
  const saved = await writeCloudState(cloud?.revision ?? null, local, meta.deviceId);
  const hash = await hashBackup(local);
  setBaseline(userId, true, saved, hash);
  const result: LibrarySyncResult = {
    status: 'pushed',
    message: 'This device is synced to your THIEPN Account.',
    revision: saved.revision,
    ...(saved.updated_at ? { cloudUpdatedAt: saved.updated_at } : {}),
  };
  emitSync(result);
  return result;
}

export async function enableLibraryAccountSync(user: LibraryAccountUser): Promise<LibrarySyncResult> {
  if (!(await isLibraryAccountConnectionActive())) {
    return {
      status: 'disabled',
      message: 'Library is not connected in THIEPN Account.',
    };
  }
  const current = metaForUser(user.id);
  writeLibrarySyncMeta({
    ...current,
    enabled: true,
    userId: user.id,
    deviceId: current.deviceId,
  });
  return reconcileLibraryAccountSync(user);
}

export async function reconcileLibraryAccountSync(user: LibraryAccountUser): Promise<LibrarySyncResult> {
  const meta = metaForUser(user.id);
  if (!meta.enabled) return { status: 'disabled', message: 'Cloud sync is not enabled on this device.' };
  if (!navigator.onLine) {
    return {
      status: 'offline',
      message: 'Offline. Local reading remains available and sync will resume when connected.',
    };
  }

  try {
    const connected = await isLibraryAccountConnectionActive();
    if (!connected) {
      writeLibrarySyncMeta({ ...meta, enabled: false });
      const result: LibrarySyncResult = {
        status: 'disabled',
        message: 'Library is disconnected in THIEPN Account. Reconnect it from THIEPN Account before resuming sync.',
      };
      emitSync(result);
      return result;
    }

    await assertNotebookSyncProtocol();
    const [local, cloud] = await Promise.all([createLibraryBackup(), readCloudState()]);
    const localHash = await hashBackup(local);
    const cloudHash = cloud ? await hashBackup(cloud.state) : undefined;
    const baseline: LibrarySyncBaseline | undefined =
      typeof meta.revision === 'number' && typeof meta.hash === 'string'
        ? { revision: meta.revision, hash: meta.hash }
        : undefined;

    const decision = decideLibrarySync({
      ...(baseline ? { baseline } : {}),
      ...(cloud && cloudHash ? { cloud: { revision: cloud.revision, hash: cloudHash } } : {}),
      localHash,
      localMeaningful: backupHasMeaningfulLibraryState(local),
    });

    if (decision === 'push') return await pushLocal(user.id, cloud, local);
    if (decision === 'pull' && cloud) return await applyCloud(user.id, cloud);

    if (decision === 'noop' && cloud && cloudHash) {
      setBaseline(user.id, true, cloud, cloudHash);
      const result: LibrarySyncResult = {
        status: 'synced',
        message: 'Library is up to date.',
        revision: cloud.revision,
        ...(cloud.updated_at ? { cloudUpdatedAt: cloud.updated_at } : {}),
      };
      emitSync(result);
      return result;
    }

    const result: LibrarySyncResult = {
      status: 'conflict',
      message: cloud
        ? 'This device and the cloud both contain changes. Choose which copy should become authoritative.'
        : 'The cloud copy is missing while this device has an earlier sync baseline. Choose this device to recreate it.',
      ...(cloud ? { revision: cloud.revision } : {}),
      ...(cloud?.updated_at ? { cloudUpdatedAt: cloud.updated_at } : {}),
    };
    emitSync(result);
    return result;
  } catch (error) {
    const message = describeError(error);
    const conflict = /LIBRARY_SYNC_CONFLICT|40001/i.test(message);
    const result: LibrarySyncResult = {
      status: conflict ? 'conflict' : 'error',
      message: conflict
        ? 'Another device updated Library while this device was syncing. Review the conflict before continuing.'
        : message,
    };
    emitSync(result);
    return result;
  }
}

export async function chooseThisDeviceForLibrarySync(user: LibraryAccountUser): Promise<LibrarySyncResult> {
  try {
    await assertNotebookSyncProtocol();
    const [local, cloud] = await Promise.all([createLibraryBackup(), readCloudState()]);
    return await pushLocal(user.id, cloud, local);
  } catch (error) {
    const result: LibrarySyncResult = { status: 'error', message: describeError(error) };
    emitSync(result);
    return result;
  }
}

export async function chooseCloudForLibrarySync(user: LibraryAccountUser): Promise<LibrarySyncResult> {
  try {
    await assertNotebookSyncProtocol();
    const cloud = await readCloudState();
    if (!cloud) {
      const result: LibrarySyncResult = { status: 'error', message: 'No Library cloud copy exists.' };
      emitSync(result);
      return result;
    }
    return await applyCloud(user.id, cloud);
  } catch (error) {
    const result: LibrarySyncResult = { status: 'error', message: describeError(error) };
    emitSync(result);
    return result;
  }
}

export interface LibraryConflictReview {
  userId: string;
  localHash: string;
  cloudHash: string | null;
  cloudRevision: number | null;
  cloudUpdatedAt?: string;
  device: CopySummary;
  cloud?: CopySummary;
  noteChanges?: NoteComparison;
}

async function reviewedCopies(user: LibraryAccountUser) {
  if (!isLibrarySyncEnabledForUser(user.id))
    throw new Error('Private sync is not enabled on this device.');
  if (!(await isLibraryAccountConnectionActive()))
    throw new Error('This Library account is no longer connected.');
  await assertNotebookSyncProtocol();
  const [local, cloud] = await Promise.all([createLibraryBackup(), readCloudState()]);
  return { local, cloud };
}

/** Preview only. Never changes either copy. */
export async function previewLibraryConflict(user: LibraryAccountUser): Promise<LibraryConflictReview> {
  const { local, cloud } = await reviewedCopies(user);
  return {
    userId: user.id,
    localHash: await hashBackup(local),
    cloudHash: cloud ? await hashBackup(cloud.state) : null,
    cloudRevision: cloud?.revision ?? null,
    ...(cloud?.updated_at ? { cloudUpdatedAt: cloud.updated_at } : {}),
    device: summarizeCopy(local),
    ...(cloud ? {
      cloud: summarizeCopy(cloud.state),
      noteChanges: compareNotes(
        local.state.main?.noteDocuments?.records ?? [],
        cloud.state.state.main?.noteDocuments?.records ?? [],
      ),
    } : {}),
  };
}

function downloadJsonBackup(backup: LibraryBackup, fileName: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2) + '\n'],
    { type: 'application/json;charset=utf-8' }));
  try {
    const link = document.createElement('a');
    link.href = url; link.download = fileName; document.body.append(link); link.click(); link.remove();
  } finally { window.setTimeout(() => URL.revokeObjectURL(url), 10000); }
}

/** This local backup remains usable when Account is offline or V2 sync is blocked. */
export async function downloadLocalConflictBackup(): Promise<void> {
  downloadJsonBackup(await createLibraryBackup(), 'thiepn-library-device-safety-copy.json');
}

export async function downloadCloudConflictBackup(user: LibraryAccountUser): Promise<void> {
  const { cloud } = await reviewedCopies(user);
  if (!cloud) throw new Error('There is no cloud copy to download.');
  downloadJsonBackup(cloud.state, 'thiepn-library-cloud-rev-' + cloud.revision + '.json');
}

/** A review is a one-time snapshot: re-read both copies before either direction. */
export async function resolveReviewedLibraryConflict(
  user: LibraryAccountUser, review: LibraryConflictReview, choice: 'device' | 'cloud',
): Promise<LibrarySyncResult> {
  try {
    if (review.userId !== user.id) throw new Error('Account changed. Start a new review.');
    const { local, cloud } = await reviewedCopies(user);
    const localHash = await hashBackup(local);
    const cloudHash = cloud ? await hashBackup(cloud.state) : null;
    if (localHash !== review.localHash || cloudHash !== review.cloudHash ||
        (cloud?.revision ?? null) !== review.cloudRevision) {
      const result: LibrarySyncResult = { status: 'conflict',
        message: 'A copy changed since your review. Review both versions again before continuing.' };
      emitSync(result);
      return result;
    }
    if (choice === 'device') return await pushLocal(user.id, cloud, local);
    if (!cloud) throw new Error('There is no cloud copy to restore.');
    return await applyCloud(user.id, cloud);
  } catch (error) {
    const message = describeError(error);
    const result: LibrarySyncResult = {
      status: /LIBRARY_SYNC_CONFLICT|40001/i.test(message) ? 'conflict' : 'error',
      message: /LIBRARY_SYNC_CONFLICT|40001/i.test(message)
        ? 'Another device changed the cloud. Review both versions again.' : message,
    };
    emitSync(result);
    return result;
  }
}

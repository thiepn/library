import {
  createLibraryBackup,
  restoreLibraryBackupJson,
  type LibraryBackupV1,
} from '../client/library-portability';
import {
  getThiepnAccountClient,
  isLibraryAccountConnectionActive,
  getVerifiedLibraryAccountUser,
  type LibraryAccountUser,
} from './supabase';
import {
  backupHasMeaningfulLibraryState,
  decideLibrarySync,
  type LibrarySyncBaseline,
} from './sync-policy';
import { validateNativeCloudRestore, type NativeCloudRestorePreview } from './recovery-guard';
import { assessLibraryRestoreReadback } from './restore-witness';
import { assessNativeReconciliation } from './native-reconciliation';
import { describeNativeLibraryHeads } from './conflict-preview';

export const LIBRARY_ACCOUNT_SYNC_KEY = 'thiepn.library.account-sync.v1';
const DEVICE_ID_KEY = 'thiepn.library.device-id.v1';
const APP_VERSION = '1.0.0-account-sync';
let pendingCloudRestore: NativeCloudRestorePreview | null = null;

/** Clear the preflight whenever the native owner, permission or direction changes. */
export function cancelPreparedLibraryCloudRestore(): void {
  pendingCloudRestore = null;
}

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
  state: LibraryBackupV1;
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

async function hashBackup(backup: LibraryBackupV1): Promise<string> {
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
    state: row.state as LibraryBackupV1,
    ...(typeof row.updated_at === 'string' ? { updated_at: row.updated_at } : {}),
  };
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
  state: LibraryBackupV1,
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

async function applyCloud(
  userId: string,
  cloud: CloudState,
  expectedLocalHash: string,
): Promise<LibrarySyncResult> {
  // A local editor or second device can change during the native cloud read.
  // Re-read BOTH heads before destructive import; never import a stale result.
  const meta = readLibrarySyncMeta();
  if (meta?.userId !== userId || !meta.enabled)
    throw new Error('LIBRARY_SYNC_CONFLICT: native Account/device changed');
  const [freshCloud, freshLocal, verifiedUser] = await Promise.all([
    readCloudState(), createLibraryBackup(), getVerifiedLibraryAccountUser(),
  ]);
  if (verifiedUser?.id !== userId ||
    (await hashBackup(freshLocal)) !== expectedLocalHash ||
    !freshCloud || freshCloud.revision !== cloud.revision ||
    (await hashBackup(freshCloud.state)) !== (await hashBackup(cloud.state)))
    throw new Error('LIBRARY_SYNC_CONFLICT: local or cloud head changed before restore');
  // The original portability engine performs its own validated import and
  // rollback on write failure. Verify its actual result before advancing the
  // native sync baseline; no new importer or Core writer is introduced.
  await restoreLibraryBackupJson(JSON.stringify(cloud.state));
  const [afterImport, authenticated] = await Promise.all([
    createLibraryBackup(), getVerifiedLibraryAccountUser(),
  ]);
  const hash = await hashBackup(cloud.state);
  const afterMeta = readLibrarySyncMeta();
  const checked = assessLibraryRestoreReadback({
    ownerId: userId,
    deviceId: meta.deviceId,
    revision: cloud.revision,
    expectedHash: hash,
    observedHash: await hashBackup(afterImport),
    authenticatedOwnerId: authenticated?.id ?? null,
    activeDevice: afterMeta?.enabled === true &&
      afterMeta.userId === userId &&
      afterMeta.deviceId === meta.deviceId,
  });
  if (checked.status !== 'native-readback-only')
    throw new Error('LIBRARY_SYNC_RESTORE_UNVERIFIED: ' + checked.next);
  // A second device can write after preflight while original local restore
  // runs. Re-read native cloud CAS before reporting a successful pull.
  const [postCloud, postOwner] = await Promise.all([
    readCloudState(), getVerifiedLibraryAccountUser(),
  ]);
  const postMeta = readLibrarySyncMeta();
  const outcome = assessNativeReconciliation({
    ownerId: userId, deviceId: meta.deviceId,
    authenticatedOwnerId: postOwner?.id ?? null,
    activeOwnerId: postMeta?.userId ?? null,
    activeDeviceId: postMeta?.deviceId ?? null,
    enabled: postMeta?.enabled === true,
    expectedRevision: cloud.revision,
    expectedHash: hash,
    observedRevision: postCloud?.revision ?? null,
    observedCloudHash: postCloud ? await hashBackup(postCloud.state) : null,
    observedLocalHash: await hashBackup(await createLibraryBackup()),
  });
  if (outcome !== 'confirmed-native-only')
    throw new Error('LIBRARY_SYNC_CONFLICT: post-restore reconciliation ' + outcome);
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
  local: LibraryBackupV1,
): Promise<LibrarySyncResult> {
  const meta = metaForUser(userId);
  // Native CAS RPC is the only remote writer. An acknowledged write must not
  // advance local baseline if another device changed the cloud head before
  // our authoritative readback, or local edits happened during the RPC.
  const hash = await hashBackup(local);
  const saved = await writeCloudState(cloud?.revision ?? null, local, meta.deviceId);
  const [verifiedCloud, verifiedLocal, verifiedOwner] = await Promise.all([
    readCloudState(), createLibraryBackup(), getVerifiedLibraryAccountUser(),
  ]);
  const currentMeta = readLibrarySyncMeta();
  const outcome = assessNativeReconciliation({
    ownerId: userId, deviceId: meta.deviceId,
    authenticatedOwnerId: verifiedOwner?.id ?? null,
    activeOwnerId: currentMeta?.userId ?? null,
    activeDeviceId: currentMeta?.deviceId ?? null,
    enabled: currentMeta?.enabled === true,
    expectedRevision: saved.revision,
    expectedHash: hash,
    observedRevision: verifiedCloud?.revision ?? null,
    observedCloudHash: verifiedCloud ? await hashBackup(verifiedCloud.state) : null,
    observedLocalHash: await hashBackup(verifiedLocal),
  });
  if (outcome !== 'confirmed-native-only')
    throw new Error('LIBRARY_SYNC_CONFLICT: post-push reconciliation ' + outcome);
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

/**
 * Read-only original Library conflict preview: no Core records, private book
 * metadata or backup JSON cross this boundary. Never mutates native CAS.
 */
export async function inspectNativeLibraryHeads(user: LibraryAccountUser) {
  const meta = readLibrarySyncMeta();
  if (!meta || meta.userId !== user.id || !meta.enabled ||
    !(await isLibraryAccountConnectionActive()) ||
    (await getVerifiedLibraryAccountUser())?.id !== user.id)
    throw new Error('B20_LIBRARY_NATIVE_OWNER_REQUIRED');
  const [local, cloud] = await Promise.all([createLibraryBackup(), readCloudState()]);
  const [localHash, cloudHash] = await Promise.all([
    hashBackup(local), cloud ? hashBackup(cloud.state) : Promise.resolve(null),
  ]);
  const owner = await getVerifiedLibraryAccountUser();
  const nextMeta = readLibrarySyncMeta();
  const lastLocalHash = await hashBackup(await createLibraryBackup());
  if (owner?.id !== user.id || nextMeta?.userId !== user.id ||
    nextMeta.deviceId !== meta.deviceId || !nextMeta.enabled ||
    nextMeta.revision !== meta.revision || nextMeta.hash !== meta.hash ||
    lastLocalHash !== localHash)
    throw new Error('B20_LIBRARY_HEADS_CHANGED_DURING_INSPECTION');
  const report = describeNativeLibraryHeads({
    baselineRevision: meta.revision ?? null,
    baselineHash: meta.hash ?? null,
    localHash,
    cloudRevision: cloud?.revision ?? null,
    cloudHash,
  });
  return {
    ...report, cloudRevision: cloud?.revision ?? null,
    baselineRevision: meta.revision ?? null,
    externalCustody: 'NOT_TESTED' as const,
  };
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
    if (decision === 'pull' && cloud) return await applyCloud(user.id, cloud, localHash);

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
    const unverified = /LIBRARY_SYNC_RESTORE_UNVERIFIED/.test(message);
    const conflict = /LIBRARY_SYNC_CONFLICT|40001/i.test(message);
    if (unverified) {
      const result: LibrarySyncResult = {
        status: 'error',
        message: 'Native Library imported a cloud snapshot but could not confirm matching local data or permission. The sync baseline was NOT advanced. Inspect the native backup and recovery controls before retrying.',
      };
      emitSync(result);
      return result;
    }
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
    const [local, cloud] = await Promise.all([createLibraryBackup(), readCloudState()]);
    return await pushLocal(user.id, cloud, local);
  } catch (error) {
    const message = describeError(error);
    const conflict = /LIBRARY_SYNC_CONFLICT|40001/i.test(message);
    const result: LibrarySyncResult = {
      status: conflict ? 'conflict' : 'error',
      message: conflict
        ? 'The cloud or local Library state changed while this device was publishing. Nothing was marked synced. Inspect both copies, preserve the original backup and choose again.'
        : message,
    };
    emitSync(result);
    return result;
  }
}

/**
 * Native owner action: prepare a real original-format portable backup before
 * replacing local categories from cloud. This is a download OFFER, not proof
 * that the owner saved the file. No Core writer or alternative import exists.
 */
export async function prepareLibraryCloudRestore(user: LibraryAccountUser) {
  cancelPreparedLibraryCloudRestore();
  const meta = readLibrarySyncMeta();
  if (meta?.userId !== user.id || !meta.enabled ||
    !(await isLibraryAccountConnectionActive()) ||
    (await getVerifiedLibraryAccountUser())?.id !== user.id)
    throw new Error('Library Account permission is required before preparing recovery.');
  const [local, cloud] = await Promise.all([createLibraryBackup(), readCloudState()]);
  if (!cloud) throw new Error('No native Library cloud copy exists.');
  const [localHash, cloudHash] = await Promise.all([
    hashBackup(local), hashBackup(cloud.state),
  ]);
  pendingCloudRestore = {
    ownerId: user.id, deviceId: meta.deviceId, localHash,
    cloudHash, cloudRevision: cloud.revision,
    expiresAt: Date.now() + 120_000,
  };
  return {
    backupJson: JSON.stringify(local),
    cloudRevision: cloud.revision,
    expiresAt: pendingCloudRestore.expiresAt,
  };
}

export async function chooseCloudForLibrarySync(user: LibraryAccountUser): Promise<LibrarySyncResult> {
  const preview = pendingCloudRestore;
  cancelPreparedLibraryCloudRestore();
  try {
    const [local, cloud] = await Promise.all([createLibraryBackup(), readCloudState()]);
    const meta = readLibrarySyncMeta();
    if (!cloud || !meta) throw new Error('LIBRARY_SYNC_CONFLICT: missing native recovery baseline');
    const [localHash, cloudHash] = await Promise.all([
      hashBackup(local), hashBackup(cloud.state),
    ]);
    const outcome = validateNativeCloudRestore(preview, {
      ownerId: user.id, deviceId: meta.deviceId, localHash, cloudHash,
      cloudRevision: cloud.revision, now: Date.now(),
      nativeEnabled: meta.userId === user.id && meta.enabled,
    });
    if (outcome !== 'ready')
      throw new Error('LIBRARY_SYNC_CONFLICT: recovery preparation ' + outcome +
        '. Preserve a backup and prepare again.');
    return await applyCloud(user.id, cloud, localHash);
  } catch (error) {
    const message = describeError(error);
    const result: LibrarySyncResult = {
      status: /LIBRARY_SYNC_CONFLICT/.test(message) ? 'conflict' : 'error',
      message,
    };
    emitSync(result);
    return result;
  }
}

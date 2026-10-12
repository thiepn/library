import {
  initializeLibraryAccountSso,
  getVerifiedLibraryAccountUser,
  hasThiepnAccountConfiguration,
  subscribeLibraryAccountAuth,
} from './supabase';
import {
  isLibrarySyncEnabledForUser,
  reconcileLibraryAccountSync,
} from './sync';
import { reconcileLibraryPersonalFiles } from './personal-files';
import { isLibraryAutomaticSyncEnabled } from './auto-sync';

type AutoState = 'checking' | 'up-to-date' | 'conflict' | 'offline' | 'error' | 'paused';
function report(ownerId: string, state: AutoState) {
  window.dispatchEvent(new CustomEvent('thiepn:library-auto-sync-state', {
    detail: { ownerId, state, checkedAt: Date.now() },
  }));
}
export function mountLibraryAccountRuntime(): () => void {
  if (!hasThiepnAccountConfiguration()) return () => {};

  let timer: number | undefined;
  let running = false;
  let disposed = false;
  let conflictPausedFor: string | null = null;

  const run = async () => {
    if (disposed || running || !navigator.onLine || document.visibilityState !== 'visible') return;
    running = true;
    try {
      // The shared SDK verifies app-local identity, probes the Account origin
      // only when needed, and deduplicates PKCE redirects and sign-out races.
      const initialized = await initializeLibraryAccountSso();
      if (initialized.status === 'redirecting' || initialized.identity.status !== 'signed-in') return;

      const user = await getVerifiedLibraryAccountUser();
      if (!user) return;

      if (conflictPausedFor === user.id) { report(user.id, 'conflict'); return; }
      if (!isLibraryAutomaticSyncEnabled(user.id)) { report(user.id, 'paused'); return; }
      if (isLibrarySyncEnabledForUser(user.id)) {
        report(user.id, 'checking');
        const result = await reconcileLibraryAccountSync(user);
        if (result.status === 'conflict') {
          conflictPausedFor = user.id;
          report(user.id, 'conflict');
          return;
        }
        report(user.id,
          ['synced', 'pushed', 'pulled'].includes(result.status) ? 'up-to-date'
          : result.status === 'offline' ? 'offline' : result.status === 'error' ? 'error' : 'paused');
        if (result.status === 'synced' || result.status === 'pushed' || result.status === 'pulled') {
          // A former identity must never trigger another app-owned file pass.
          const current = await getVerifiedLibraryAccountUser();
          if (current?.id !== user.id || disposed ||
              !isLibrarySyncEnabledForUser(user.id) ||
              !isLibraryAutomaticSyncEnabled(user.id) || conflictPausedFor === user.id) return;
          await reconcileLibraryPersonalFiles(user);
        }
      }
    } catch {
      // SSO and Account sync are optional and must never block local reading.
    } finally {
      running = false;
    }
  };

  const schedule = (delay = 3500) => {
    if (disposed) return;
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      void run();
    }, delay);
  };

  const channels: BroadcastChannel[] = [];
  for (const name of ['thiepn-library', 'thiepn-library-pdf-reader', 'thiepn-library-personal-books']) {
    try {
      const channel = new BroadcastChannel(name);
      channel.addEventListener('message', () => schedule());
      channels.push(channel);
    } catch {
      // Focus, online, visibility and account events still drive reconciliation.
    }
  }

  // Honor the existing per-user Library Account opt-in; no new permission.
  // A closed or hidden browser does not promise background synchronization.
  const periodic = window.setInterval(() => {
    if (navigator.onLine && document.visibilityState === 'visible') schedule(500);
  }, 30_000);
  const onAutoPreference = () => schedule(250);
  window.addEventListener('thiepn:library-auto-sync', onAutoPreference);
  // Never accept a generic 'synced' event as proof of owner conflict resolution.
  const onOwnerConflictResolved = (event: Event) => {
    const ownerId = (event as CustomEvent<{ ownerId?: string }>).detail?.ownerId;
    if (ownerId && ownerId === conflictPausedFor) {
      conflictPausedFor = null;
      schedule(250);
    }
  };
  window.addEventListener('thiepn:library-owner-conflict-resolved', onOwnerConflictResolved);
  const onOnline = () => schedule(250);
  const onFocus = () => schedule(500);
  const onVisibility = () => {
    if (document.visibilityState === 'visible') schedule(500);
    else schedule(100);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith('thiepn.library.') || event.key?.startsWith('thiepn:library-sso:')) {
      schedule(750);
    }
  };

  window.addEventListener('online', onOnline);
  window.addEventListener('focus', onFocus);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  const unsubscribeAuth = subscribeLibraryAccountAuth(() => schedule(250));
  schedule(500);

  return () => {
    disposed = true;
    if (timer !== undefined) window.clearTimeout(timer);
    window.clearInterval(periodic);
    window.removeEventListener('thiepn:library-owner-conflict-resolved', onOwnerConflictResolved);
    window.removeEventListener('thiepn:library-auto-sync', onAutoPreference);
    for (const channel of channels) channel.close();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubscribeAuth();
  };
}

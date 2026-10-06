import {
  getVerifiedLibraryAccountUser,
  subscribeLibraryAccountAuth,
} from './supabase';
import {
  isLibrarySyncEnabledForUser,
  reconcileLibraryAccountSync,
} from './sync';
import { reconcileLibraryPersonalFiles } from './personal-files';

export function mountLibraryAccountRuntime(): () => void {
  let timer: number | undefined;
  let running = false;
  let disposed = false;

  const run = async () => {
    if (disposed || running) return;
    running = true;
    try {
      const user = await getVerifiedLibraryAccountUser();
      if (user && isLibrarySyncEnabledForUser(user.id)) {
        const result = await reconcileLibraryAccountSync(user);
        if (result.status === 'synced' || result.status === 'pushed' || result.status === 'pulled') {
          await reconcileLibraryPersonalFiles(user);
        }
      }
    } catch {
      // Account sync is optional and must never block local reading.
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
      // Focus, online, visibility and auth events still drive reconciliation.
    }
  }

  const onOnline = () => schedule(250);
  const onFocus = () => schedule(500);
  const onVisibility = () => {
    if (document.visibilityState === 'visible') schedule(500);
    else schedule(100);
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key?.startsWith('thiepn.library.')) schedule(750);
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
    for (const channel of channels) channel.close();
    window.removeEventListener('online', onOnline);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisibility);
    unsubscribeAuth();
  };
}

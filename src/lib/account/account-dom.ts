import type { User } from '@supabase/supabase-js';
import {
  completeLibraryAccountOAuthCallback,
  getVerifiedLibraryAccountUser,
  signInLibraryAccountWithGoogle,
  signOutLibraryAccount,
  subscribeLibraryAccountAuth,
} from './supabase';
import {
  chooseCloudForLibrarySync,
  chooseThisDeviceForLibrarySync,
  enableLibraryAccountSync,
  isLibrarySyncEnabledForUser,
  pauseLibrarySync,
  readLibrarySyncMeta,
  reconcileLibraryAccountSync,
  type LibrarySyncResult,
} from './sync';
import {
  isLibraryPersonalFileCloudEnabled,
  reconcileLibraryPersonalFiles,
  type PersonalFileCloudResult,
} from './personal-files';

function text(selector: string, value: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
}

function hidden(selector: string, value: boolean): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.hidden = value;
}

function setBusy(value: boolean): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-account-action]')) {
    button.disabled = value;
  }
}

function displayName(user: User): string {
  const metadata = user.user_metadata as Record<string, unknown> | null;
  const name = metadata && typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
  return name || user.email || 'THIEPN Account';
}

function renderPersonalFileResult(result: PersonalFileCloudResult): void {
  text('[data-personal-files-status]', result.message);
  text(
    '[data-personal-files-summary]',
    result.status === 'disabled'
      ? 'Private file sync is off.'
      : `Uploaded ${result.uploaded} · restored ${result.downloaded} · cloud/local matches ${result.alreadyAvailable}`,
  );
}

async function renderPersonalFiles(user: User, readingSyncEnabled: boolean): Promise<void> {
  const enabled = await isLibraryPersonalFileCloudEnabled(user.id);
  hidden('[data-personal-files-disabled]', enabled);
  hidden('[data-personal-files-enabled]', !enabled);
  text('[data-personal-files-mode]', enabled ? 'Enabled in THIEPN Account' : 'Off');

  const syncButton = document.querySelector<HTMLButtonElement>('[data-personal-files-sync]');
  if (syncButton) syncButton.disabled = !readingSyncEnabled;

  if (!enabled) {
    text('[data-personal-files-status]', 'Personal EPUB/PDF bytes stay on this device unless you separately allow Personal book cloud in THIEPN Account.');
    text('[data-personal-files-summary]', 'Reading-state sync remains independent.');
    return;
  }

  if (!readingSyncEnabled) {
    text('[data-personal-files-status]', 'Personal book cloud is allowed, but this device has Library sync paused. Resume Library sync above to transfer files.');
    text('[data-personal-files-summary]', 'No personal files are transferred while this device is paused.');
    return;
  }

  text('[data-personal-files-status]', 'Private personal-book continuity is enabled. Files up to 50 MB can follow your Library metadata across devices.');
  text('[data-personal-files-summary]', 'Cloud copies are private and content-addressed by SHA-256.');
}

function renderResult(result: LibrarySyncResult): void {
  text('[data-sync-status]', result.message);
  const meta = readLibrarySyncMeta();
  text(
    '[data-sync-meta]',
    meta?.lastSyncedAt
      ? `Last successful sync: ${new Date(meta.lastSyncedAt).toLocaleString()} · Revision ${meta.revision ?? '—'}`
      : 'No successful cloud sync on this device yet.',
  );
  hidden('[data-sync-conflict]', result.status !== 'conflict');
}

async function render(userOverride?: User | null): Promise<User | null> {
  const user = userOverride === undefined ? await getVerifiedLibraryAccountUser() : userOverride;

  hidden('[data-account-signed-out]', Boolean(user));
  hidden('[data-account-signed-in]', !user);
  hidden('[data-sync-panel]', !user);

  if (!user) {
    text('[data-account-summary]', 'Reading stays local unless you sign in and explicitly enable sync.');
    hidden('[data-sync-conflict]', true);
    return null;
  }

  text('[data-account-name]', displayName(user));
  text('[data-account-email]', user.email ?? 'Verified THIEPN Account');
  text('[data-account-summary]', 'Signed in with the shared THIEPN Account identity.');

  const enabled = isLibrarySyncEnabledForUser(user.id);
  hidden('[data-sync-enable]', enabled);
  hidden('[data-sync-enabled-actions]', !enabled);
  text('[data-sync-mode]', enabled ? 'Sync enabled on this device' : 'Local-only on this device');

  if (enabled) {
    renderResult(await reconcileLibraryAccountSync(user));
  } else {
    text('[data-sync-status]', 'Your local reading data will not be uploaded until you choose “Sync this device”.');
    const meta = readLibrarySyncMeta();
    text(
      '[data-sync-meta]',
      meta?.userId === user.id && meta.lastSyncedAt
        ? `Previous sync: ${new Date(meta.lastSyncedAt).toLocaleString()}`
        : 'No cloud sync enabled.',
    );
    hidden('[data-sync-conflict]', true);
  }

  await renderPersonalFiles(user, enabled);
  return user;
}

export function mountLibraryAccountPage(): () => void {
  let user: User | null = null;
  let disposed = false;

  const refresh = async () => {
    if (disposed) return;
    setBusy(true);
    try {
      user = await render();
    } catch (error) {
      text('[data-account-summary]', error instanceof Error ? error.message : 'Unable to verify THIEPN Account.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (operation: (current: User) => Promise<LibrarySyncResult>) => {
    if (!user) return;
    setBusy(true);
    try {
      const result = await operation(user);
      renderResult(result);
      await render(user);
    } finally {
      setBusy(false);
    }
  };

  document.querySelector('[data-sign-in]')?.addEventListener('click', () => {
    setBusy(true);
    void signInLibraryAccountWithGoogle().catch((error) => {
      setBusy(false);
      text('[data-account-summary]', error instanceof Error ? error.message : 'Sign-in failed.');
    });
  });

  document.querySelector('[data-sign-out]')?.addEventListener('click', () => {
    setBusy(true);
    void signOutLibraryAccount()
      .then(() => {
        user = null;
        return render(null);
      })
      .finally(() => setBusy(false));
  });

  document.querySelector('[data-sync-enable]')?.addEventListener('click', () => void act(enableLibraryAccountSync));
  document.querySelector('[data-sync-now]')?.addEventListener('click', () => void act(reconcileLibraryAccountSync));
  document.querySelector('[data-sync-pause]')?.addEventListener('click', () => {
    if (!user) return;
    pauseLibrarySync(user.id);
    void render(user);
  });
  document.querySelector('[data-use-device]')?.addEventListener('click', () => void act(chooseThisDeviceForLibrarySync));
  document.querySelector('[data-use-cloud]')?.addEventListener('click', () => void act(chooseCloudForLibrarySync));
  document.querySelector('[data-personal-files-sync]')?.addEventListener('click', () => {
    if (!user) return;
    setBusy(true);
    void reconcileLibraryPersonalFiles(user)
      .then(renderPersonalFileResult)
      .finally(() => setBusy(false));
  });

  const onSync = (event: Event) => {
    const detail = (event as CustomEvent<LibrarySyncResult>).detail;
    if (detail) renderResult(detail);
  };
  const onPersonalFiles = (event: Event) => {
    const detail = (event as CustomEvent<PersonalFileCloudResult>).detail;
    if (detail) renderPersonalFileResult(detail);
  };
  window.addEventListener('thiepn:library-sync', onSync);
  window.addEventListener('thiepn:library-personal-files', onPersonalFiles);

  const unsubscribeAuth = subscribeLibraryAccountAuth(() => { void refresh(); });

  void completeLibraryAccountOAuthCallback()
    .catch((error) => {
      text('[data-account-summary]', error instanceof Error ? error.message : 'Unable to complete sign-in.');
    })
    .finally(() => { void refresh(); });

  return () => {
    disposed = true;
    window.removeEventListener('thiepn:library-sync', onSync);
    window.removeEventListener('thiepn:library-personal-files', onPersonalFiles);
    unsubscribeAuth();
  };
}

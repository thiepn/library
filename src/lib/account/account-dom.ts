import {
  beginLibraryAccountSso,
  initializeLibraryAccountSso,
  getVerifiedLibraryAccountUser,
  hasThiepnAccountConfiguration,
  subscribeLibraryAccountAuth,
  type LibraryAccountUser,
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

function displayName(user: LibraryAccountUser): string {
  return user.email || 'THIEPN Account';
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

async function renderPersonalFiles(user: LibraryAccountUser, readingSyncEnabled: boolean, isCurrent: () => boolean): Promise<void> {
  let enabled: boolean;
  try {
    enabled = await isLibraryPersonalFileCloudEnabled(user.id);
  } catch {
    if (!isCurrent()) return;
    // File permission outages are not evidence that the user signed out.
    // Keep verified Account and reading-state sync visible and leave the
    // sensitive personal-file actions unavailable until permission is known.
    hidden('[data-personal-files-disabled]', true);
    hidden('[data-personal-files-enabled]', true);
    text('[data-personal-files-mode]', 'Unavailable');
    text('[data-personal-files-status]', 'Unable to verify Personal book cloud permission. Your local books are unaffected.');
    text('[data-personal-files-summary]', 'Retry when Account is reachable.');
    return;
  }
  if (!isCurrent()) return;
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

async function render(isCurrent: () => boolean): Promise<LibraryAccountUser | null> {
  // Never reuse an earlier user identity after asynchronous Account operations.
  const user = await getVerifiedLibraryAccountUser();
  if (!isCurrent()) return null;

  hidden('[data-account-signed-out]', Boolean(user));
  hidden('[data-account-signed-in]', !user);
  hidden('[data-sync-panel]', !user);

  if (!user) {
    text('[data-account-summary]', 'Library stays guest-first. If THIEPN Account is already signed in, Library connects automatically; reading-state sync remains a separate choice.');
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
    const result = await reconcileLibraryAccountSync(user);
    if (!isCurrent()) return null;
    renderResult(result);
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

  await renderPersonalFiles(user, enabled, isCurrent);
  return isCurrent() ? user : null;
}

export function mountLibraryAccountPage(): () => void {
  let user: LibraryAccountUser | null = null;
  let disposed = false;
  let renderEpoch = 0;

  const refresh = async () => {
    if (disposed) return;
    const epoch = ++renderEpoch;
    const isCurrent = () => !disposed && epoch === renderEpoch;
    setBusy(true);
    try {
      // Resolve the shared Account SSO state before showing personalized data.
      // Redirects are deduplicated with the global Library Account runtime.
      if (hasThiepnAccountConfiguration()) {
        const initial = await initializeLibraryAccountSso();
        if (!isCurrent() || initial.status === 'redirecting') return;
      }
      const nextUser = await render(isCurrent);
      if (isCurrent()) user = nextUser;
    } catch (error) {
      if (!isCurrent()) return;
      // Identity verification can be unavailable behind tracking blockers or
      // during an outage. Never display stale private state, but retain the
      // explicit top-level Account sign-in recovery path.
      user = null;
      hidden('[data-account-signed-out]', false);
      hidden('[data-account-signed-in]', true);
      hidden('[data-sync-panel]', true);
      text('[data-account-summary]', error instanceof Error ? error.message : 'Unable to verify THIEPN Account.');
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };

  const act = async (operation: (current: LibraryAccountUser) => Promise<LibrarySyncResult>) => {
    if (!user || disposed) return;
    const current = user;
    const epoch = renderEpoch;
    setBusy(true);
    try {
      const result = await operation(current);
      if (disposed || epoch !== renderEpoch || user?.id !== current.id) return;
      renderResult(result);
      // Reverify the real Account session, never render a captured identity.
      await refresh();
    } finally {
      if (!disposed && epoch === renderEpoch) setBusy(false);
    }
  };

  document.querySelector('[data-sign-in]')?.addEventListener('click', () => {
    setBusy(true);
    void beginLibraryAccountSso(window.location.href).catch((error) => {
      setBusy(false);
      text('[data-account-summary]', error instanceof Error ? error.message : 'THIEPN Account connection failed.');
    });
  });

  document.querySelector('[data-sync-enable]')?.addEventListener('click', () => void act(enableLibraryAccountSync));
  document.querySelector('[data-sync-now]')?.addEventListener('click', () => void act(reconcileLibraryAccountSync));
  document.querySelector('[data-sync-pause]')?.addEventListener('click', () => {
    if (!user) return;
    pauseLibrarySync(user.id);
    void refresh();
  });
  document.querySelector('[data-use-device]')?.addEventListener('click', () => void act(chooseThisDeviceForLibrarySync));
  document.querySelector('[data-use-cloud]')?.addEventListener('click', () => void act(chooseCloudForLibrarySync));
  document.querySelector('[data-personal-files-sync]')?.addEventListener('click', () => {
    if (!user || disposed) return;
    const current = user;
    const epoch = renderEpoch;
    setBusy(true);
    void reconcileLibraryPersonalFiles(current)
      .then((result) => {
        if (!disposed && epoch === renderEpoch && user?.id === current.id) renderPersonalFileResult(result);
      })
      .catch(() => {
        if (!disposed && epoch === renderEpoch) text('[data-personal-files-status]', 'Personal book sync could not be completed.');
      })
      .finally(() => { if (!disposed && epoch === renderEpoch) setBusy(false); });
  });

  const onSync = (event: Event) => {
    const detail = (event as CustomEvent<LibrarySyncResult>).detail;
    if (!disposed && user && isLibrarySyncEnabledForUser(user.id) && detail) renderResult(detail);
  };
  const onPersonalFiles = (event: Event) => {
    const detail = (event as CustomEvent<PersonalFileCloudResult>).detail;
    if (!disposed && user && isLibrarySyncEnabledForUser(user.id) && detail) renderPersonalFileResult(detail);
  };
  window.addEventListener('thiepn:library-sync', onSync);
  window.addEventListener('thiepn:library-personal-files', onPersonalFiles);

  const unsubscribeAuth = subscribeLibraryAccountAuth(() => { void refresh(); });
  void refresh();

  return () => {
    disposed = true;
    ++renderEpoch;
    window.removeEventListener('thiepn:library-sync', onSync);
    window.removeEventListener('thiepn:library-personal-files', onPersonalFiles);
    unsubscribeAuth();
  };
}

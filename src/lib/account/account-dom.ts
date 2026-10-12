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
import { isLibraryAutomaticSyncEnabled, setLibraryAutomaticSync } from './auto-sync';
import { getLibraryCoreGrant, changeLibraryCoreGrant, requestLibrarySyncFromCore } from './core-coordination';
import { inspectLibraryRecovery } from './recovery-inspection';
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

async function renderPersonalFiles(user: LibraryAccountUser, readingSyncEnabled: boolean): Promise<void> {
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

async function render(userOverride?: LibraryAccountUser | null): Promise<LibraryAccountUser | null> {
  const user = userOverride === undefined ? await getVerifiedLibraryAccountUser() : userOverride;

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
  hidden('[data-auto-sync-section]', !enabled);
  hidden('[data-core-coordinate-section]', !enabled);
  const coreGrant = enabled ? getLibraryCoreGrant(user.id) : null;
  const coreToggle = document.querySelector<HTMLInputElement>('[data-core-coordinate-toggle]');
  if (coreToggle) coreToggle.checked = Boolean(coreGrant?.allowed);
  const coreRequest = document.querySelector<HTMLButtonElement>('[data-core-coordinate-request]');
  if (coreRequest) coreRequest.disabled = !enabled || !coreGrant?.allowed;
  text('[data-core-coordinate-status]', !enabled
    ? 'Enable native Library sync before allowing requests.'
    : coreGrant?.allowed ? 'Core requests permitted on this device (local grant revision '
        + coreGrant.revision + '). Library decides the actual sync results.'
      : 'Core coordination is off. Native manual Library sync is unaffected.');
  text('[data-core-coordinate-guidance]', enabled
    ? 'If results conflict, select Device or Cloud below before retrying. For offline recovery, use the native Library backup page.'
    : 'Local Library records remain available. You can export and restore from the native backup page.');
  const preference = document.querySelector<HTMLInputElement>('[data-auto-sync-checkbox]');
  if (preference) preference.checked = enabled && isLibraryAutomaticSyncEnabled(user.id);
  text('[data-auto-sync-status]', enabled
    ? isLibraryAutomaticSyncEnabled(user.id)
      ? 'Automatic checks enabled in this browser while Library is open.'
      : 'Automatic checks paused. You can still sync manually.'
    : 'Enable Library sync before setting automatic checks.');
  text('[data-sync-mode]', enabled ? 'Sync enabled on this device' : 'Local-only on this device');
  text('[data-ecosystem-library-state]', enabled
    ? isLibraryAutomaticSyncEnabled(user.id)
      ? 'Reading-state sync enabled · automatic checks on'
      : 'Reading-state sync enabled · manual checks only'
    : 'Local-only · no Library cloud updates');
  text('[data-ecosystem-library-detail]', enabled
    ? 'The Library Account is authoritative. Use the native conflict chooser if copies diverge.'
    : 'Connect this device in Library before cloud changes can be read or written.');

  if (enabled) {
    // Reading this settings panel must not cause cloud writes or launch a
    // second reconciliation. The native runtime and explicit buttons own it.
    const meta = readLibrarySyncMeta();
    text('[data-sync-meta]', meta?.userId === user.id && meta.lastSyncedAt
      ? 'Last confirmed native Library sync: ' + new Date(meta.lastSyncedAt).toLocaleString()
      : 'No confirmed Library sync yet on this device.');
    text('[data-sync-status]', 'Account connected. Use Sync now to check for changes; native Library decides the result.');
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
  let user: LibraryAccountUser | null = null;
  let disposed = false;
  let lastNativeStatus: LibrarySyncResult['status'] | null = null;

  const refresh = async () => {
    if (disposed) return;
    setBusy(true);
    try {
      // Resolve the shared Account SSO state before showing personalized data.
      // Redirects are deduplicated with the global Library Account runtime.
      if (hasThiepnAccountConfiguration()) {
        const initial = await initializeLibraryAccountSso();
        if (disposed || initial.status === 'redirecting') return;
      }
      user = await render();
    } catch (error) {
      // Identity verification can be unavailable behind tracking blockers or
      // during an outage. Never display stale private state, but retain the
      // explicit top-level Account sign-in recovery path.
      user = null;
      hidden('[data-account-signed-out]', false);
      hidden('[data-account-signed-in]', true);
      hidden('[data-sync-panel]', true);
      text('[data-account-summary]', error instanceof Error ? error.message : 'Unable to verify THIEPN Account.');
    } finally {
      setBusy(false);
    }
  };

  const act = async (operation: (current: LibraryAccountUser) => Promise<LibrarySyncResult>,
    conflictResolution = false) => {
    if (!user) return;
    const startedAs = user.id;
    const original = user;
    setBusy(true);
    try {
      const result = await operation(original);
      const current = await getVerifiedLibraryAccountUser();
      if (disposed || current?.id !== startedAs || user?.id !== startedAs) {
        // Account identity changed while native CAS was running. Never paint
        // the previous owner's result or release its conflict hold.
        user = current;
        if (!disposed) await render(current);
        return;
      }
      lastNativeStatus = result.status;
      renderResult(result);
      if (conflictResolution && ['pushed', 'pulled', 'synced'].includes(result.status)) {
        window.dispatchEvent(new CustomEvent('thiepn:library-conflict-resolved', {
          detail: { ownerId: startedAs },
        }));
      }
      await render(current);
    } catch {
      const current = await getVerifiedLibraryAccountUser().catch(() => null);
      if (!disposed && current?.id === startedAs && user?.id === startedAs) {
        text('[data-sync-status]', 'Native Library check failed. Local reading remains available; retry or export a manual backup.');
      } else {
        user = current;
        if (!disposed) await render(current);
      }
    } finally {
      setBusy(false);
    }
  };

  document.querySelector('[data-sign-in]')?.addEventListener('click', () => {
    setBusy(true);
    void beginLibraryAccountSso(window.location.href).catch((error) => {
      setBusy(false);
      text('[data-account-summary]', error instanceof Error ? error.message : 'THIEPN Account connection failed.');
    });
  });

  document.querySelector('[data-recovery-inspect]')?.addEventListener('click', () => {
    void (async () => {
      const current = await getVerifiedLibraryAccountUser();
      if (disposed || !current || user?.id !== current.id) {
        text('[data-recovery-inspection]', 'Account identity changed. Sign in again before inspecting recovery state.');
        return;
      }
      const meta = readLibrarySyncMeta();
      const result = inspectLibraryRecovery({
        ownerId: current.id,
        baselineOwner: meta?.userId ?? null,
        nativeEnabled: isLibrarySyncEnabledForUser(current.id),
        coreAllowed: Boolean(getLibraryCoreGrant(current.id)?.allowed),
        lastSyncedAt: meta?.userId === current.id ? meta.lastSyncedAt ?? null : null,
        latest: lastNativeStatus,
        online: navigator.onLine,
      });
      text('[data-recovery-inspection]',
        'Library ' + result.status.replaceAll('-', ' ') + ': ' + result.action +
        ' External custody has not been certified.');
      hidden('[data-recovery-conflict-actions]', result.status !== 'conflict');
    })().catch(() =>
      text('[data-recovery-inspection]', 'Unable to verify the Account. Native backup remains available without Core.'));
  });
  document.querySelector('[data-recovery-revoke]')?.addEventListener('click', () => {
    if (!user) return;
    const owner = user.id;
    const revoked = changeLibraryCoreGrant(owner, false);
    text('[data-recovery-inspection]', revoked
      ? 'Core device grant revoked. Native Library sync, backup, and conflict chooser remain available.'
      : 'Unable to persist Core revocation. Check browser storage permissions.');
    void render(user);
  });
  document.querySelector('[data-sync-enable]')?.addEventListener('click', () => void act(enableLibraryAccountSync));
  document.querySelector('[data-sync-now]')?.addEventListener('click', () => void act(reconcileLibraryAccountSync));
  document.querySelector<HTMLInputElement>('[data-auto-sync-checkbox]')?.addEventListener('change', (event) => {
    if (!user || !isLibrarySyncEnabledForUser(user.id)) return;
    const target = event.currentTarget as HTMLInputElement;
    if (!setLibraryAutomaticSync(user.id, target.checked)) {
      target.checked = !target.checked;
      text('[data-auto-sync-status]', 'Unable to save your device preference. Automatic checks remain off.');
      return;
    }
    text('[data-auto-sync-status]', target.checked
      ? 'Automatic checks enabled while this tab is visible and online.'
      : 'Automatic checks paused. Manual sync remains available.');
  });
  document.querySelector<HTMLInputElement>('[data-core-coordinate-toggle]')?.addEventListener('change', (event) => {
    const target = event.currentTarget as HTMLInputElement;
    if (!user || !changeLibraryCoreGrant(user.id, target.checked)) {
      target.checked = Boolean(user && getLibraryCoreGrant(user.id)?.allowed);
      text('[data-core-coordinate-status]', 'Unable to update consent; no new Core request is authorized.');
      return;
    }
    text('[data-core-coordinate-status]', target.checked
      ? 'Requests allowed on this device. Native Library permissions remain authoritative.'
      : 'Core coordination revoked on this device; native Library sync remains available.');
    const request = document.querySelector<HTMLButtonElement>('[data-core-coordinate-request]');
    if (request) request.disabled = !target.checked;
  });
  document.querySelector('[data-core-coordinate-request]')?.addEventListener('click', () => {
    if (!user) return;
    const ownerId = user.id;
    const grant = getLibraryCoreGrant(ownerId);
    setBusy(true);
    text('[data-core-coordinate-status]', 'Asking Library to reconcile through the native Account engine…');
    void requestLibrarySyncFromCore(ownerId, grant).then((result) => {
      if (user?.id !== ownerId) return;
      if (result.status === 'native') {
        renderResult(result.result);
        text('[data-core-coordinate-status]', 'Native Library result: ' + result.result.message);
      } else text('[data-core-coordinate-status]', result.message);
    }).catch(() => {
      if (user?.id === ownerId) text('[data-core-coordinate-status]', 'Native Library request failed. Retry manually or inspect Account status.');
    }).finally(() => { setBusy(false); });
  });
  document.querySelector('[data-sync-pause]')?.addEventListener('click', () => {
    if (!user) return;
    // Pausing native Library sync also rotates/revokes its optional Core grant.
    // The owner must explicitly opt back into coordination after resuming.
    changeLibraryCoreGrant(user.id, false);
    pauseLibrarySync(user.id);
    void render(user);
  });
  document.querySelector('[data-use-device]')?.addEventListener('click', () => void act(chooseThisDeviceForLibrarySync, true));
  document.querySelector('[data-use-cloud]')?.addEventListener('click', () => void act(chooseCloudForLibrarySync, true));
  document.querySelector('[data-ecosystem-retry]')?.addEventListener('click', () => void act(reconcileLibraryAccountSync));
  document.querySelector('[data-personal-files-sync]')?.addEventListener('click', () => {
    if (!user) return;
    setBusy(true);
    void reconcileLibraryPersonalFiles(user)
      .then(renderPersonalFileResult)
      .finally(() => setBusy(false));
  });

  const onSync = (event: Event) => {
    const detail = (event as CustomEvent<LibrarySyncResult>).detail;
    // Native sync events carry no identity; never let an old account's event
    // overwrite a new owner's status or unlock source-of-truth controls.
    if (!user || readLibrarySyncMeta()?.userId !== user.id) return;
    if (detail) {
      lastNativeStatus = detail.status;
      renderResult(detail);
      if (detail.status === 'conflict' || detail.status === 'offline' || detail.status === 'error')
        text('[data-sync-mode]', detail.status === 'conflict' ? 'Attention required: changes conflict' : detail.status === 'offline' ? 'Waiting for connection' : 'Sync needs attention');
      // Avoid displaying a stale success indicator when the event signals an error.
    }
  };
  const onRuntime = (event: Event) => {
    const detail = (event as CustomEvent<{ ownerId?: string; status: string; failures?: number }>).detail;
    if (!detail || !user || detail.ownerId !== user.id) return;
    const status = detail.status === 'checking' ? 'Checking for changes…'
      : detail.status === 'conflict' ? 'Conflict detected. Automatic checks are paused until you choose a source.'
      : detail.status === 'error' ? 'Automatic check failed; local reading remains available.'
      : 'Latest automatic check: ' + detail.status;
    text('[data-auto-sync-runtime]', status);
    text('[data-ecosystem-library-detail]', status);
    text('[data-ecosystem-library-state]', detail.status === 'conflict'
      ? 'Conflict · choose a source of truth in Library'
      : detail.status === 'error' ? 'Needs attention · retry in Library'
      : detail.status === 'checking' ? 'Checking Library…'
      : detail.status === 'offline' ? 'Offline · local data remains accessible'
      : 'Library reported: ' + detail.status);
  };
  window.addEventListener('thiepn:library-runtime', onRuntime);
  const onPersonalFiles = (event: Event) => {
    const detail = (event as CustomEvent<PersonalFileCloudResult>).detail;
    if (detail) renderPersonalFileResult(detail);
  };
  window.addEventListener('thiepn:library-sync', onSync);
  window.addEventListener('thiepn:library-personal-files', onPersonalFiles);

  const unsubscribeAuth = subscribeLibraryAccountAuth(() => { void refresh(); });
  void refresh();

  return () => {
    disposed = true;
    window.removeEventListener('thiepn:library-sync', onSync);
    window.removeEventListener('thiepn:library-runtime', onRuntime);
    window.removeEventListener('thiepn:library-personal-files', onPersonalFiles);
    unsubscribeAuth();
  };
}

export type LibraryPwaUpdateState = 'unsupported' | 'idle' | 'installing' | 'ready' | 'update-ready' | 'error';

export interface LibraryPwaState {
  supported: boolean;
  controlled: boolean;
  online: boolean;
  updateState: LibraryPwaUpdateState;
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '');
let registrationPromise: Promise<ServiceWorkerRegistration | undefined> | undefined;
const stateListeners = new Set<(state: LibraryPwaState) => void>();
let lifecycleListenersAttached = false;

function root(): HTMLElement {
  return document.documentElement;
}

function emitState(): void {
  const state = getLibraryPwaState();
  for (const listener of stateListeners) listener(state);
}

function setOnlineState(): void {
  root().dataset.libraryConnectivity = navigator.onLine ? 'online' : 'offline';
  emitState();
}

function setWorkerState(state: LibraryPwaUpdateState): void {
  root().dataset.libraryPwa = state;
  root().dataset.libraryPwaControlled = navigator.serviceWorker?.controller ? 'true' : 'false';
  emitState();
}

function localDocumentUrls(): string[] {
  const urls = new Set<string>([location.href]);
  const selectors = [
    'link[rel="stylesheet"][href]',
    'link[rel="modulepreload"][href]',
    'script[src]',
    'link[rel="icon"][href]',
  ];

  for (const element of document.querySelectorAll<HTMLLinkElement | HTMLScriptElement>(selectors.join(','))) {
    const raw = element instanceof HTMLLinkElement ? element.href : element.src;
    if (!raw) continue;
    try {
      const url = new URL(raw, location.href);
      if (url.origin === location.origin && url.pathname.startsWith(`${base}/`)) urls.add(url.href);
    } catch {}
  }

  return [...urls];
}

function sendDocumentWarmup(worker: ServiceWorker): void {
  worker.postMessage({ type: 'CACHE_DOCUMENT_URLS', urls: localDocumentUrls() });
}

function watchRegistration(registration: ServiceWorkerRegistration): void {
  if (registration.waiting && navigator.serviceWorker.controller) setWorkerState('update-ready');

  registration.addEventListener('updatefound', () => {
    const installing = registration.installing;
    if (!installing) return;
    setWorkerState('installing');
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') {
        setWorkerState(navigator.serviceWorker.controller ? 'update-ready' : 'ready');
      } else if (installing.state === 'activated') {
        setWorkerState('ready');
      } else if (installing.state === 'redundant') {
        setWorkerState('error');
      }
    });
  });
}

function attachLifecycleListeners(): void {
  if (lifecycleListenersAttached || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  lifecycleListenersAttached = true;
  window.addEventListener('online', setOnlineState);
  window.addEventListener('offline', setOnlineState);
  navigator.serviceWorker.addEventListener('controllerchange', () => setWorkerState('ready'));
}

export function getLibraryPwaState(): LibraryPwaState {
  const supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const state = typeof document !== 'undefined' ? document.documentElement.dataset.libraryPwa : undefined;
  return {
    supported,
    controlled: supported && Boolean(navigator.serviceWorker.controller),
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    updateState: supported && state ? state as LibraryPwaUpdateState : supported ? 'idle' : 'unsupported',
  };
}

export function subscribeLibraryPwaState(listener: (state: LibraryPwaState) => void): () => void {
  stateListeners.add(listener);
  listener(getLibraryPwaState());
  return () => stateListeners.delete(listener);
}

export function registerLibraryPwa(): Promise<ServiceWorkerRegistration | undefined> {
  if (registrationPromise) return registrationPromise;

  registrationPromise = (async () => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
      if (typeof document !== 'undefined') setWorkerState('unsupported');
      return undefined;
    }

    const hadController = Boolean(navigator.serviceWorker.controller);
    setOnlineState();
    setWorkerState('idle');
    attachLifecycleListeners();

    try {
      const registration = await navigator.serviceWorker.register(`${base}/service-worker.js`, {
        scope: `${base}/`,
        updateViaCache: 'none',
      });
      watchRegistration(registration);
      if (registration.waiting && navigator.serviceWorker.controller) setWorkerState('update-ready');
      else setWorkerState('ready');

      if (!hadController) {
        void navigator.serviceWorker.ready.then((readyRegistration) => {
          if (readyRegistration.active) sendDocumentWarmup(readyRegistration.active);
        }).catch(() => undefined);
      }

      return registration;
    } catch {
      setWorkerState('error');
      return undefined;
    }
  })();

  return registrationPromise;
}

/**
 * RR5 keeps active reading sessions stable: waiting workers never activate by
 * themselves. Catalog/My Library UI may call this only after an explicit user action.
 */
export async function activateWaitingLibraryWorker(): Promise<boolean> {
  const registration = await registerLibraryPwa();
  if (!registration?.waiting) return false;
  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

/**
 * P28 compatibility alias. RR5 intentionally disables automatic publication caching;
 * hosted EPUB/PDF files enter offline storage only through the explicit download UI.
 */
export async function cacheReaderPublicationForOffline(_epubUrl: string): Promise<boolean> {
  return false;
}

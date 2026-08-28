import { registerLibraryPwa } from './pwa';
import { getLibraryStorageEstimate, type LibraryStorageEstimate } from './storage-reliability';

export type OfflinePublicationFormat = 'epub' | 'pdf';

export interface OfflinePublicationArtifact {
  workId: string;
  title: string;
  version: string;
  format: OfflinePublicationFormat;
  url: string;
  readerUrl: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
}

export interface OfflinePublicationRecord {
  url: string;
  format: OfflinePublicationFormat;
  sizeBytes: number;
  sha256?: string;
  cachedAt?: string;
  legacy?: boolean;
}

export interface OfflineDownloadProgress {
  operationId: string;
  url: string;
  loadedBytes: number;
  totalBytes?: number;
  phase: 'preparing' | 'downloading' | 'finalizing';
}

export interface OfflineDownloadResult {
  ok: boolean;
  record?: OfflinePublicationRecord;
  error?: string;
  cancelled?: boolean;
}

interface WorkerReply {
  type?: string;
  ok?: boolean;
  record?: OfflinePublicationRecord;
  records?: OfflinePublicationRecord[];
  error?: string;
  cancelled?: boolean;
  operationId?: string;
  url?: string;
  loadedBytes?: number;
  totalBytes?: number;
  phase?: OfflineDownloadProgress['phase'];
}

const listeners = new Set<() => void>();
let serviceWorkerListenerAttached = false;

function operationId(): string {
  try { return crypto.randomUUID(); }
  catch { return `rr5-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}

async function waitForActiveWorker(registration: ServiceWorkerRegistration | undefined, timeoutMs = 8_000): Promise<ServiceWorker | undefined> {
  const immediate = registration?.active ?? navigator.serviceWorker?.controller ?? undefined;
  if (immediate) return immediate;
  if (!registration || !('serviceWorker' in navigator)) return undefined;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (worker?: ServiceWorker) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      registration.installing?.removeEventListener('statechange', check);
      navigator.serviceWorker.removeEventListener('controllerchange', check);
      resolve(worker);
    };
    const check = () => {
      const worker = registration.active ?? navigator.serviceWorker.controller ?? undefined;
      if (worker) finish(worker);
      else if (registration.installing?.state === 'redundant') finish(undefined);
    };
    const timer = window.setTimeout(() => finish(undefined), timeoutMs);
    registration.installing?.addEventListener('statechange', check);
    navigator.serviceWorker.addEventListener('controllerchange', check);
    check();
  });
}

async function activeWorker(): Promise<ServiceWorker | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return undefined;
  const registration = await registerLibraryPwa();
  return waitForActiveWorker(registration);
}

function attachServiceWorkerListener(): void {
  if (serviceWorkerListenerAttached || typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  serviceWorkerListenerAttached = true;
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as WorkerReply | undefined;
    if (!data || data.type !== 'OFFLINE_LIBRARY_CHANGED') return;
    for (const listener of listeners) listener();
  });
}

async function requestWorker(type: string, payload: Record<string, unknown> = {}): Promise<WorkerReply> {
  const worker = await activeWorker();
  if (!worker) return { ok: false, error: 'Offline downloads are unavailable until the Library service worker is active.' };

  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = window.setTimeout(() => {
      channel.port1.close();
      resolve({ ok: false, error: 'The offline storage operation did not respond.' });
    }, 30_000);
    channel.port1.onmessage = (event) => {
      const data = event.data as WorkerReply;
      if (data?.type === 'OFFLINE_PROGRESS') return;
      window.clearTimeout(timer);
      channel.port1.close();
      resolve(data ?? { ok: false, error: 'The offline storage operation returned no result.' });
    };
    worker.postMessage({ type, ...payload }, [channel.port2]);
  });
}

export async function listOfflinePublications(): Promise<OfflinePublicationRecord[]> {
  const reply = await requestWorker('LIST_OFFLINE_PUBLICATIONS');
  if (!reply.ok) throw new Error(reply.error ?? 'Unable to inspect offline downloads.');
  return Array.isArray(reply.records) ? reply.records : [];
}

export async function removeOfflinePublication(url: string): Promise<boolean> {
  const reply = await requestWorker('REMOVE_OFFLINE_PUBLICATION', { url });
  if (!reply.ok) throw new Error(reply.error ?? 'Unable to remove the offline download.');
  return true;
}

export async function preparePersonalReadersForOffline(urls: string[]): Promise<boolean> {
  const normalized = [...new Set(urls.filter((url) => typeof url === 'string' && url.trim()))];
  if (!normalized.length) return true;
  const reply = await requestWorker('PREPARE_PERSONAL_READERS', { urls: normalized });
  if (!reply.ok) throw new Error(reply.error ?? 'Unable to prepare personal readers for offline use.');
  return true;
}

export function startOfflinePublicationDownload(
  artifact: OfflinePublicationArtifact,
  onProgress?: (progress: OfflineDownloadProgress) => void,
): { operationId: string; promise: Promise<OfflineDownloadResult>; cancel: () => void } {
  const id = operationId();
  let worker: ServiceWorker | undefined;
  let cancelled = false;

  const promise = (async (): Promise<OfflineDownloadResult> => {
    worker = await activeWorker();
    if (!worker) return { ok: false, error: 'Offline downloads are unavailable until the Library service worker is active.' };
    if (cancelled) return { ok: false, cancelled: true };

    return new Promise((resolve) => {
      const channel = new MessageChannel();
      const timer = window.setTimeout(() => {
        channel.port1.close();
        resolve({ ok: false, error: 'The offline download did not respond.' });
      }, 120_000);

      channel.port1.onmessage = (event) => {
        const data = event.data as WorkerReply;
        if (data?.type === 'OFFLINE_PROGRESS' && data.operationId === id && data.url === artifact.url) {
          onProgress?.({
            operationId: id,
            url: artifact.url,
            loadedBytes: Number(data.loadedBytes ?? 0),
            ...(typeof data.totalBytes === 'number' ? { totalBytes: data.totalBytes } : {}),
            phase: data.phase ?? 'downloading',
          });
          return;
        }
        window.clearTimeout(timer);
        channel.port1.close();
        resolve({
          ok: Boolean(data?.ok),
          ...(data?.record ? { record: data.record } : {}),
          ...(data?.error ? { error: data.error } : {}),
          ...(data?.cancelled ? { cancelled: true } : {}),
        });
      };

      worker!.postMessage({ type: 'CACHE_OFFLINE_PUBLICATION', operationId: id, artifact }, [channel.port2]);
    });
  })();

  return {
    operationId: id,
    promise,
    cancel: () => {
      cancelled = true;
      if (worker) worker.postMessage({ type: 'CANCEL_OFFLINE_DOWNLOAD', operationId: id });
      else void activeWorker().then((next) => next?.postMessage({ type: 'CANCEL_OFFLINE_DOWNLOAD', operationId: id }));
    },
  };
}

export async function getOfflineStorageEstimate(): Promise<LibraryStorageEstimate> {
  return getLibraryStorageEstimate();
}

export function subscribeOfflineLibrary(listener: () => void): () => void {
  attachServiceWorkerListener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

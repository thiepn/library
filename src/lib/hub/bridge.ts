import { readLibraryHubAccountSnapshot } from './account';
import {
  CONSENT_KEY,
  OPERATIONS,
  exact,
  legacyConsent,
  object,
  project,
  readConsent,
  uuid,
  type Book,
  type Operation,
} from './contract';
import { availableBooks, readRows } from './storage';

export function installBridge(catalogue: Book[]) {
  if (parent === window) return;

  let channel: string | null = null;
  let hubAccountId: string | null = null;
  let accountAwareConnection = false;
  let reconcilingAccount = false;
  const used = new Set<string>();
  const send = (value: unknown) => parent.postMessage(value, location.origin);
  const invalidate = () => {
    if (reconcilingAccount) return;
    if (channel) send({ protocol: 'thiepn-library-hub-v1', channel, kind: 'invalidate' });
    channel = null;
    hubAccountId = null;
    accountAwareConnection = false;
    used.clear();
  };

  window.addEventListener('storage', event => {
    if (event.key === CONSENT_KEY || event.key === null) invalidate();
  });

  for (const name of ['thiepn-library', 'thiepn-library-pdf-reader', 'thiepn-library-personal-books']) {
    try {
      const broadcast = new BroadcastChannel(name);
      broadcast.onmessage = invalidate;
      window.addEventListener('pagehide', () => broadcast.close(), { once: true });
    } catch {}
  }

  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || !object(event.data)) return;
    // Same-origin deployment is one script trust boundary. This is contractual
    // consent enforcement, not isolation against malicious same-origin JavaScript.
    let parentPath: string;
    try { parentPath = parent.location.pathname; } catch { return; }
    if (parentPath !== '/home/' && parentPath !== '/home') return;

    const request = event.data;
    if (request.protocol !== 'thiepn-library-hub-v1' || !uuid(request.channel) || !uuid(request.requestId)) return;

    const legacyConnect = request.kind === 'connect'
      && exact(request, ['protocol', 'channel', 'requestId', 'kind']);
    const accountConnect = request.kind === 'connect'
      && exact(request, ['protocol', 'channel', 'requestId', 'kind', 'accountId'])
      && (request.accountId === null || uuid(request.accountId));

    if (legacyConnect || accountConnect) {
      channel = request.channel;
      hubAccountId = accountConnect && typeof request.accountId === 'string' ? request.accountId : null;
      accountAwareConnection = accountConnect;
      used.clear();
      used.add(request.requestId);
      const consent = readConsent();
      send({
        protocol: request.protocol,
        channel,
        requestId: request.requestId,
        kind: 'connected',
        consent: consent && legacyConnect ? legacyConsent(consent) : consent,
      });
      return;
    }

    if (request.kind !== 'read'
      || !exact(request, ['protocol', 'channel', 'requestId', 'kind', 'operation', 'context', 'query'])
      || channel !== request.channel
      || used.has(request.requestId)
      || used.size >= 64
      || !OPERATIONS.includes(request.operation as Operation)
      || typeof request.query !== 'string'
      || request.query.length > 256
      || /[\u0000-\u001f\u007f]/.test(request.query)
      || !object(request.context)
      || !exact(request.context, ['scope', 'deviceId', 'consentRevision'])
      || request.context.scope !== 'device') return;

    used.add(request.requestId);
    const operation = request.operation as Operation;
    const context = request.context;
    const consent = readConsent();
    const authorized = () => {
      const current = readConsent();
      return !!consent
        && !!current
        && current.deviceId === context.deviceId
        && current.revision === context.consentRevision
        && current.revision === consent.revision
        && current.permissions.includes(operation)
        && channel === request.channel;
    };

    void (async () => {
      let status = 'unconnected';
      let items: ReturnType<typeof project> | null = null;
      let coverage: 'device-local' | 'account-synced' = 'device-local';

      if (authorized()) {
        try {
          let cloudEpub: unknown[] = [];
          let cloudPdf: unknown[] = [];
          if (accountAwareConnection && consent!.includeAccount) {
            reconcilingAccount = true;
            try {
              const account = await readLibraryHubAccountSnapshot(true, hubAccountId);
              if (account.status === 'available' && account.snapshot) {
                cloudEpub = account.snapshot.state.main?.epubProgress?.records ?? [];
                cloudPdf = account.snapshot.state.pdf?.progress?.records ?? [];
                coverage = 'account-synced';
              }
            } finally {
              reconcilingAccount = false;
            }
          }

          if (!authorized()) throw new Error('Sharing changed while Library was checking Account state.');

          const [books, epub, pdf] = await Promise.all([
            availableBooks(catalogue, consent!.includePersonal),
            readRows('thiepn-library', 9, 'progress'),
            readRows('thiepn-library-pdf-reader', 2, 'progress'),
          ]);

          if (authorized()) {
            items = project(books, [...epub, ...cloudEpub], [...pdf, ...cloudPdf], operation, request.query as string);
            status = items.length ? 'ready' : 'empty';
          }
        } catch {
          status = authorized() ? 'unsupported' : 'unconnected';
        }
      }

      if (!authorized()) {
        status = 'unconnected';
        items = null;
        coverage = 'device-local';
      }

      const now = new Date();
      const envelope = {
        schemaVersion: 1,
        providerId: 'library',
        operation,
        requestId: request.requestId,
        context,
        status,
        privacy: 'private',
        coverage,
        observedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 120000).toISOString(),
        sourceUpdatedAt: items?.[0]?.updatedAt ?? null,
        data: items ? { items } : null,
      };
      if (channel === request.channel) {
        send({ protocol: request.protocol, channel, requestId: request.requestId, kind: 'result', envelope });
      }
    })();
  });

  window.addEventListener('pagehide', invalidate);
}

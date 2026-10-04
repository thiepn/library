import { CONSENT_KEY, OPERATIONS, exact, object, project, readConsent, uuid, type Book, type Operation } from './contract';
import { availableBooks, readRows } from './storage';
export function installBridge(catalogue: Book[]) {
  if (parent === window) return;
  let channel: string | null = null;
  const used = new Set<string>();
  const send = (value: unknown) => parent.postMessage(value, location.origin);
  const invalidate = () => { if (channel) send({ protocol: 'thiepn-library-hub-v1', channel, kind: 'invalidate' }); channel = null; used.clear(); };
  window.addEventListener('storage', event => { if (event.key === CONSENT_KEY || event.key === null) invalidate(); });
  for (const name of ['thiepn-library', 'thiepn-library-pdf-reader', 'thiepn-library-personal-books']) {
    try { const broadcast = new BroadcastChannel(name); broadcast.onmessage = invalidate; window.addEventListener('pagehide', () => broadcast.close(), { once: true }); } catch {}
  }
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== parent || !object(event.data)) return;
    // Same-origin deployment is one script trust boundary. This is contractual
    // consent enforcement, not isolation against malicious same-origin JavaScript.
    let parentPath: string; try { parentPath = parent.location.pathname; } catch { return; }
    if (parentPath !== '/home/' && parentPath !== '/home') return;
    const request = event.data;
    if (request.protocol !== 'thiepn-library-hub-v1' || !uuid(request.channel) || !uuid(request.requestId)) return;
    if (request.kind === 'connect' && exact(request, ['protocol','channel','requestId','kind'])) {
      channel = request.channel; used.clear(); used.add(request.requestId);
      const consent = readConsent();
      send({ protocol: request.protocol, channel, requestId: request.requestId, kind: 'connected', consent }); return;
    }
    if (request.kind !== 'read' || !exact(request, ['protocol','channel','requestId','kind','operation','context','query']) || channel !== request.channel || used.has(request.requestId) || used.size >= 64 || !OPERATIONS.includes(request.operation as Operation) || typeof request.query !== 'string' || request.query.length > 256 || /[\u0000-\u001f\u007f]/.test(request.query) || !object(request.context) || !exact(request.context, ['scope','deviceId','consentRevision']) || request.context.scope !== 'device') return;
    used.add(request.requestId);
    const operation = request.operation as Operation, context = request.context;
    const consent = readConsent();
    const authorized = () => { const current = readConsent(); return !!consent && !!current && current.deviceId === context.deviceId && current.revision === context.consentRevision && current.revision === consent.revision && current.permissions.includes(operation) && channel === request.channel; };
    void (async () => {
      let status = 'unconnected', items: ReturnType<typeof project> | null = null;
      if (authorized()) {
        try {
          const [books, epub, pdf] = await Promise.all([availableBooks(catalogue, consent!.includePersonal), readRows('thiepn-library', 9, 'progress'), readRows('thiepn-library-pdf-reader', 1, 'progress')]);
          if (authorized()) { items = project(books, epub, pdf, operation, request.query as string); status = items.length ? 'ready' : 'empty'; }
        } catch { status = authorized() ? 'unsupported' : 'unconnected'; }
      }
      if (!authorized()) { status = 'unconnected'; items = null; }
      const now = new Date();
      const envelope = { schemaVersion: 1, providerId: 'library', operation, requestId: request.requestId, context, status, privacy: 'private', coverage: 'device-local', observedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 120000).toISOString(), sourceUpdatedAt: items?.[0]?.updatedAt ?? null, data: items ? { items } : null };
      if (channel === request.channel) send({ protocol: request.protocol, channel, requestId: request.requestId, kind: 'result', envelope });
    })();
  });
  window.addEventListener('pagehide', invalidate);
}

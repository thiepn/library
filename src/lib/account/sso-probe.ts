import {
  THIEPN_ACCOUNT_ORIGIN,
  THIEPN_LIBRARY_OAUTH_CLIENT_ID,
} from './supabase';

const PROBE_MESSAGE = 'thiepn:sso-probe:v1';
const PROBE_TIMEOUT_MS = 2500;

export type LibrarySsoProbeResult =
  | 'signed-in'
  | 'disconnected'
  | 'signed-out'
  | 'unavailable';

interface ProbeMessage {
  type?: unknown;
  clientId?: unknown;
  signedIn?: unknown;
  eligible?: unknown;
}

function isProbeMessage(value: unknown): value is Required<ProbeMessage> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as ProbeMessage;
  return (
    row.type === PROBE_MESSAGE
    && row.clientId === THIEPN_LIBRARY_OAUTH_CLIENT_ID
    && typeof row.signedIn === 'boolean'
    && typeof row.eligible === 'boolean'
  );
}

export function interpretLibrarySsoProbeMessage(value: unknown): LibrarySsoProbeResult | null {
  if (!isProbeMessage(value)) return null;
  if (!value.signedIn) return 'signed-out';
  return value.eligible ? 'signed-in' : 'disconnected';
}

export function probeExistingThiepnAccountSession(): Promise<LibrarySsoProbeResult> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.hidden = true;
    iframe.tabIndex = -1;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    iframe.referrerPolicy = 'origin';
    iframe.src = `${THIEPN_ACCOUNT_ORIGIN}/sso/probe?client_id=${encodeURIComponent(THIEPN_LIBRARY_OAUTH_CLIENT_ID)}`;

    let settled = false;
    const finish = (result: LibrarySsoProbeResult) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      iframe.remove();
      resolve(result);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== THIEPN_ACCOUNT_ORIGIN) return;
      if (event.source !== iframe.contentWindow) return;
      const result = interpretLibrarySsoProbeMessage(event.data);
      if (result) finish(result);
    };

    const timer = window.setTimeout(() => finish('unavailable'), PROBE_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    document.body.append(iframe);
  });
}

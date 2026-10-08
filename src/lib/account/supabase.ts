import { createThiepnAccountSession, createThiepnBrowserSso, type ThiepnIdentity } from '@thiepn/account-session';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const THIEPN_ACCOUNT_PROJECT_REF = 'hycegznamzjhwinegaai';
export const THIEPN_ACCOUNT_URL = 'https://hycegznamzjhwinegaai.supabase.co';
export const THIEPN_ACCOUNT_ORIGIN = 'https://account.thiepn.dev';
export const THIEPN_LIBRARY_OAUTH_CLIENT_ID = '76e41661-f8a9-4181-b8b9-4084f2e2acbf';

const LIBRARY_SSO_STORAGE_KEY = 'thiepn:library-sso:v1';
const LIBRARY_SSO_RETURN_KEY = 'thiepn:library-sso:return:v1';

export interface LibraryAccountUser {
  id: string;
  email: string | null;
}

let client: SupabaseClient | undefined;
let session: ReturnType<typeof createThiepnAccountSession> | undefined;
let browserSso: ReturnType<typeof createThiepnBrowserSso> | undefined;

export function hasThiepnAccountConfiguration(): boolean {
  const key = import.meta.env.PUBLIC_THIEPN_ACCOUNT_PUBLISHABLE_KEY as string | undefined;
  return typeof key === 'string' && key.trim().length > 0;
}

function configuredPublishableKey(): string {
  const key = import.meta.env.PUBLIC_THIEPN_ACCOUNT_PUBLISHABLE_KEY as string | undefined;
  if (!key) {
    throw new Error('THIEPN Account sync is not configured for this Library build.');
  }
  return key;
}

export function getLibraryAccountCallbackUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return new URL(`${base}/auth/callback/`, window.location.origin).href;
}

function safeLibraryReturnTo(raw: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const fallback = `${base}/`;
  try {
    const target = new URL(raw, window.location.origin);
    if (target.origin !== window.location.origin) return fallback;
    if (!target.pathname.startsWith(`${base}/`) && target.pathname !== base) return fallback;
    if (target.pathname.replace(/\/$/, '').endsWith('/auth/callback')) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}

export function getThiepnAccountSession() {
  if (session) return session;
  session = createThiepnAccountSession({
    issuer: THIEPN_ACCOUNT_URL,
    publishableKey: configuredPublishableKey(),
    clientId: THIEPN_LIBRARY_OAUTH_CLIENT_ID,
    redirectUri: getLibraryAccountCallbackUrl(),
    scopes: ['openid', 'email', 'profile', 'offline_access'],
    storageKey: LIBRARY_SSO_STORAGE_KEY,
    authPolicy: 'guest-first',
  });
  return session;
}

export function getLibraryBrowserSso() {
  if (browserSso) return browserSso;
  browserSso = createThiepnBrowserSso(getThiepnAccountSession(), {
    accountOrigin: THIEPN_ACCOUNT_ORIGIN,
  });
  return browserSso;
}

export function getThiepnAccountClient(): SupabaseClient {
  if (client) return client;
  client = createClient(THIEPN_ACCOUNT_URL, configuredPublishableKey(), {
    accessToken: async () => getThiepnAccountSession().getAccessToken(),
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

function identityToUser(identity: ThiepnIdentity): LibraryAccountUser | null {
  if (identity.status === 'signed-in') {
    return { id: identity.id, email: identity.email };
  }
  if (identity.status === 'unavailable') {
    throw new Error(identity.code);
  }
  return null;
}

export async function isLibraryAccountConnectionActive(): Promise<boolean> {
  const { data, error } = await getThiepnAccountClient()
    .from('account_app_connections')
    .select('status')
    .eq('app_slug', 'library')
    .maybeSingle();
  if (error) throw error;
  return data?.status === 'connected' || data?.status === 'limited';
}

export async function getVerifiedLibraryAccountIdentity(): Promise<LibraryAccountUser | null> {
  if (!hasThiepnAccountConfiguration()) return null;
  return identityToUser(await getThiepnAccountSession().verify());
}

export function getThiepnAccountPublishableKey(): string {
  return configuredPublishableKey();
}

export async function getVerifiedLibraryAccountUser(): Promise<LibraryAccountUser | null> {
  const user = await getVerifiedLibraryAccountIdentity();
  if (!user) return null;
  if (!(await isLibraryAccountConnectionActive())) {
    getLibraryBrowserSso().signOutLocal();
    return null;
  }
  return user;
}

function rememberLibrarySsoReturnTo(returnTo: string): void {
  try {
    sessionStorage.setItem(LIBRARY_SSO_RETURN_KEY, safeLibraryReturnTo(returnTo));
  } catch {
    // A blocked return-path hint must not prevent the OAuth attempt.
  }
}

/** Preserve the requested Library route during a silent first-party SSO redirect. */
export function initializeLibraryAccountSso(returnTo = window.location.href) {
  rememberLibrarySsoReturnTo(returnTo);
  return getLibraryBrowserSso().initialize();
}

export async function beginLibraryAccountSso(returnTo = window.location.href): Promise<void> {
  rememberLibrarySsoReturnTo(returnTo);
  await getLibraryBrowserSso().connect();
}

export async function completeLibraryAccountSsoCallback(): Promise<LibraryAccountUser | null> {
  return identityToUser(await getLibraryBrowserSso().completeCallback(window.location));
}

export function consumeLibraryAccountSsoReturnTo(): string {
  const fallback = `${import.meta.env.BASE_URL.replace(/\/$/, '')}/`;
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(LIBRARY_SSO_RETURN_KEY);
    sessionStorage.removeItem(LIBRARY_SSO_RETURN_KEY);
  } catch {
    return fallback;
  }
  return raw ? safeLibraryReturnTo(raw) : fallback;
}

export function signOutLibraryAppSession(): void {
  getLibraryBrowserSso().signOutLocal();
}

export function subscribeLibraryAccountAuth(listener: () => void): () => void {
  if (!hasThiepnAccountConfiguration()) return () => {};
  return getThiepnAccountSession().subscribe(() => listener());
}

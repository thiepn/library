import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';

export const THIEPN_ACCOUNT_PROJECT_REF = 'hycegznamzjhwinegaai';
export const THIEPN_ACCOUNT_URL = 'https://hycegznamzjhwinegaai.supabase.co';

let client: SupabaseClient | undefined;

function configuredPublishableKey(): string {
  const key = import.meta.env.PUBLIC_THIEPN_ACCOUNT_PUBLISHABLE_KEY as string | undefined;
  if (!key) {
    throw new Error('THIEPN Account sync is not configured for this Library build.');
  }
  return key;
}

export function getThiepnAccountClient(): SupabaseClient {
  if (client) return client;
  client = createClient(THIEPN_ACCOUNT_URL, configuredPublishableKey(), {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

export function getLibraryAccountCallbackUrl(): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return new URL(`${base}/account`, window.location.origin).href;
}

function cleanOAuthParams(): void {
  const url = new URL(window.location.href);
  for (const key of ['code', 'error', 'error_code', 'error_description']) url.searchParams.delete(key);
  window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
}

export async function completeLibraryAccountOAuthCallback(): Promise<boolean> {
  const url = new URL(window.location.href);
  const authError = url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (authError) {
    cleanOAuthParams();
    throw new Error(authError);
  }

  const code = url.searchParams.get('code');
  if (!code) return false;

  const { error } = await getThiepnAccountClient().auth.exchangeCodeForSession(code);
  cleanOAuthParams();
  if (error) throw error;
  return true;
}

export async function getVerifiedLibraryAccountUser(): Promise<User | null> {
  const auth = getThiepnAccountClient().auth;
  const { data: sessionData, error: sessionError } = await auth.getSession();
  if (sessionError) throw sessionError;
  if (!sessionData.session) return null;

  const { data, error } = await auth.getUser();
  if (error) throw error;
  if (!data.user || data.user.is_anonymous) return null;
  return data.user;
}

export async function signInLibraryAccountWithGoogle(): Promise<void> {
  const { error } = await getThiepnAccountClient().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: getLibraryAccountCallbackUrl() },
  });
  if (error) throw error;
}

export async function signOutLibraryAccount(): Promise<void> {
  const { error } = await getThiepnAccountClient().auth.signOut({ scope: 'local' });
  if (error) throw error;
}

export function subscribeLibraryAccountAuth(listener: () => void): () => void {
  const { data } = getThiepnAccountClient().auth.onAuthStateChange(() => listener());
  return () => data.subscription.unsubscribe();
}

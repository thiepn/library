import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createThiepnAccountSession } from '@thiepn/account-session';
import { libraryOAuthTokenStorage } from '../../src/lib/account/oauth-storage';

function storage(denyWrite = false): Storage {
  const data = new Map<string,string>();
  return {
    get length() { return data.size; },
    clear() { data.clear(); },
    getItem(key: string) { return data.get(key) ?? null; },
    key(index: number) { return [...data.keys()][index] ?? null; },
    removeItem(key: string) { data.delete(key); },
    setItem(key: string, value: string) {
      if (denyWrite) throw new DOMException('Storage quota or privacy policy', 'QuotaExceededError');
      data.set(key, value);
    },
  };
}

test('OAuth completes after code exchange when persistent token writes are denied', async () => {
  const primary = storage(true);
  const tab = storage();
  const browser = { localStorage: primary, sessionStorage: tab } as Window;
  const adapter = libraryOAuthTokenStorage(browser);
  const clientId = '76e41661-f8a9-4181-b8b9-4084f2e2acbf';
  const redirectUri = 'https://thiepn.dev/library/auth/callback/';
  let tokenExchanges = 0;
  let identityChecks = 0;
  const session = createThiepnAccountSession({
    issuer: 'https://hycegznamzjhwinegaai.supabase.co',
    clientId,
    redirectUri,
    publishableKey: 'sb_publishable_test_fixture_this_is_not_a_real_key',
    storageKey: 'thiepn:library-sso:test',
    localStorage: adapter,
    sessionStorage: tab,
    crypto: webcrypto as Crypto,
    authPolicy: 'guest-first',
    fetch: async (request) => {
      const pathname = new URL(String(request)).pathname;
      if (pathname === '/auth/v1/oauth/token') {
        tokenExchanges++;
        return new Response(JSON.stringify({
          access_token: 'access-token-fixture-only-minimum-length',
          refresh_token: 'refresh-token-fixture-only-minimum-length',
          token_type: 'bearer',
          expires_in: 3600,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (pathname === '/auth/v1/user') {
        identityChecks++;
        return new Response(JSON.stringify({ id: clientId, email: null }), { status: 200 });
      }
      throw new Error('Unexpected mock endpoint: ' + pathname);
    },
  });
  const authorize = new URL(await session.authorizationUrl());
  const location = {
    href: redirectUri + '?code=fixture-authorization-code&state=' + encodeURIComponent(authorize.searchParams.get('state')!),
    hash: '',
  };
  const result = await session.completeCallback(location);
  assert.equal(result.status, 'signed-in');
  assert.equal(tokenExchanges, 1);
  assert.equal(identityChecks, 1);
  assert.ok(tab.getItem('thiepn:library-sso:test:tokens'));
  assert.equal(primary.getItem('thiepn:library-sso:test:tokens'), null);
  assert.equal((await session.verify()).status, 'signed-in');
  session.signOutLocal();
  assert.equal(tab.getItem('thiepn:library-sso:test:tokens'), null);
});

test('persistent token storage is preferred when writable; sign out clears both stores', () => {
  const primary = storage();
  const tab = storage();
  const adapter = libraryOAuthTokenStorage({ localStorage: primary, sessionStorage: tab } as Window);
  tab.setItem('oauth', 'old');
  adapter.setItem('oauth', 'current');
  assert.equal(primary.getItem('oauth'), 'current');
  assert.equal(tab.getItem('oauth'), null);
  assert.equal(adapter.getItem('oauth'), 'current');
  tab.setItem('oauth', 'transient');
  assert.equal(adapter.getItem('oauth'), 'transient');
  adapter.removeItem('oauth');
  assert.equal(tab.getItem('oauth'), null);
  assert.equal(primary.getItem('oauth'), null);
});

test('does not silently store tokens when both storage surfaces reject writes', () => {
  const adapter = libraryOAuthTokenStorage({
    localStorage: storage(true), sessionStorage: storage(true),
  } as Window);
  assert.throws(() => adapter.setItem('oauth', 'token'), /ACCOUNT_TOKEN_STORAGE_UNAVAILABLE/);
  assert.equal(adapter.getItem('oauth'), null);
});

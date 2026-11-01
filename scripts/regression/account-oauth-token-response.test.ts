import assert from 'node:assert/strict';
import test from 'node:test';
import { webcrypto } from 'node:crypto';
import { createThiepnAccountSession } from '@thiepn/account-session';

const clientId = '76e41661-f8a9-4181-b8b9-4084f2e2acbf';
const redirect = 'https://thiepn.dev/library/auth/callback/';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear() { values.clear(); },
    getItem(key) { return values.get(key) ?? null; },
    key(i) { return [...values.keys()][i] ?? null; },
    removeItem(key) { values.delete(key); },
    setItem(key, value) { values.set(key, value); },
  };
}

function fixture(fetcher: typeof fetch) {
  const local = memoryStorage();
  const session = memoryStorage();
  const account = createThiepnAccountSession({
    issuer: 'https://hycegznamzjhwinegaai.supabase.co',
    clientId,
    redirectUri: redirect,
    publishableKey: 'sb_publishable_synthetic_test_not_real',
    storageKey: 'thiepn:library-sso:mock',
    authPolicy: 'guest-first',
    localStorage: local,
    sessionStorage: session,
    crypto: webcrypto as Crypto,
    fetch: fetcher,
  });
  return { account, local };
}

async function returnUrl(account: ReturnType<typeof fixture>['account']) {
  const request = new URL(await account.authorizationUrl());
  return { href: redirect + '?code=synthetic-auth-code&state=' + request.searchParams.get('state'), hash: '' };
}

test('case-insensitive Bearer token_type completes authorization and verifies user', async () => {
  let tokenCalls = 0;
  let userCalls = 0;
  const { account, local } = fixture((async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname;
    if (path === '/auth/v1/oauth/token') {
      tokenCalls++;
      assert.equal(init?.method, 'POST');
      return Response.json({
        access_token: 'synthetic-access-token-long-enough',
        refresh_token: 'synthetic-refresh-token-long-enough',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid email profile',
        id_token: 'synthetic-id-token',
      });
    }
    if (path === '/auth/v1/user') {
      userCalls++;
      return Response.json({ id: clientId, email: null });
    }
    throw new Error('unexpected test endpoint');
  }) as typeof fetch);
  const outcome = await account.completeCallback(await returnUrl(account));
  assert.equal(outcome.status, 'signed-in');
  assert.equal(tokenCalls, 1);
  assert.equal(userCalls, 1);
  assert.ok(local.getItem('thiepn:library-sso:mock:tokens'));
});

for (const scenario of [
  {
    name: 'network or CORS fetch rejected',
    response: async () => { throw new TypeError('Failed to fetch SECRET_CODE'); },
    expected: 'ACCOUNT_TOKEN_TRANSPORT_FAILED',
  },
  {
    name: '200 response is not JSON',
    response: async () => new Response('not json', { status: 200 }),
    expected: 'ACCOUNT_TOKEN_RESPONSE_UNREADABLE',
  },
  {
    name: '200 response token fields invalid',
    response: async () => Response.json({
      access_token: 'synthetic-access-token-long-enough',
      refresh_token: 'synthetic-refresh-token-long-enough',
      expires_in: 3600,
      token_type: 'Basic',
    }),
    expected: 'ACCOUNT_TOKEN_RESPONSE_INVALID',
  },
  {
    name: 'expired authorization grant',
    response: async () => Response.json({ error: 'invalid_grant' }, { status: 400 }),
    expected: 'ACCOUNT_TOKEN_REVOKED',
  },
] as const) {
  test('safe OAuth diagnostic: ' + scenario.name, async () => {
    const { account, local } = fixture(scenario.response as typeof fetch);
    const result = await account.completeCallback(await returnUrl(account));
    assert.deepEqual(result, { status: 'unavailable', code: scenario.expected });
    assert.ok(!JSON.stringify(result).includes('SECRET_CODE'));
    assert.equal(local.getItem('thiepn:library-sso:mock:tokens'), null);
  });
}

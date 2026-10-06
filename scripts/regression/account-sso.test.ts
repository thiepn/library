import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { interpretLibrarySsoProbeMessage } from '../../src/lib/account/sso-probe';
import {
  THIEPN_LIBRARY_OAUTH_CLIENT_ID,
  THIEPN_ACCOUNT_ORIGIN,
} from '../../src/lib/account/supabase';

const CLIENT_ID = '76e41661-f8a9-4181-b8b9-4084f2e2acbf';

test('Library uses the pinned first-party THIEPN OAuth client', async () => {
  const [authSource, accountPage, callbackPage, runtime, pkgText] = await Promise.all([
    readFile('src/lib/account/supabase.ts', 'utf8'),
    readFile('src/pages/account.astro', 'utf8'),
    readFile('src/pages/auth/callback.astro', 'utf8'),
    readFile('src/lib/account/runtime.ts', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);
  const pkg = JSON.parse(pkgText) as { dependencies?: Record<string, string> };

  assert.equal(THIEPN_LIBRARY_OAUTH_CLIENT_ID, CLIENT_ID);
  assert.equal(THIEPN_ACCOUNT_ORIGIN, 'https://account.thiepn.dev');
  assert.equal(authSource.includes("provider: 'google'"), false);
  assert.equal(authSource.includes('signInWithOAuth'), false);
  assert.equal(accountPage.includes('Continue with Google'), false);
  assert.equal(accountPage.includes('Connect THIEPN Account'), true);
  assert.equal(callbackPage.includes('completeLibraryAccountSsoCallback'), true);
  assert.equal(runtime.includes('probeExistingThiepnAccountSession'), true);
  assert.match(
    pkg.dependencies?.['@thiepn/account-session'] ?? '',
    /^github:thiepn\/account#7aa06dfda9e35e1b9a10c74fd58207b13ad2faaa&path:\/packages\/account-session$/,
  );
});

test('silent Account probe exposes only signed-in eligibility semantics', () => {
  assert.equal(
    interpretLibrarySsoProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: CLIENT_ID,
      signedIn: true,
      eligible: true,
    }),
    'signed-in',
  );
  assert.equal(
    interpretLibrarySsoProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: CLIENT_ID,
      signedIn: true,
      eligible: false,
    }),
    'disconnected',
  );
  assert.equal(
    interpretLibrarySsoProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: CLIENT_ID,
      signedIn: false,
      eligible: true,
    }),
    'signed-out',
  );
  assert.equal(
    interpretLibrarySsoProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: '11111111-1111-4111-8111-111111111111',
      signedIn: true,
      eligible: true,
    }),
    null,
  );
});

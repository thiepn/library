import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { readThiepnAccountProbeMessage } from '@thiepn/account-session';
import {
  THIEPN_LIBRARY_OAUTH_CLIENT_ID,
  THIEPN_ACCOUNT_ORIGIN,
} from '../../src/lib/account/supabase';

const CLIENT_ID = '76e41661-f8a9-4181-b8b9-4084f2e2acbf';

test('Library uses the pinned first-party THIEPN OAuth client', async () => {
  const [authSource, accountPage, accountDom, callbackPage, runtime, pkgText] = await Promise.all([
    readFile('src/lib/account/supabase.ts', 'utf8'),
    readFile('src/pages/account.astro', 'utf8'),
    readFile('src/lib/account/account-dom.ts', 'utf8'),
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
  assert.equal(accountPage.includes('data-account-signed-out hidden'), true);
  assert.equal(accountDom.includes('initializeLibraryAccountSso()'), true);
  assert.equal(accountDom.includes("hidden('[data-account-signed-out]', false)"), true);
  assert.equal(runtime.includes('initializeLibraryAccountSso()'), true);
  assert.equal(runtime.includes('probeExistingThiepnAccountSession'), false);
  assert.equal(authSource.includes('createThiepnBrowserSso'), true);
  assert.equal(authSource.includes('getLibraryBrowserSso().connect()'), true);
  assert.equal(authSource.includes('rememberLibrarySsoReturnTo(returnTo)'), true);
  assert.equal(authSource.includes('getLibraryBrowserSso().completeCallback(window.location)'), true);
  assert.equal(runtime.includes('if (!hasThiepnAccountConfiguration()) return () => {};'), true);
  assert.equal(authSource.includes('if (!hasThiepnAccountConfiguration()) return null;'), true);
  assert.match(
    pkg.dependencies?.['@thiepn/account-session'] ?? '',
    /^github:thiepn\/account#83c3af63a18c771105e4460368dadbeaeb625fd0&path:\/packages\/account-session$/,
  );
});

test('silent Account probe exposes only signed-in eligibility semantics', () => {
  assert.equal(
    readThiepnAccountProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: CLIENT_ID,
      signedIn: true,
      eligible: true,
    }, CLIENT_ID),
    'signed-in',
  );
  assert.equal(
    readThiepnAccountProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: CLIENT_ID,
      signedIn: true,
      eligible: false,
    }, CLIENT_ID),
    'disconnected',
  );
  assert.equal(
    readThiepnAccountProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: CLIENT_ID,
      signedIn: false,
      eligible: true,
    }, CLIENT_ID),
    'signed-out',
  );
  assert.equal(
    readThiepnAccountProbeMessage({
      type: 'thiepn:sso-probe:v1',
      clientId: '11111111-1111-4111-8111-111111111111',
      signedIn: true,
      eligible: true,
    }, CLIENT_ID),
    null,
  );
});

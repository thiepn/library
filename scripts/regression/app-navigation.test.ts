import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APPS, ACTIONS } from '../../src/lib/app-navigation/catalogue.mjs';
import { navigationHref } from '../../src/lib/app-navigation/switcher.mjs';

test('H25-U exposes the pinned public catalogue only', () => {
  assert.equal(APPS.length, 14);
  assert.equal(new Set(APPS.map(app => app.id)).size, 14);
  assert.equal(ACTIONS.length, 4);
  assert.equal(navigationHref('library-saved'), 'https://thiepn.dev/library/saved/');
  assert.equal(navigationHref('https://evil.test'), null);
  assert.equal(navigationHref('library?token=secret'), null);
});

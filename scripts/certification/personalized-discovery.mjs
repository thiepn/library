import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/content/personalized-discovery.ts',
  'src/lib/client/library-db.ts',
  'src/lib/reading-activity/library-dom.ts',
  'src/pages/saved.astro',
  'scripts/regression/personalized-discovery.test.ts',
  'package.json',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('P5_PERSONALIZED_DISCOVERY_FILES', present, 'P5 opt-in ranking, device-local preference, UI, tests, and certification assets are present');

if (present) {
  const [ranking, db, dom, saved, pkg] = await Promise.all([
    readFile('src/lib/content/personalized-discovery.ts', 'utf8'),
    readFile('src/lib/client/library-db.ts', 'utf8'),
    readFile('src/lib/reading-activity/library-dom.ts', 'utf8'),
    readFile('src/pages/saved.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass(
    'P5_PERSONALIZED_DISCOVERY_OPT_IN',
    ranking.includes('if (!enabled || limit <= 0) return []')
      && dom.includes("PERSONALIZED_DISCOVERY_PREFERENCE = 'personalized-discovery-enabled'")
      && saved.includes('Use my reading activity on this device')
      && saved.includes('Off by default'),
    'Reading-history ranking is hard-disabled until the user explicitly opts in on the device',
  );

  pass(
    'P5_PERSONALIZED_DISCOVERY_LOCAL_ONLY',
    !ranking.includes('fetch(')
      && !ranking.includes('XMLHttpRequest')
      && !ranking.includes('localStorage')
      && !ranking.includes('sessionStorage')
      && db.includes("['preferences', 'key']")
      && db.includes("broadcast('preferences')"),
    'Personalized discovery uses existing local Library state and its own IndexedDB preference store, with no recommendation network call or web-storage side channel',
  );

  const portabilityShape = db.match(/export interface LibraryDbPortabilitySnapshot \\{([\\s\\S]*?)\\n\\}/)?.[1] ?? '';
  const portabilityRead = db.match(/export async function getLibraryDbPortabilitySnapshot[\\s\\S]*?export async function replaceLibraryDbPortabilitySnapshot/)?.[0] ?? '';

  pass(
    'P5_PERSONALIZED_DISCOVERY_NOT_PORTABLE',
    Boolean(portabilityShape)
      && !portabilityShape.includes('preferences')
      && !portabilityRead.includes("transaction(['preferences'")
      && !portabilityRead.includes("objectStore('preferences')"),
    'The privacy preference is intentionally excluded from backup and Account portability so another device cannot silently inherit opt-in',
  );

  pass(
    'P5_PERSONALIZED_DISCOVERY_BOUNDED',
    ranking.includes(".filter(({ state, saved }) => !saved && state.status === 'not-started')")
      && ranking.includes('.slice(0, 5)')
      && ranking.includes('.slice(0, limit)'),
    'Personalized discovery uses a bounded recent-source set and only recommends unsaved not-started hosted candidates',
  );

  pass(
    'P5_PERSONALIZED_DISCOVERY_COPY',
    saved.includes('Reading activity stays on this device')
      && saved.includes('not sent to a recommendation service')
      && dom.includes('Only Library metadata and local reading activity are used.'),
    'The user-facing privacy boundary is explicit at the control and active state',
  );

  pass(
    'P5_PERSONALIZED_DISCOVERY_CERT_CHAIN',
    pkg.includes('discovery.mjs && node scripts/certification/personalized-discovery.mjs'),
    'P5 personalized discovery certification is chained after metadata-only discovery',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('P5_PERSONALIZED_DISCOVERY_SOURCE_PASS');

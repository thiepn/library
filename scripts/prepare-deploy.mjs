import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const libraryRoot = 'dist/library';
const assetRoot = path.join(libraryRoot, '_astro');
const offlineManifest = path.join(libraryRoot, 'offline-assets.json');
const releaseIdentity = path.join(libraryRoot, 'release-identity.json');

async function walk(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

try {
  const assets = (await walk(assetRoot))
    .map((file) => `/library/${path.relative(libraryRoot, file).split(path.sep).join('/')}`)
    .sort();
  if (!assets.length) throw new Error('No hashed Astro assets were generated');
  await writeFile(offlineManifest, `${JSON.stringify({ schemaVersion: 1, assets }, null, 2)}\n`, 'utf8');
  console.log(`[deploy] wrote offline asset manifest with ${assets.length} hashed asset(s)`);
} catch (error) {
  throw new Error('Unable to generate the RR5 offline application asset manifest', { cause: error });
}

const sourceSha = process.env.LIBRARY_SOURCE_SHA ?? process.env.GITHUB_SHA ?? 'local';
const runId = process.env.GITHUB_RUN_ID ?? null;
await writeFile(releaseIdentity, `${JSON.stringify({
  schemaVersion: 1,
  sourceSha,
  runId,
}, null, 2)}\n`, 'utf8');
console.log(`[deploy] wrote release identity for ${sourceSha}`);

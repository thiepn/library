import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const root = process.cwd();
const releasesRoot = path.join(root, 'src/publications/releases');
const manifestRoot = path.join(root, 'src/unlisted-assets');
const mediaRoot = path.join(root, 'dist/library/media');
const mediaPrefix = '/library/media/';
const examined = new Map();

async function* walkYaml(directory) {
  for (const file of await readdir(directory, { withFileTypes: true })) {
    const p = path.join(directory, file.name);
    if (file.isDirectory()) yield* walkYaml(p);
    else if (file.isFile() && /\.ya?ml$/i.test(file.name)) yield p;
  }
}
function canonicalMediaPath(key) {
  if (!key || key.startsWith('/') || key.includes('\\') || key.split('/').some(part => part === '.' || part === '..' || !part)) {
    throw new Error('Invalid canonical publication asset path');
  }
  const target = path.resolve(mediaRoot, key);
  if (!target.startsWith(mediaRoot + path.sep)) throw new Error('Media escape rejected');
  return target;
}
async function check(key, bytes, hash, context) {
  if (!Number.isSafeInteger(bytes) || bytes <= 0 || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error(context + ': invalid expected artifact size/hash');
  }
  const seen = examined.get(key);
  if (seen) {
    if (seen.bytes !== bytes || seen.hash !== hash) throw new Error(context + ': conflicting asset registration');
    return;
  }
  const file = canonicalMediaPath(key);
  const size = (await stat(file)).size;
  if (size !== bytes) throw new Error(context + ': wrong size for ' + key);
  const digest = createHash('sha256').update(await readFile(file)).digest('hex');
  if (digest !== hash) throw new Error(context + ': wrong SHA256 for ' + key);
  examined.set(key, { bytes, hash });
}
for await (const file of walkYaml(releasesRoot)) {
  const edition = YAML.parse(await readFile(file, 'utf8'));
  for (const [format, artifact] of Object.entries(edition?.artifacts ?? {})) {
    if (!artifact || typeof artifact !== 'object') continue;
    const url = new URL(artifact.url);
    if (url.origin !== 'https://thiepn.dev' || !url.pathname.startsWith(mediaPrefix)) {
      throw new Error(file + ': non-canonical publication URL');
    }
    await check(decodeURIComponent(url.pathname.slice(mediaPrefix.length)), Number(artifact.sizeBytes), String(artifact.sha256).toLowerCase(), file + ':' + format);
  }
}
for (const filename of (await readdir(manifestRoot)).filter(x => x.endsWith('.json'))) {
  const file = path.join(manifestRoot, filename);
  const m = JSON.parse(await readFile(file, 'utf8'));
  const assetId = String(m.assetId ?? '');
  if (!/^[a-f0-9]{32}$/.test(assetId) || filename !== assetId + '.json') throw new Error('Invalid unlisted asset manifest');
  await check('unlisted/' + assetId + '.bin', Number(m.sizeBytes), String(m.sha256 ?? '').toLowerCase(), filename);
}
if (!examined.size) throw new Error('No publication assets verified');
console.log('PREMERGE_MEDIA_HASH_PASS ' + examined.size + ' immutable artifacts');

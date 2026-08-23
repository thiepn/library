import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const expectedPath = path.join(root, 'src/content/works/ai-for-the-kingdom/recovery/l17b-expected.json');
const expected = JSON.parse(await readFile(expectedPath, 'utf8'));
const packagePath = path.resolve(process.argv[2] ?? 'incoming/AI_for_the_Kingdom_L17_LIBRARY_PUBLICATION_PACKAGE.zip');
const chaptersOut = path.join(root, 'src/content/works/ai-for-the-kingdom/chapters');
const mediaOut = path.join(root, '.build/l17b-media');

async function sha256(file) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

async function assertFile(file, contract, label) {
  const info = await stat(file);
  if (info.size !== contract.bytes) throw new Error(`${label}: byte size ${info.size} != ${contract.bytes}`);
  const hash = await sha256(file);
  if (hash !== contract.sha256) throw new Error(`${label}: SHA-256 ${hash} != ${contract.sha256}`);
}

async function walk(dir, files = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (entry.isFile()) files.push(full);
  }
  return files;
}

function pickUnique(index, filename, label) {
  const hits = index.get(filename) ?? [];
  if (hits.length !== 1) throw new Error(`${label}: expected exactly one ${filename} in package, found ${hits.length}`);
  return hits[0];
}

await assertFile(packagePath, expected.package, 'frozen package');
const temp = await mkdtemp(path.join(os.tmpdir(), 'l17b-'));
try {
  const unzip = spawnSync('unzip', ['-q', packagePath, '-d', temp], { stdio: 'inherit' });
  if (unzip.status !== 0) throw new Error(`unzip failed with exit code ${unzip.status}`);
  const files = await walk(temp);
  const index = new Map();
  for (const file of files) {
    const name = path.basename(file);
    const list = index.get(name) ?? [];
    list.push(file);
    index.set(name, list);
  }

  await rm(chaptersOut, { recursive: true, force: true });
  await mkdir(chaptersOut, { recursive: true });
  for (const record of expected.records) {
    const source = pickUnique(index, record.file, `reader ${record.id}`);
    await cp(source, path.join(chaptersOut, record.file));
  }

  await rm(mediaOut, { recursive: true, force: true });
  await mkdir(mediaOut, { recursive: true });
  for (const [kind, contract] of Object.entries(expected.assets)) {
    const source = pickUnique(index, contract.filename, kind);
    await assertFile(source, contract, kind);
    await cp(source, path.join(mediaOut, contract.filename));
  }

  await writeFile(path.join(mediaOut, 'PACKAGE_SHA256'), `${expected.package.sha256}  ${expected.package.filename}\n`, 'utf8');
  console.log(`[L17B-2] injected ${expected.records.length} exact reader files and staged ${Object.keys(expected.assets).length} verified assets`);
} finally {
  await rm(temp, { recursive: true, force: true });
}

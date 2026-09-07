import { readdir, readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repositoryRoot = process.cwd();
const sourceRoot = path.join(repositoryRoot, 'encrypted-assets', 'unlisted');
const outputRoot = path.join(repositoryRoot, 'public', 'media', 'unlisted');
const assetPattern = /^[a-f0-9]{32}$/;
const chunkPattern = /^(\d{3})\.b64$/;

async function listDirectories(directory) {
  try {
    return (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

for (const assetId of await listDirectories(sourceRoot)) {
  if (!assetPattern.test(assetId)) throw new Error(`Invalid encrypted asset id: ${assetId}`);

  const assetDirectory = path.join(sourceRoot, assetId);
  const entries = (await readdir(assetDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) throw new Error(`Encrypted asset ${assetId} has no chunks.`);

  const buffers = [];
  let expectedIndex = 0;
  for (const filename of entries) {
    const match = chunkPattern.exec(filename);
    if (!match) throw new Error(`Unexpected encrypted asset file: ${assetId}/${filename}`);
    const index = Number.parseInt(match[1], 10);
    if (index !== expectedIndex) {
      throw new Error(`Encrypted asset ${assetId} is missing chunk ${String(expectedIndex).padStart(3, '0')}.b64.`);
    }

    const encoded = (await readFile(path.join(assetDirectory, filename), 'utf8')).trim();
    if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
      throw new Error(`Encrypted asset ${assetId}/${filename} is not valid base64.`);
    }
    buffers.push(Buffer.from(encoded, 'base64'));
    expectedIndex += 1;
  }

  const output = Buffer.concat(buffers);
  if (output.byteLength < 29) throw new Error(`Encrypted asset ${assetId} is too small.`);
  await writeFile(path.join(outputRoot, `${assetId}.bin`), output);
}

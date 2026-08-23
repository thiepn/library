import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const root = process.cwd();
const expected = JSON.parse(await readFile(path.join(root, 'src/content/works/ai-for-the-kingdom/recovery/l17b-expected.json'), 'utf8'));
const workId = expected.workId;
const version = expected.release;
const base = `https://media.library.thiepn.dev/works/${workId}/editions/${version}`;
const target = path.join(root, 'src/publications/releases', workId, `${version}.yaml`);
const release = {
  schemaVersion: 1,
  workId,
  version,
  edition: 1,
  releasedAt: '2026-08-22',
  sourceHash: expected.package.sha256,
  artifacts: {
    pdf: {
      url: `${base}/${expected.assets.pdf.filename}`,
      filename: expected.assets.pdf.filename,
      mimeType: 'application/pdf',
      sizeBytes: expected.assets.pdf.bytes,
      sha256: expected.assets.pdf.sha256,
    },
    epub: {
      url: `${base}/${expected.assets.epub.filename}`,
      filename: expected.assets.epub.filename,
      mimeType: 'application/epub+zip',
      sizeBytes: expected.assets.epub.bytes,
      sha256: expected.assets.epub.sha256,
    },
  },
};
await mkdir(path.dirname(target), { recursive: true });
await writeFile(target, YAML.stringify(release), 'utf8');
console.log(`[L17B-2] wrote canonical release registry ${path.relative(root, target)}`);

import { createHash } from 'node:crypto';
import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const workId = 'ai-for-the-kingdom';
const root = process.cwd();
const workRoot = path.join(root, 'src/content/works', workId);
const chaptersRoot = path.join(workRoot, 'chapters');
const expectedPath = path.join(workRoot, 'recovery/l17b-expected.json');
const expected = JSON.parse(await readFile(expectedPath, 'utf8')) as {
  expectedReaderFiles: number;
  footnoteRefs: number;
  footnoteDefinitions: number;
  package: { filename: string; bytes: number; sha256: string };
  assets: Record<string, { filename: string; bytes: number; sha256: string }>;
  records: Array<{ id: string; title: string; order: number; part: string | null; file: string; estimatedMinutes: number }>;
};

const errors: string[] = [];
const notes: string[] = [];
const exists = async (file: string) => { try { await access(file); return true; } catch { return false; } };

function frontmatter(raw: string) {
  const normalized = raw.replace(/^\uFEFF/, '');
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) throw new Error('missing YAML frontmatter');
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error('unterminated YAML frontmatter');
  return { data: YAML.parse(match[1] ?? '') as Record<string, unknown>, body: normalized.slice(match[0].length) };
}

async function sha256(file: string) {
  const hash = createHash('sha256');
  hash.update(await readFile(file));
  return hash.digest('hex');
}

let actualFiles: string[] = [];
if (await exists(chaptersRoot)) {
  actualFiles = (await readdir(chaptersRoot)).filter((file) => /\.(md|mdx)$/i.test(file)).sort();
}
const expectedFiles = expected.records.map((record) => record.file).sort();
const expectedSet = new Set(expectedFiles);
const actualSet = new Set(actualFiles);
const missing = expectedFiles.filter((file) => !actualSet.has(file));
const unexpected = actualFiles.filter((file) => !expectedSet.has(file));
if (actualFiles.length !== expected.expectedReaderFiles) errors.push(`reader file count ${actualFiles.length}/${expected.expectedReaderFiles}`);
if (missing.length) errors.push(`missing reader files: ${missing.join(', ')}`);
if (unexpected.length) errors.push(`unexpected reader files: ${unexpected.join(', ')}`);

let refs = 0;
let definitions = 0;
for (const record of expected.records) {
  const file = path.join(chaptersRoot, record.file);
  if (!(await exists(file))) continue;
  const raw = await readFile(file, 'utf8');
  try {
    const parsed = frontmatter(raw);
    const data = parsed.data;
    if (data.id !== record.id) errors.push(`${record.file}: id ${String(data.id)} != ${record.id}`);
    if (data.title !== record.title) errors.push(`${record.file}: title mismatch`);
    if (data.order !== record.order) errors.push(`${record.file}: order ${String(data.order)} != ${record.order}`);
    if ((data.part ?? null) !== record.part) errors.push(`${record.file}: part ${String(data.part ?? null)} != ${String(record.part)}`);
    if (data.status !== 'published') errors.push(`${record.file}: status must be published`);
    if (data.estimatedMinutes !== record.estimatedMinutes) errors.push(`${record.file}: estimatedMinutes mismatch`);
    definitions += (parsed.body.match(/^\[\^[^\]]+\]:/gm) ?? []).length;
    refs += (parsed.body.match(/\[\^[^\]]+\](?!:)/g) ?? []).length;
  } catch (error) {
    errors.push(`${record.file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
if (!missing.length && refs !== expected.footnoteRefs) errors.push(`footnote references ${refs}/${expected.footnoteRefs}`);
if (!missing.length && definitions !== expected.footnoteDefinitions) errors.push(`footnote definitions ${definitions}/${expected.footnoteDefinitions}`);

const packagePath = process.env.L17B_PACKAGE;
if (packagePath) {
  if (!(await exists(packagePath))) errors.push(`package not found: ${packagePath}`);
  else {
    const info = await stat(packagePath);
    const hash = await sha256(packagePath);
    if (info.size !== expected.package.bytes) errors.push(`package byte size ${info.size}/${expected.package.bytes}`);
    if (hash !== expected.package.sha256) errors.push(`package SHA-256 mismatch: ${hash}`);
  }
} else notes.push('package ZIP not supplied; package-byte verification skipped');

const mediaDir = process.env.L17B_MEDIA_DIR;
if (mediaDir) {
  for (const [kind, asset] of Object.entries(expected.assets)) {
    const file = path.join(mediaDir, asset.filename);
    if (!(await exists(file))) { errors.push(`${kind} asset missing: ${asset.filename}`); continue; }
    const info = await stat(file);
    const hash = await sha256(file);
    if (info.size !== asset.bytes) errors.push(`${kind} byte size ${info.size}/${asset.bytes}`);
    if (hash !== asset.sha256) errors.push(`${kind} SHA-256 mismatch: ${hash}`);
  }
} else notes.push('media directory not supplied; PDF/EPUB/cover byte verification skipped');

console.log(`[L17B] reader files ${actualFiles.length}/${expected.expectedReaderFiles}; footnotes ${refs}/${definitions}`);
for (const note of notes) console.log(`[L17B] NOTE ${note}`);
if (errors.length) {
  for (const error of errors) console.error(`[L17B] BLOCK ${error}`);
  process.exit(1);
}
console.log('[L17B] MATERIALIZATION_PAYLOAD_PASS');

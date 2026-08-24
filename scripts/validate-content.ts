import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { workSchema } from '../src/lib/content/schema';

const root = path.join(process.cwd(), 'src/content/works');
const releaseRoot = path.join(process.cwd(), 'src/publications/releases');
const dirs = await readdir(root, { withFileTypes: true });
let works = 0;
let chapters = 0;
let warnings = 0;
const ids = new Set<string>();
const slugs = new Set<string>();
const exists = async (file: string) => { try { await readFile(file); return true; } catch { return false; } };

function parseFrontmatter(raw: string) {
  const match = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error('missing or invalid YAML frontmatter');
  return YAML.parse(match[1] ?? '') as Record<string, unknown>;
}

interface ExpectedRecord {
  id: string;
  title: string;
  order: number;
  part: string | null;
  file: string;
  estimatedMinutes: number;
  sha256?: string;
}
interface ExpectedManifest { expectedReaderFiles: number; records: ExpectedRecord[] }

async function readExpectedManifest(workId: string): Promise<ExpectedManifest | undefined> {
  const recovery = path.join(root, workId, 'recovery');
  for (const filename of ['publication-expected.json', 'l17b-expected.json']) {
    try { return JSON.parse(await readFile(path.join(recovery, filename), 'utf8')) as ExpectedManifest; } catch {}
  }
  return undefined;
}

for (const dir of dirs) {
  if (!dir.isDirectory()) continue;
  const manifestPath = path.join(root, dir.name, 'work.yaml');
  const work = workSchema.parse(YAML.parse(await readFile(manifestPath, 'utf8')));
  if (work.id !== dir.name) throw new Error(`${dir.name}: directory must equal immutable Work ID ${work.id}`);
  if (ids.has(work.id)) throw new Error(`duplicate Work ID: ${work.id}`);
  if (slugs.has(work.slug)) throw new Error(`duplicate Work slug: ${work.slug}`);
  ids.add(work.id); slugs.add(work.slug); works++;

  let chapterFiles: string[] = [];
  try {
    chapterFiles = (await readdir(path.join(root, dir.name, 'chapters'), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.(md|mdx)$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {}
  chapters += chapterFiles.length;

  const expected = await readExpectedManifest(work.id);
  if (expected) {
    const expectedMap = new Map(expected.records.map((record) => [record.file, record]));
    for (const file of chapterFiles) {
      const record = expectedMap.get(file);
      if (!record) throw new Error(`${work.id}: unexpected reader file ${file}`);
      const raw = await readFile(path.join(root, dir.name, 'chapters', file), 'utf8');
      const data = parseFrontmatter(raw);
      if (data.id !== record.id || data.title !== record.title || data.order !== record.order || (data.part ?? null) !== record.part || data.status !== 'published' || data.estimatedMinutes !== record.estimatedMinutes) {
        throw new Error(`${work.id}/${file}: frontmatter does not match its frozen publication manifest`);
      }
      if (record.sha256) {
        const digest = createHash('sha256').update(raw).digest('hex');
        if (digest !== record.sha256.toLowerCase()) throw new Error(`${work.id}/${file}: file hash does not match its frozen publication manifest`);
      }
    }
    if (chapterFiles.length !== expected.expectedReaderFiles) {
      warnings++;
      console.warn(`[content] ${work.id}: reader payload ${chapterFiles.length}/${expected.expectedReaderFiles}; public reader stays disabled`);
    }
  } else if (work.status === 'published' && work.formats.web.enabled && chapterFiles.length === 0) {
    warnings++;
    console.warn(`[content] ${work.id}: published Web format has no chapter payload`);
  }

  if (work.publication.activeRelease && (work.formats.pdf.enabled || work.formats.epub.enabled)) {
    const canonicalRelease = path.join(releaseRoot, work.id, `${work.publication.activeRelease}.yaml`);
    if (!(await exists(canonicalRelease))) {
      warnings++;
      console.warn(`[content] ${work.id}: active binary metadata exists but canonical R2 release registry is not materialized`);
    }
  }
}

console.log(`[content] ${works} work(s), ${chapters} chapter file(s), ${warnings} materialization warning(s)`);

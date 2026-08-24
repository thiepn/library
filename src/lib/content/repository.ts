import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { workSchema, type WorkManifest } from './schema';
import { getChaptersForWork } from './chapters';
import { getActiveRelease, type PublicationRelease } from './releases';

export interface ResolvedWork extends WorkManifest {
  chapterCount: number;
  webMaterialized: boolean;
  releaseMaterialized: boolean;
  release?: PublicationRelease;
}

interface ExpectedReaderManifest {
  expectedReaderFiles: number;
  records: Array<{ file: string }>;
}

const worksRoot = path.join(process.cwd(), 'src/content/works');

async function readExpectedReaderManifest(workId: string): Promise<ExpectedReaderManifest | undefined> {
  const recoveryRoot = path.join(worksRoot, workId, 'recovery');
  for (const filename of ['publication-expected.json', 'l17b-expected.json']) {
    try {
      return JSON.parse(await readFile(path.join(recoveryRoot, filename), 'utf8')) as ExpectedReaderManifest;
    } catch {}
  }
  return undefined;
}

async function isWebPayloadComplete(work: WorkManifest, actualFiles: string[]) {
  if (!work.formats.web.enabled || actualFiles.length === 0) return false;
  const expected = await readExpectedReaderManifest(work.id);
  if (!expected) return true;
  if (actualFiles.length !== expected.expectedReaderFiles) return false;
  const expectedFiles = new Set(expected.records.map((record) => record.file));
  return actualFiles.every((file) => expectedFiles.has(file)) && expectedFiles.size === actualFiles.length;
}

export async function getWorks(): Promise<ResolvedWork[]> {
  const dirs = await readdir(worksRoot, { withFileTypes: true });
  const works: ResolvedWork[] = [];
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const file = path.join(worksRoot, dir.name, 'work.yaml');
    try {
      const raw = YAML.parse(await readFile(file, 'utf8'));
      const work = workSchema.parse(raw);
      if (work.visibility !== 'public' || !['published', 'archived'].includes(work.status)) continue;
      const chapters = await getChaptersForWork(work.id);
      const actualFiles = chapters.map((chapter) => chapter.fileName);
      const release = await getActiveRelease(work);
      works.push({
        ...work,
        chapterCount: chapters.length,
        webMaterialized: await isWebPayloadComplete(work, actualFiles),
        releaseMaterialized: Boolean(release),
        ...(release ? { release } : {}),
      });
    } catch (error) {
      throw new Error(`Invalid work manifest: ${dir.name}/work.yaml`, { cause: error });
    }
  }
  return works.sort((a, b) => new Date(String(b.publication.lastUpdated)).getTime() - new Date(String(a.publication.lastUpdated)).getTime() || a.title.localeCompare(b.title));
}

export async function getWorkBySlug(slug: string) {
  return (await getWorks()).find((work) => work.slug === slug);
}

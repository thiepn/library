import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { workSchema, type WorkManifest } from './schema';

export interface ResolvedWork extends WorkManifest {
  chapterCount: number;
  webMaterialized: boolean;
  releaseMaterialized: boolean;
}

const worksRoot = path.join(process.cwd(), 'src/content/works');

async function chapterCount(workId: string) {
  try {
    const entries = await readdir(path.join(worksRoot, workId, 'chapters'), { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && /\.(md|mdx)$/i.test(entry.name)).length;
  } catch {
    return 0;
  }
}

async function hasActiveRelease(work: WorkManifest) {
  try {
    await readFile(path.join(worksRoot, work.id, 'releases', `${work.publication.activeRelease}.yaml`), 'utf8');
    return true;
  } catch {
    return false;
  }
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
      const count = await chapterCount(work.id);
      works.push({
        ...work,
        chapterCount: count,
        webMaterialized: work.formats.web.enabled && count > 0,
        releaseMaterialized: false && await hasActiveRelease(work),
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

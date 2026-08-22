import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { workSchema } from '../src/lib/content/schema';

const root = path.join(process.cwd(), 'src/content/works');
const dirs = await readdir(root, { withFileTypes: true });
let works = 0;
let chapters = 0;
let warnings = 0;
const ids = new Set<string>();
const slugs = new Set<string>();

for (const dir of dirs) {
  if (!dir.isDirectory()) continue;
  const manifestPath = path.join(root, dir.name, 'work.yaml');
  const work = workSchema.parse(YAML.parse(await readFile(manifestPath, 'utf8')));
  if (work.id !== dir.name) throw new Error(`${dir.name}: directory must equal immutable Work ID ${work.id}`);
  if (ids.has(work.id)) throw new Error(`duplicate Work ID: ${work.id}`);
  if (slugs.has(work.slug)) throw new Error(`duplicate Work slug: ${work.slug}`);
  ids.add(work.id); slugs.add(work.slug); works++;
  let count = 0;
  try {
    const entries = await readdir(path.join(root, dir.name, 'chapters'), { withFileTypes: true });
    count = entries.filter((entry) => entry.isFile() && /\.(md|mdx)$/i.test(entry.name)).length;
  } catch {}
  chapters += count;
  if (work.status === 'published' && work.formats.web.enabled && count === 0) {
    warnings++;
    console.warn(`[content] ${work.id}: validated metadata is present but Web chapter payload is not materialized`);
  }
  const releasePath = path.join(root, dir.name, 'releases', `${work.publication.activeRelease}.yaml`);
  const release = YAML.parse(await readFile(releasePath, 'utf8'));
  if (release.workId !== work.id || release.version !== work.publication.activeRelease || release.immutable !== true) throw new Error(`${work.id}: invalid active release record`);
}

console.log(`[content] ${works} work(s), ${chapters} chapter file(s), ${warnings} recovery warning(s)`);

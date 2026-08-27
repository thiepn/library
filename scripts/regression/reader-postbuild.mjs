import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';

const root = path.join(process.cwd(), 'dist', 'library');
const worksSource = path.join(process.cwd(), 'src', 'content', 'works');
const releasesSource = path.join(process.cwd(), 'src', 'publications', 'releases');

const exists = async (file) => {
  try { await access(file); return true; } catch { return false; }
};

async function collectChapterPages(readerRoot) {
  if (!(await exists(readerRoot))) return [];
  const pages = [];
  const stack = [readerRoot];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name === 'index.html' && full !== path.join(readerRoot, 'index.html')) pages.push(full);
    }
  }
  return pages;
}

async function hasActiveEpub(work) {
  const version = work.publication?.activeRelease;
  if (!version || !work.formats?.epub?.enabled) return false;
  const file = path.join(releasesSource, work.id, `${version}.yaml`);
  if (!(await exists(file))) return false;
  const release = YAML.parse(await readFile(file, 'utf8'));
  return release?.workId === work.id
    && release?.version === version
    && release?.edition === work.publication?.edition
    && typeof release?.artifacts?.epub?.url === 'string';
}

let checkedWorks = 0;
let checkedLegacyPages = 0;

for (const entry of await readdir(worksSource, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const work = YAML.parse(await readFile(path.join(worksSource, entry.name, 'work.yaml'), 'utf8'));
  if (work.visibility !== 'public' || !['published', 'archived'].includes(work.status)) continue;
  if (!work.formats?.web?.enabled) continue;

  checkedWorks += 1;
  const readerRoot = path.join(root, 'works', work.slug, 'read');
  const launcherPath = path.join(readerRoot, 'index.html');
  if (!(await exists(launcherPath))) throw new Error(`READER_REGRESSION_BLOCKED missing canonical reader route for ${work.id}`);

  const launcher = await readFile(launcherPath, 'utf8');
  const native = await hasActiveEpub(work);
  if (native) {
    if (!launcher.includes('data-reader-shell') || !launcher.includes('data-reader-publication')) {
      throw new Error(`READER_REGRESSION_BLOCKED ${work.id} active EPUB did not build the native reader shell`);
    }
  } else if (!launcher.includes('data-reader-launch')) {
    throw new Error(`READER_REGRESSION_BLOCKED ${work.id} legacy publication did not build the saved-position launcher`);
  }

  const chapterPages = await collectChapterPages(readerRoot);
  for (const chapterPath of chapterPages) {
    checkedLegacyPages += 1;
    const html = await readFile(chapterPath, 'utf8');
    if (!html.includes(`data-work-id="${work.id}"`) || !html.includes('data-chapter-id=')) {
      throw new Error(`READER_REGRESSION_BLOCKED legacy chapter identity missing in ${chapterPath}`);
    }

    if (native) {
      if (!html.includes('Legacy web reader')
        || !html.includes('content="noindex,follow"')
        || !html.includes(`https://thiepn.dev/library/works/${work.slug}/read`)
        || !html.includes('Open current reader')) {
        throw new Error(`READER_REGRESSION_BLOCKED migrated legacy chapter lost the P29 forward bridge in ${chapterPath}`);
      }
    } else if (html.includes('Legacy web reader')) {
      throw new Error(`READER_REGRESSION_BLOCKED Markdown-primary work ${work.id} was incorrectly demoted to compatibility UI`);
    }
  }
}

if (checkedWorks === 0) throw new Error('READER_REGRESSION_BLOCKED no public web-readable works were exercised');
if (checkedLegacyPages === 0) throw new Error('READER_REGRESSION_BLOCKED no historical chapter routes were exercised');

const offline = path.join(root, 'offline', 'index.html');
const worker = path.join(root, 'service-worker.js');
if (!(await exists(offline)) || !(await exists(worker))) {
  throw new Error('READER_REGRESSION_BLOCKED P28 offline recovery assets disappeared from the built reader application');
}

console.log(`READER_REGRESSION_POSTBUILD_PASS works=${checkedWorks} legacyPages=${checkedLegacyPages}`);

import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/client/personal-books.ts',
  'src/pages/saved.astro',
  'src/pages/personal/read.astro',
  'src/pages/personal/pdf.astro',
  'src/styles/personal-library.css',
  'src/pages/privacy.astro',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('PERSONAL_IMPORT_ER2_FILES', present, 'ER2 local personal-book storage, library UI, EPUB/PDF routes, styles, and privacy copy are present');

if (present) {
  const storage = await readFile('src/lib/client/personal-books.ts', 'utf8');
  const saved = await readFile('src/pages/saved.astro', 'utf8');
  const epub = await readFile('src/pages/personal/read.astro', 'utf8');
  const pdf = await readFile('src/pages/personal/pdf.astro', 'utf8');
  const css = await readFile('src/styles/personal-library.css', 'utf8');
  const privacy = await readFile('src/pages/privacy.astro', 'utf8');

  pass(
    'PERSONAL_IMPORT_ER2_ISOLATED_DB',
    storage.includes("PERSONAL_DB_NAME = 'thiepn-library-personal-books'")
      && storage.includes("PERSONAL_STORE = 'books'")
      && !storage.includes("PERSONAL_DB_NAME = 'thiepn-library'"),
    'Large personal publication blobs use a dedicated IndexedDB database instead of changing the mature reading-state database',
  );
  pass(
    'PERSONAL_IMPORT_ER2_LOCAL_BLOB',
    storage.includes('file: Blob')
      && storage.includes('file: new Blob([buffer]')
      && storage.includes('store.put(record)'),
    'Imported publication bytes are retained locally as browser Blob data',
  );
  pass(
    'PERSONAL_IMPORT_ER2_FORMATS',
    storage.includes("PersonalBookFormat = 'epub' | 'pdf'")
      && saved.includes('accept=".epub,.pdf,application/epub+zip,application/pdf"'),
    'ER2 accepts EPUB and PDF explicitly and does not imply support for unrelated formats',
  );
  pass(
    'PERSONAL_IMPORT_ER2_CONTENT_IDENTITY',
    storage.includes("crypto.subtle.digest('SHA-256'")
      && storage.includes("const id = `${format}-${digest.slice(0, 32)}`")
      && storage.includes('local-${book.sha256}'),
    'Personal books are content-addressed and exact bytes provide the native-reader version identity',
  );
  pass(
    'PERSONAL_IMPORT_ER2_DUPLICATE_SAFE',
    storage.includes('existing?.sha256 === digest')
      && storage.includes('duplicate: true'),
    'Re-importing identical bytes deduplicates rather than creating silent duplicate copies',
  );
  pass(
    'PERSONAL_IMPORT_ER2_EPUB_METADATA',
    storage.includes("import ePub from 'epubjs'")
      && storage.includes('const book = ePub(buffer)')
      && storage.includes('book.loaded.metadata')
      && storage.includes('book.coverUrl()'),
    'EPUB title, creator, language, and optional cover are extracted locally through the existing EPUB dependency',
  );
  pass(
    'PERSONAL_IMPORT_ER2_COVER_NETWORK_GUARD',
    storage.includes("coverUrl.startsWith('blob:') || coverUrl.startsWith('data:')"),
    'EPUB cover extraction refuses arbitrary remote cover URLs from untrusted imported publications',
  );
  pass(
    'PERSONAL_IMPORT_ER2_LIBRARY_UX',
    saved.includes('Choose EPUB or PDF')
      && saved.includes('data-personal-drop')
      && saved.includes('multiple hidden')
      && saved.includes('Files stay in this browser')
      && saved.includes('getPersonalBooks')
      && saved.includes('deletePersonalBook'),
    'My Library exposes explicit multi-file choice, drag/drop, local-only disclosure, listing, and removal',
  );
  pass(
    'PERSONAL_IMPORT_ER2_UNTRUSTED_METADATA_TEXT',
    saved.includes('title.textContent = book.title')
      && saved.includes('creator.textContent = book.creator')
      && !saved.includes('innerHTML = book.title')
      && !saved.includes('innerHTML = book.creator'),
    'Untrusted imported title/creator metadata is rendered as text rather than executable HTML',
  );
  pass(
    'PERSONAL_IMPORT_ER2_EPUB_NATIVE_READER',
    epub.includes('mountReaderShellHarness')
      && epub.includes('const source = await book.file.arrayBuffer()')
      && epub.includes('workId: personalReaderWorkId(book)')
      && epub.includes('releaseVersion: personalReaderReleaseVersion(book)')
      && epub.includes('edition: 1'),
    'Personal EPUBs open from local bytes through the existing native reader with exact content-bound progress identity',
  );
  pass(
    'PERSONAL_IMPORT_ER2_PDF_LOCAL_URL',
    pdf.includes('URL.createObjectURL(book.file)')
      && pdf.includes('URL.revokeObjectURL(objectUrl)')
      && pdf.includes('browser PDF viewer'),
    'ER2 personal PDFs use a revocable local Blob URL and honestly defer integrated PDF reading to ER4',
  );
  pass(
    'PERSONAL_IMPORT_ER2_OBJECT_URL_CLEANUP',
    saved.includes('URL.revokeObjectURL(url)')
      && epub.includes("window.addEventListener('pagehide'")
      && pdf.includes("window.addEventListener('pagehide'"),
    'Temporary personal-book object/runtime resources have explicit lifecycle cleanup',
  );
  pass(
    'PERSONAL_IMPORT_ER2_STORAGE_FAILURE',
    storage.includes('QuotaExceededError')
      && storage.includes('Not enough browser storage')
      && saved.includes('Local library unavailable'),
    'Quota and unavailable-storage failures are surfaced rather than misrepresented as an empty successful library',
  );
  pass(
    'PERSONAL_IMPORT_ER2_PRIVACY_COPY',
    privacy.includes('does not upload the personal book to a server')
      && privacy.includes('local IndexedDB storage')
      && privacy.includes('Clearing browser site data can remove locally imported books'),
    'Privacy documentation explains local storage, no upload, and the browser-data-loss boundary',
  );
  pass(
    'PERSONAL_IMPORT_ER2_RESPONSIVE',
    css.includes('@media (max-width: 700px)')
      && css.includes('@media (max-width: 420px)')
      && css.includes('@media (forced-colors: active)'),
    'Personal import/library surfaces adapt to phone layouts and forced-colors mode',
  );
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('PERSONAL_IMPORT_SOURCE_PASS');

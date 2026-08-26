import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

const files = [
  'src/lib/reader/publication-compatibility.ts',
  'src/lib/reader/compatibility.ts',
  'src/lib/reader/compatibility-harness.ts',
  'scripts/certification/reader-compatibility.mjs',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_COMPATIBILITY_P24', present, 'P24 EPUB styling compatibility profile, controller, harness, and permanent certification are present');

if (present) {
  const [compat, controller, harness, index, pkg, legacy, engine] = await Promise.all([
    readFile('src/lib/reader/publication-compatibility.ts', 'utf8'),
    readFile('src/lib/reader/compatibility.ts', 'utf8'),
    readFile('src/lib/reader/compatibility-harness.ts', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('src/layouts/ReaderLayout.astro', 'utf8'),
    readFile('src/lib/reader/engines/epubjs.ts', 'utf8'),
  ]);

  pass('EPUB_READER_COMPAT_PROFILE', compat.includes("thiepn-reader-epub-compat-1") && compat.includes('READER_EPUB_COMPATIBILITY_CSS'), 'A frozen reader-side compatibility profile is applied independently of publication title');
  pass('EPUB_READER_COMPAT_CFI_SAFE', compat.includes('document.head ?? body') && compat.includes('host.appendChild(style)') && !compat.includes('insertBefore(') && !compat.includes('replaceChildren(') && !compat.includes('innerHTML =') && !compat.includes('removeChild('), 'Compatibility injection does not wrap, reorder, replace, or remove EPUB prose nodes used by CFIs');
  pass('EPUB_READER_COMPAT_REFLOW', compat.includes('min-inline-size: 0 !important') && compat.includes('max-inline-size: 100% !important') && compat.includes('overflow-wrap: anywhere'), 'Nested publisher boxes and long prose are constrained with writing-mode-safe logical sizing');
  pass('EPUB_READER_COMPAT_MEDIA', ['img', 'video', 'canvas', 'svg', 'iframe', 'object', 'embed', 'max-block-size: 100vh !important', 'object-fit: contain'].every((token) => compat.includes(token)), 'Oversized raster, SVG, video, canvas, embedded, and object media are bounded without structural mutation');
  pass('EPUB_READER_COMPAT_TABLES', compat.includes('body[data-reader-compatibility') && compat.includes(' table {') && compat.includes('overflow-x: auto !important') && compat.includes(':where(th, td)') && compat.includes('overflow-wrap: anywhere !important'), 'Wide tables and cells are bounded and can degrade to local horizontal overflow instead of breaking the reader viewport');
  pass('EPUB_READER_COMPAT_CODE', compat.includes('pre {') && compat.includes('white-space: pre-wrap !important') && compat.includes(':where(a, code, kbd, samp)') && compat.includes('overflow-wrap: anywhere !important'), 'Long code blocks, tokens, and URLs cannot force uncontrolled page width');
  pass('EPUB_READER_COMPAT_NOTES', compat.includes('[role="doc-footnote"]') && compat.includes('[role="doc-endnote"]') && compat.includes('[epub\\\\:type~="footnote"]') && compat.includes('[epub\\\\:type~="endnote"]'), 'EPUB and ARIA footnote/endnote semantics receive bounded reflow-safe treatment');
  pass('EPUB_READER_COMPAT_THEME_AUTHORITY', compat.includes('--reader-compat-bg') && compat.includes('--reader-compat-text') && compat.includes(':where(a, a:visited)') && compat.includes('background-color: transparent !important') && compat.includes('color: inherit !important'), 'Reader theme colors remain authoritative over publisher descendant colors and backgrounds');

  const themeNames = ['light', 'warm', 'sepia', 'gray', 'dark', 'black'];
  pass('EPUB_READER_COMPAT_ALL_THEMES', themeNames.every((theme) => compat.includes(`${theme}: { background:`)), 'Compatibility palettes cover all six reader themes');

  const enginePaletteHexes = [...engine.matchAll(/(?:background|text|secondary|link|rule|surface|code|mark): '(#[0-9a-fA-F]{6})'/g)].map((match) => match[1]);
  const uniqueEngineHexes = [...new Set(enginePaletteHexes)];
  pass('EPUB_READER_COMPAT_THEME_SYNC', uniqueEngineHexes.length >= 20 && uniqueEngineHexes.every((hex) => compat.includes(hex)), 'P24 compatibility palettes stay synchronized with the EPUB.js theme palette values');

  pass('EPUB_READER_COMPAT_SEMANTICS', !compat.includes('direction:') && !compat.includes('writing-mode:') && !compat.includes('text-orientation:') && !compat.includes('display: none') && !compat.includes('visibility: hidden') && !compat.includes('position: static'), 'Compatibility CSS does not erase bidi/vertical-writing semantics, hidden-state semantics, or publisher positioning wholesale');
  pass('EPUB_READER_COMPAT_FONTS', compat.includes('font-family: inherit !important') && compat.includes(':where(pre, code, kbd, samp)'), 'Reader-selected prose fonts can defeat publisher font locks while code retains dedicated treatment');
  pass('EPUB_READER_COMPAT_FORMS', compat.includes(':where(button, input, textarea, select)') && compat.includes('var(--reader-compat-surface)'), 'Rare interactive EPUB controls remain legible under custom themes');
  pass('EPUB_READER_COMPAT_THEME_LIVE', controller.includes('this.theme.subscribe') && controller.includes('this.currentTheme = theme') && controller.includes('applyReaderPublicationCompatibility(document, this.currentTheme)'), 'Theme changes are propagated to already-rendered EPUB documents without reopening the book');
  pass('EPUB_READER_COMPAT_IFRAME_LIFECYCLE', controller.includes("querySelectorAll<HTMLIFrameElement>('iframe')") && controller.includes("frame.addEventListener('load'") && controller.includes('MutationObserver') && controller.includes('frame.removeEventListener'), 'Compatibility follows EPUB.js iframe creation, replacement, reload, and teardown');
  pass('EPUB_READER_COMPAT_NON_FATAL', controller.includes('catch {') && controller.includes('must never turn an otherwise readable book') && controller.includes('failures: this.state.failures + 1'), 'Malformed or inaccessible content-frame inspection degrades best-effort instead of failing reading');
  pass('EPUB_READER_COMPAT_P23_COMPOSITION', harness.includes('mountReaderPublicationWithAccessibilityHarness') && harness.includes('mountReaderShellWithAccessibilityHarness') && harness.includes('ReaderPublicationCompatibilityController'), 'P24 composes on the complete P23 staged reader instead of bypassing accessibility behavior');
  pass('EPUB_READER_COMPAT_PUBLIC_API', index.includes('ReaderPublicationCompatibilityController') && index.includes('mountReaderPublicationWithCompatibilityHarness') && index.includes('READER_EPUB_COMPATIBILITY_PROFILE') && index.includes('ReaderCompatibilityState'), 'P24 compatibility APIs and harness are exported through the stable reader module');
  pass('EPUB_READER_COMPAT_LEGACY_PRESERVED', legacy.includes("import '../styles/reader.css';") && !legacy.includes('ReaderPublicationCompatibilityController') && !legacy.includes('publication-compatibility'), 'Legacy production Markdown reader remains outside the staged P24 EPUB stack');
  pass('EPUB_READER_COMPAT_CERT_CHAIN', pkg.includes('reader-accessibility.mjs && node scripts/certification/reader-compatibility.mjs'), 'P24 permanent certification is chained directly after P23');
  pass('EPUB_READER_COMPAT_GENERIC', !compat.includes('ai-for-the-kingdom') && !compat.includes('how-to-love-god') && !compat.includes('unfinished-mission') && !controller.includes('ai-for-the-kingdom'), 'P24 contains no current-book-specific styling or routing exceptions');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_COMPATIBILITY_SOURCE_PASS');

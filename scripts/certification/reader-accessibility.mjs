import { access, readFile } from 'node:fs/promises';

const checks = [];
const pass = (id, ok, detail) => checks.push({ id, ok, detail });
const exists = async (file) => { try { await access(file); return true; } catch { return false; } };

function channel(value) {
  const n = value / 255;
  return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const value = hex.replace('#', '');
  const r = channel(Number.parseInt(value.slice(0, 2), 16));
  const g = channel(Number.parseInt(value.slice(2, 4), 16));
  const b = channel(Number.parseInt(value.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function themeVariables(css, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`\\.reader-shell\\[data-reader-theme="${escaped}"\\][^{]*\\{([\\s\\S]*?)\\}`));
  if (!match) return null;
  const block = match[1];
  const read = (variable) => block.match(new RegExp(`--${variable}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  return {
    bg: read('reader-shell-bg'),
    ink: read('reader-shell-ink'),
    secondary: read('reader-shell-secondary'),
    accent: read('reader-shell-accent'),
    danger: read('reader-shell-danger'),
  };
}

const files = [
  'src/lib/reader/accessibility.ts',
  'src/lib/reader/accessibility-harness.ts',
  'src/styles/reader-accessibility.css',
  'scripts/certification/reader-accessibility.mjs',
];
const present = (await Promise.all(files.map(exists))).every(Boolean);
pass('EPUB_READER_ACCESSIBILITY_P23', present, 'P23 accessibility subsystem and permanent certification are present');

if (present) {
  const [a11y, harness, css, shellComponent, shellController, mobileCss, desktopCss, themesCss, layout, index, legacyLayout, pkg] = await Promise.all([
    readFile('src/lib/reader/accessibility.ts', 'utf8'),
    readFile('src/lib/reader/accessibility-harness.ts', 'utf8'),
    readFile('src/styles/reader-accessibility.css', 'utf8'),
    readFile('src/components/reader/ReaderShell.astro', 'utf8'),
    readFile('src/lib/reader/shell.ts', 'utf8'),
    readFile('src/styles/reader-mobile.css', 'utf8'),
    readFile('src/styles/reader-desktop.css', 'utf8'),
    readFile('src/styles/reader-themes.css', 'utf8'),
    readFile('src/layouts/EpubReaderLayout.astro', 'utf8'),
    readFile('src/lib/reader/index.ts', 'utf8'),
    readFile('src/layouts/ReaderLayout.astro', 'utf8'),
    readFile('package.json', 'utf8'),
  ]);

  pass('EPUB_READER_A11Y_KEYBOARD', a11y.includes('aria-keyshortcuts') && a11y.includes('ArrowLeft ArrowRight PageUp PageDown Space Shift+Space') && shellController.includes("event.key !== 'Escape'"), 'Keyboard page-turn shortcuts and Escape handling remain discoverable and operable');
  pass('EPUB_READER_A11Y_FOCUS_VISIBLE', css.includes(':focus-visible') && css.includes('outline: 3px solid var(--reader-shell-accent)') && css.includes('scroll-margin: 14px'), 'Strong focus indicators remain visible and are given scroll clearance');
  pass('EPUB_READER_A11Y_TARGET_SIZE', css.includes('min-block-size: 24px') && mobileCss.includes('min-width: 48px') && mobileCss.includes('min-height: 48px'), 'WCAG 2.2 minimum target size is enforced while touch controls retain larger mobile targets');
  pass('EPUB_READER_A11Y_DIALOG_MODALITY', a11y.includes('readerDialogIsModal') && a11y.includes('data-reader-dock-side') && a11y.includes("panel.setAttribute('aria-modal', 'true')") && a11y.includes("panel.removeAttribute('aria-modal')"), 'Overlay dialogs are modal while P22 docked panels remain non-modal sidebars');
  pass('EPUB_READER_A11Y_FOCUS_TRAP', a11y.includes('trapReaderDialogFocus') && a11y.includes("event.key !== 'Tab'") && a11y.includes('event.stopImmediatePropagation()'), 'Overlay dialogs contain keyboard focus without trapping docked panels');
  pass('EPUB_READER_A11Y_POPOVERS', a11y.includes("[data-reader-appearance-panel]") && a11y.includes("[data-reader-mode-panel]") && a11y.includes("panel.setAttribute('role', 'dialog')") && a11y.includes('panel.focus({ preventScroll: true })'), 'Appearance and reading-mode popovers receive named dialog semantics and deterministic focus entry');
  pass('EPUB_READER_A11Y_FOCUS_RECOVERY', a11y.includes('recoverFocus') && a11y.includes('syncHiddenControlFocus') && a11y.includes('this.shell.viewport.focus'), 'Closing panels and hiding chrome cannot strand focus in hidden or inert reader UI');
  pass('EPUB_READER_A11Y_EPUB_FRAME', a11y.includes('frame.title =') && a11y.includes("getAttribute('xml:lang')") && a11y.includes('readerA11yStyle') && a11y.includes(':focus { outline: 3px solid currentColor'), 'EPUB iframes are named and receive language/focus/reduced-motion accessibility hardening');
  pass('EPUB_READER_A11Y_LIVE_STATUS', shellComponent.includes('data-reader-announcer') && shellComponent.includes('aria-atomic="true"') && a11y.includes('controller.onSelection') && a11y.includes('this.shell.announce'), 'Deliberate reader, selection, and location changes use a polite atomic status channel');
  pass('EPUB_READER_A11Y_REDUCED_MOTION', a11y.includes("safeMatchMedia('(prefers-reduced-motion: reduce)')") && css.includes('@media (prefers-reduced-motion: reduce)') && css.includes('animation-duration: 0.01ms !important'), 'Reduced-motion preference is represented in runtime state and enforced in shell/EPUB content');
  pass('EPUB_READER_A11Y_FORCED_COLORS', a11y.includes("safeMatchMedia('(forced-colors: active)')") && css.includes('@media (forced-colors: active)') && css.includes('outline: 3px solid Highlight !important'), 'Forced-colors mode preserves system focus and boundary colors');
  pass('EPUB_READER_A11Y_HIGH_CONTRAST', a11y.includes("safeMatchMedia('(prefers-contrast: more)')") && css.includes('@media (prefers-contrast: more)') && css.includes('--reader-shell-rule: var(--reader-shell-secondary)'), 'Higher-contrast preference strengthens separators and panel boundaries');
  pass('EPUB_READER_A11Y_REFLOW_400', css.includes('@media (max-width: 320px)') && css.includes('grid-template-columns: 40px 0 minmax(0, 1fr)') && css.includes('max-width: 100%') && mobileCss.includes('pinch-zoom'), 'Reader chrome has a dedicated 320-CSS-pixel reflow path and does not disable pinch zoom');
  pass('EPUB_READER_A11Y_MUTED_TEXT', css.includes('--reader-shell-muted: var(--reader-shell-secondary)'), 'Muted shell text inherits an AA-capable normal-text color instead of low-contrast decorative gray');

  const themeNames = ['light', 'warm', 'sepia', 'gray', 'dark', 'black'];
  const contrastResults = themeNames.map((name) => {
    const vars = themeVariables(themesCss, name);
    if (!vars || Object.values(vars).some((value) => !value)) return { name, ok: false, minimum: 0 };
    const ratios = [vars.ink, vars.secondary, vars.accent, vars.danger].map((color) => contrast(vars.bg, color));
    return { name, ok: ratios.every((ratio) => ratio >= 4.5), minimum: Math.min(...ratios) };
  });
  pass('EPUB_READER_A11Y_THEME_CONTRAST', contrastResults.every((result) => result.ok), `All six shell themes keep audited normal-text/accent colors at >=4.5:1; minimum ${Math.min(...contrastResults.map((result) => result.minimum)).toFixed(2)}:1`);

  pass('EPUB_READER_A11Y_EXISTING_FOUNDATIONS', layout.includes('reader-skip-link') && shellComponent.includes('role="alert"') && shellComponent.includes('aria-busy="true"') && desktopCss.includes('@media (hover: hover) and (pointer: fine)'), 'Skip navigation, busy/error semantics, and input-modality foundations remain present');
  pass('EPUB_READER_A11Y_HARNESS', harness.includes('mountReaderPublicationWithAccessibilityHarness') && harness.includes('mountReaderPublicationWithDesktopHarness') && harness.includes('ReaderAccessibilityController'), 'P23 composes on top of the complete P22 staged reader');
  pass('EPUB_READER_A11Y_PUBLIC_API', index.includes('ReaderAccessibilityController') && index.includes('ReaderAccessibilityState') && index.includes('ReaderAccessibilityHarnessHandle'), 'P23 accessibility APIs are exported');
  pass('EPUB_READER_A11Y_LAYER_ORDER', layout.includes("../styles/reader-desktop.css") && layout.includes("../styles/reader-accessibility.css") && layout.indexOf('reader-accessibility.css') > layout.indexOf('reader-desktop.css'), 'Accessibility CSS is the final staged-reader override layer');
  pass('EPUB_READER_A11Y_LEGACY_PRESERVED', legacyLayout.includes("import '../styles/reader.css';") && !legacyLayout.includes('ReaderAccessibilityController') && !legacyLayout.includes('reader-accessibility.css'), 'Legacy production reader remains outside the staged P23 stack');
  pass('EPUB_READER_A11Y_CERT_CHAIN', pkg.includes('reader-desktop.mjs && node scripts/certification/reader-accessibility.mjs'), 'P23 certification is chained after P22');
}

for (const check of checks) console.log(`${check.ok ? 'PASS' : 'BLOCK'} ${check.id} — ${check.detail}`);
const failures = checks.filter((check) => !check.ok);
if (failures.length) process.exit(1);
console.log('READER_ACCESSIBILITY_SOURCE_PASS');

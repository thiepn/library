from pathlib import Path

path = Path('tests/e2e/reader-tap-zones.spec.ts')
text = path.read_text()
old = """  const pageX = viewportBox.x + viewportBox.width * xRatio;
  const candidates = [preferredYRatio, ...SAFE_TAP_Y_RATIOS.filter((ratio) => ratio !== preferredYRatio)];
  const inspected: string[] = [];

  for (const yRatio of candidates) {
    const pageY = viewportBox.y + viewportBox.height * yRatio;
    const frameX = pageX - iframeBox.x;
    const frameY = pageY - iframeBox.y;
"""
new = """  const pageX = viewportBox.x + viewportBox.width * xRatio;
  const candidates = [preferredYRatio, ...SAFE_TAP_Y_RATIOS.filter((ratio) => ratio !== preferredYRatio)];
  const inspected: string[] = [];
  const shell = page.locator('[data-reader-shell]');
  const [locationPageRaw, locationTotalRaw] = await Promise.all([
    shell.getAttribute('data-reader-location-page'),
    shell.getAttribute('data-reader-location-total'),
  ]);
  const locationPage = Number.parseInt(locationPageRaw ?? '', 10);
  const locationTotal = Number.parseInt(locationTotalRaw ?? '', 10);
  const pageStride = locationTotal >= 2 ? iframeBox.width / locationTotal : 0;
  const geometryTolerance = Math.max(3, viewportBox.width * 0.03);
  const unshiftedMultiPageStrip = Number.isFinite(locationPage)
    && locationPage >= 1
    && locationPage <= locationTotal
    && iframeBox.width > viewportBox.width * 1.25
    && Math.abs(pageStride - viewportBox.width) <= geometryTolerance
    && Math.abs(iframeBox.x - viewportBox.x) <= geometryTolerance;

  for (const yRatio of candidates) {
    const pageY = viewportBox.y + viewportBox.height * yRatio;
    // A hosted paginated EPUB can keep one wide iframe anchored to the viewport while
    // displaying a later column from that strip. Probe the actually displayed column so
    // publication links retain precedence over reader tap-zone gestures.
    const frameX = pageX - iframeBox.x
      + (unshiftedMultiPageStrip ? (locationPage - 1) * pageStride : 0);
    const frameY = pageY - iframeBox.y;
"""
count = text.count(old)
if count != 1:
    raise SystemExit(f'expected exactly one tap-probe block, found {count}')
path.write_text(text.replace(old, new, 1))

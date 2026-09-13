from pathlib import Path

path = Path("src/lib/reader/engines/epubjs.ts")
text = path.read_text()
start_anchor = "/**\n * Prefer iframe-local touch coordinates whenever they still fall inside the visible content"
end_anchor = "\nfunction mapLocation(location: EpubLocation): ReaderLocation {"
start = text.find(start_anchor)
end = text.find(end_anchor, start)
if start < 0 or end < 0:
    raise SystemExit("expected touchTapXRatio block not found; refusing non-exact recovery")

replacement = '''const TOUCH_GEOMETRY_TOLERANCE_PX = 2;

/**
 * Normalize touch coordinates against the actually visible slice of a translated EPUB iframe.
 * EPUB.js may render a section-wide multi-column iframe that is much wider than the reader and
 * shift it left as pages advance. Chromium/WebKit can then report touch clientX either in full
 * iframe coordinates or relative to the clipped visible slice. Resolve both coordinate spaces
 * against the parent reader viewport before falling back to physical screen/local geometry.
 */
function touchTapXRatio(
  win: Window,
  doc: Document,
  clientX: number,
  screenX: number | undefined,
  pointerType: ReaderPointerType,
): number {
  const localWidth = Math.max(1, win.innerWidth || doc.documentElement?.clientWidth || 1);
  const localRatio = clampRatio(clientX / localWidth);
  if (pointerType !== 'touch') return localRatio;

  try {
    const frame = win.frameElement;
    const viewport = frame instanceof Element
      ? frame.closest<HTMLElement>('[data-reader-viewport]')
      : null;
    if (frame && viewport) {
      const frameRect = frame.getBoundingClientRect();
      const viewportRect = viewport.getBoundingClientRect();
      const visibleLeft = Math.max(frameRect.left, viewportRect.left);
      const visibleRight = Math.min(frameRect.right, viewportRect.right);
      const visibleWidth = visibleRight - visibleLeft;

      if (Number.isFinite(visibleWidth) && visibleWidth > 0) {
        const parentX = frameRect.left + clientX;
        if (
          parentX >= visibleLeft - TOUCH_GEOMETRY_TOLERANCE_PX
          && parentX <= visibleRight + TOUCH_GEOMETRY_TOLERANCE_PX
        ) {
          return clampRatio((parentX - visibleLeft) / visibleWidth);
        }

        // Some engines expose clientX relative to the clipped slice rather than the full iframe.
        // Accept that space only when full-frame conversion falls outside the visible intersection.
        if (
          clientX >= -TOUCH_GEOMETRY_TOLERANCE_PX
          && clientX <= visibleWidth + TOUCH_GEOMETRY_TOLERANCE_PX
        ) {
          return clampRatio(clientX / visibleWidth);
        }
      }
    }
  } catch {
    // Cross-frame geometry is best-effort; retain the established physical/local fallbacks.
  }

  if (typeof screenX === 'number' && Number.isFinite(screenX) && screenX > 0) {
    const screenWidth = Number(win.screen?.width);
    if (Number.isFinite(screenWidth) && screenWidth > 1 && screenX <= screenWidth) {
      return clampRatio(screenX / screenWidth);
    }
  }

  return localRatio;
}
'''

path.write_text(text[:start] + replacement + text[end:])

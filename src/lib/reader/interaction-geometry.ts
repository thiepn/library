export interface ReaderVisiblePoint {
  xRatio: number;
  yRatio: number;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function positive(value: number, fallback = 1): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Convert an event coordinate from an EPUB iframe's own layout viewport into the outer reader
 * viewport the user can actually see.
 *
 * EPUB.js may make one iframe many page-widths wide and translate it underneath a clipped reader
 * viewport. In that case `event.clientX / iframe.innerWidth` is chapter-relative, not screen-
 * relative. `getBoundingClientRect()` puts the transformed iframe and reader viewport in the same
 * top-level coordinate space, so the conversion is deterministic and does not need page-number
 * heuristics.
 */
export function mapFrameClientPointToVisibleViewport(
  frame: Element | null,
  frameWindow: Window | null,
  viewport: Element | null,
  clientX: number,
  clientY: number,
): ReaderVisiblePoint {
  const fallbackWidth = positive(frameWindow?.innerWidth ?? 0);
  const fallbackHeight = positive(frameWindow?.innerHeight ?? 0);

  if (!frame || !viewport || !frameWindow) {
    return {
      xRatio: clampUnit(clientX / fallbackWidth),
      yRatio: clampUnit(clientY / fallbackHeight),
    };
  }

  const frameRect = frame.getBoundingClientRect();
  const viewportRect = viewport.getBoundingClientRect();
  if (viewportRect.width <= 0 || viewportRect.height <= 0) {
    return {
      xRatio: clampUnit(clientX / fallbackWidth),
      yRatio: clampUnit(clientY / fallbackHeight),
    };
  }

  // Account for any CSS scaling while preserving EPUB.js translations that move a wide chapter
  // beneath the clipped outer viewport.
  const frameLayoutWidth = positive(frameWindow.innerWidth, positive(frameRect.width));
  const frameLayoutHeight = positive(frameWindow.innerHeight, positive(frameRect.height));
  const scaleX = positive(frameRect.width / frameLayoutWidth);
  const scaleY = positive(frameRect.height / frameLayoutHeight);
  const topLevelX = frameRect.left + clientX * scaleX;
  const topLevelY = frameRect.top + clientY * scaleY;

  return {
    xRatio: clampUnit((topLevelX - viewportRect.left) / viewportRect.width),
    yRatio: clampUnit((topLevelY - viewportRect.top) / viewportRect.height),
  };
}

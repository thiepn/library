from pathlib import Path

path = Path('src/lib/reader/engines/epubjs.ts')
source = path.read_text()

anchor = "    const hasSelection = () => Boolean(win.getSelection()?.toString().trim());\n\n"
helper = '''    const isInteractiveVisibleTarget = (x: number, y: number, target: EventTarget | null): boolean => {
      const targetInteractive = isInteractiveTarget(target);
      const displayedPage = this.currentLocation?.displayedPage;
      if (!displayedPage || displayedPage < 1) return targetInteractive;

      const localWidth = Math.max(1, win.innerWidth || doc.documentElement?.clientWidth || 1);
      const candidatePageWidths: number[] = [];
      const viewportMeta = doc.querySelector<HTMLMetaElement>('meta[name="viewport"]')?.getAttribute('content') ?? '';
      const viewportWidthMatch = viewportMeta.match(/(?:^|[,\\s])width\\s*=\\s*(\\d+(?:\\.\\d+)?)/i);
      const declaredViewportWidth = viewportWidthMatch?.[1]
        ? Number.parseFloat(viewportWidthMatch[1])
        : Number.NaN;
      if (Number.isFinite(declaredViewportWidth) && declaredViewportWidth > 1) {
        candidatePageWidths.push(declaredViewportWidth);
      }

      let frameRect: DOMRect | undefined;
      try {
        const frame = win.frameElement as HTMLElement | null;
        frameRect = frame?.getBoundingClientRect();
        if (frameRect && Number.isFinite(frameRect.width) && frameRect.width > 1) {
          candidatePageWidths.push(frameRect.width);
        }
      } catch {
        // Same-origin parent geometry can disappear while an EPUB view is being replaced.
      }

      if (doc.body) {
        const computedBodyWidth = Number.parseFloat(win.getComputedStyle(doc.body).width);
        if (Number.isFinite(computedBodyWidth) && computedBodyWidth > 1) {
          candidatePageWidths.push(computedBodyWidth);
        }
        if (doc.body.clientWidth > 1) candidatePageWidths.push(doc.body.clientWidth);
      }

      const publicationPageWidth = candidatePageWidths.find((candidate) => {
        if (localWidth <= candidate * 1.25) return false;
        const pageCount = localWidth / candidate;
        const roundedPageCount = Math.round(pageCount);
        return roundedPageCount >= 2 && Math.abs(pageCount - roundedPageCount) <= 0.02;
      });
      if (publicationPageWidth === undefined) return targetInteractive;

      const pageCount = Math.round(localWidth / publicationPageWidth);
      if (displayedPage > pageCount) return targetInteractive;

      const tolerance = Math.max(3, publicationPageWidth * 0.03);
      const currentPageStart = (displayedPage - 1) * publicationPageWidth;
      let visibleColumnX: number;
      if (
        x >= currentPageStart - tolerance
        && x <= currentPageStart + publicationPageWidth + tolerance
      ) {
        visibleColumnX = x;
      } else if (x >= -tolerance && x <= publicationPageWidth + tolerance) {
        visibleColumnX = currentPageStart + Math.max(0, Math.min(publicationPageWidth, x));
      } else {
        const wrappedX = ((x % publicationPageWidth) + publicationPageWidth) % publicationPageWidth;
        visibleColumnX = currentPageStart + wrappedX;
      }

      const yCandidates = [y];
      if (frameRect && Number.isFinite(frameRect.top)) {
        const frameLocalY = y - frameRect.top;
        if (Number.isFinite(frameLocalY) && Math.abs(frameLocalY - y) > 1) yCandidates.push(frameLocalY);
      }

      // Chromium can report event.target from an underlying column when EPUB.js exposes a
      // multi-page iframe viewport. In that proven geometry, rendered client rectangles in
      // the currently displayed column are authoritative: a hidden-column link must not
      // steal a center/edge reader gesture, while a link actually under the visible tap must.
      return Array.from(doc.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR)).some((candidate) =>
        Array.from(candidate.getClientRects()).some((rect) =>
          visibleColumnX >= rect.left - 1
          && visibleColumnX <= rect.right + 1
          && yCandidates.some((candidateY) => candidateY >= rect.top - 1 && candidateY <= rect.bottom + 1),
        ),
      );
    };

'''

if source.count(anchor) != 1:
    raise SystemExit(f'expected one interaction helper anchor, found {source.count(anchor)}')
source = source.replace(anchor, anchor + helper, 1)

begin_old = "        interactive: isInteractiveTarget(target),\n"
begin_new = "        interactive: isInteractiveVisibleTarget(x, y, target),\n"
if source.count(begin_old) != 1:
    raise SystemExit(f'expected one pointer-start interactive assignment, found {source.count(begin_old)}')
source = source.replace(begin_old, begin_new, 1)

finish_old = "      const interactive = start.interactive || isInteractiveTarget(target);\n"
finish_new = "      const interactive = start.interactive || isInteractiveVisibleTarget(x, y, target);\n"
if source.count(finish_old) != 1:
    raise SystemExit(f'expected one pointer-finish interactive assignment, found {source.count(finish_old)}')
source = source.replace(finish_old, finish_new, 1)

if source.count('const isInteractiveVisibleTarget =') != 1:
    raise SystemExit('visible-target helper was not installed exactly once')
path.write_text(source)

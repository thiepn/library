# P26 — Fallback & Failure Handling

## Status

P26 hardens the P25 public EPUB migration boundary so a reader failure does not strand the user, conceal a broken release, or silently change editions.

The governing rule is:

> Retry the same resolved publication first. Offer verified alternate reading paths explicitly. Never auto-switch the user to another format or release merely because the native reader failed.

## Failure layers

P26 distinguishes failures that happen at different points in the native reader lifecycle:

- **network** — the EPUB cannot be fetched, the browser is offline, or a common transient HTTP/network failure is detected;
- **publication** — EPUB.js cannot open the resolved active EPUB;
- **rendering** — the publication opened, but the current rendition cannot be displayed;
- **location** — a requested EPUB location cannot be displayed;
- **reader** — the runtime/container cannot initialize correctly;
- **unknown** — a failure does not match a stable engine category.

The UI uses stable, human-readable messages. Raw exception strings are not the user-facing failure contract. The shell records normalized failure kind/code in data attributes for diagnostics without replacing the active release.

## Initial boot recovery

P5-P24 intentionally destroy partially created runtime state if first open fails. Before P26, that meant the visual error state remained but the original shell controller—and therefore its **Try again** listener—had already been destroyed.

P26 adds `ReaderFallbackController` above the complete P24 reader stack:

```text
public /read route
→ ReaderFallbackController
→ P24 compatibility harness
→ P23 accessibility
→ P22 desktop/tablet
→ P21 mobile
→ P20 annotations
→ P19 bookmarks
→ P18 in-book search
→ native reader core
```

If initial boot fails:

1. P5-P24 clean up their partial controllers and EPUB.js runtime;
2. P26 recreates only the inert shell controller;
3. the normalized failure state is rendered;
4. a dedicated boot-retry listener remains active;
5. choosing **Try again** reconstructs the full P24 stack against the exact same publication object.

A successful retry does not bypass any feature layer.

## Runtime failures

Failures after a successful open use the same normalization contract through the base reader harness. Open, controller, navigation/layout, and other fatal shell-level errors therefore present consistent recovery language and preserve the existing in-reader retry path.

Non-fatal subsystems established in earlier phases retain their own degradation behavior. For example, blocked persistence does not become a fatal reading error.

## Explicit fallback hierarchy

When a native EPUB route has alternatives, the error state may expose:

1. **Try again** — reopen the same resolved EPUB release;
2. **Open web edition** — only when a verified materialized Markdown payload exists;
3. **Open PDF** — only when the active release contains a PDF artifact;
4. **Download EPUB** — the exact active EPUB artifact, for use in an external reader;
5. **Back to book** — return to the publication detail page.

These actions are deliberately explicit. P26 does not call `location.replace`, `location.assign`, or equivalent automatic fallback behavior from the native failure controller.

## Legacy web fallback

The canonical `/works/[slug]/read` route is EPUB-first after P25. Therefore a native failure cannot use `/works/[slug]/read` itself as the Markdown fallback; that would simply launch the failing EPUB again.

P26 resolves the verified Markdown fallback directly to its first materialized chapter:

```text
/works/[slug]/read/[chapter-id]
```

That historical chapter route still uses `ReaderLayout.astro` and remains independent of the native EPUB launcher.

P26 does not synthesize an EPUB CFI from legacy chapter progress. The web fallback is a separate explicit reading path.

## PDF fallback

PDF fallback comes from the active release registry, not from a manifest intention flag. Canonical Library media URLs use the same `localizeReaderArtifact()` primitive as the EPUB source so production and custom-base builds retain correct artifact paths.

A PDF is never substituted automatically for a failed EPUB.

## EPUB download escape path

A web-rendition failure does not necessarily mean the EPUB artifact is unusable in a dedicated reading application. The reader error state therefore exposes the exact resolved EPUB as a download when available.

This does not create or select a new release; it is the same artifact that the active publication candidate identified.

## Legacy launcher hardening

The legacy launcher already treats IndexedDB progress as best-effort: if progress lookup fails, it opens the first verified chapter.

P26 additionally treats an unexpectedly empty materialized Markdown payload as an explicit unavailable state instead of leaving the launcher indefinitely on “Opening…”. If the active release contains a PDF, that page still offers the PDF as an escape path.

## Bootstrap failures

A failure before the publication recovery harness can be constructed—such as missing or malformed serialized publication metadata—is presented through the same shell failure UI. In that narrow case, **Try again** becomes **Reload page**, because reconstructing the same malformed bootstrap payload in-place would not be meaningful.

## Accessibility

The existing reader error surface remains an alert. P26 adds:

- a mutable, descriptive failure heading;
- grouped recovery controls with an accessible label;
- retry visibility that reflects whether the normalized failure is retryable;
- preserved keyboard/focus behavior from P23;
- explicit links rather than hidden automatic navigation.

## Publication integrity

P26 deliberately does not:

- select a different active release during retry;
- downgrade to an older EPUB;
- auto-open Markdown or PDF after failure;
- convert legacy positions into synthetic CFIs;
- suppress evidence that the active EPUB failed;
- weaken P2/P24 publication compatibility requirements;
- delete legacy chapter URLs.

A publication defect remains visible as a defect even when the user has a safe alternate way to keep reading.

## Phase boundary

P26 provides failure recovery and explicit alternate reading paths.

It does not yet implement:

- P27 performance/loading optimization;
- P28 offline/PWA caching guarantees;
- P29 historical URL/progress compatibility bridging into native EPUB locations;
- P35 final legacy removal.

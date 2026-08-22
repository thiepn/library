# Library recovery status

Date: 2026-08-22

## Why this recovery exists

The GitHub repository was created with only a bootstrap README even though L0–L16 had been designed and source-certified elsewhere. A temporary React/Vite reconstruction was committed during repository recovery, then rejected because it contradicted the retained canonical architecture.

This tree restores the correct top-level decisions:

- Astro static application rather than React SPA routing;
- clean origin routes at `library.thiepn.dev`;
- Archive Editorial visual language;
- Pagefind as the static search layer;
- Cloudflare Workers Static Assets with real 404 handling;
- R2 as the immutable publication-binary boundary;
- public static reading independent from optional AI.

## Retained certification evidence

The previous L16 source candidate recorded 149/149 regression tests, 71 source release checks passing with no failures, and 289 TypeScript/Astro parse units passing. Those are **historical source-candidate results**, not claims about this reconstructed Git tree.

## L17 — AI for the Kingdom

Recovered authoritative metadata:

- Work ID: `ai-for-the-kingdom`
- release: `1.0.0-rc4`
- native reader files expected: 57
- numbered chapters: 41
- conclusion: 1
- part openings: 8
- main-reading-unit fidelity: 1.000 minimum / 1.000 average
- PDF: 1,792,545 bytes, SHA-256 `8aa58f8eb291c9c5abb4c0ebc633032ae2c4a3703c443e7c3779f38646c707bd`
- EPUB: 568,942 bytes, SHA-256 `8931f8578cbd7e09ccf31385047f8eb5d58ea5a74a683c79669a51d2b9e59e1f`
- cover: 56,752 bytes, SHA-256 `938830415749fff85b864248c7e302624f17d50bbe5336de1009538fe040df94`

The author/byline remains intentionally unspecified. Do not infer it from repository ownership or profile data.

## Current blockers

1. The cumulative L14 archive and L17 ZIP are retained in ChatGPT File Library evidence but their raw ZIP bytes are not materializable through this runtime.
2. The 57 reader source files therefore still need byte-for-byte restoration before the Web edition can be certified.
3. PDF, EPUB, and cover binaries must be restored to the immutable publication store and verified against the recorded hashes.
4. `pnpm-lock.yaml` must be generated from pnpm 11.21.0 in a registry-connected environment and committed.
5. Only then can a dependency-connected build, Pagefind output, browser matrix, Cloudflare/R2 smoke test, and final RC certification be truthful.

The UI deliberately hides unavailable reading/download actions until these blockers are resolved.

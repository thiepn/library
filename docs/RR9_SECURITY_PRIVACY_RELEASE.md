# RR9 — Security, privacy, dependency hardening, and v1.0 launch

## Status

RR9 is the final release-readiness phase. The automatable security and release-hardening campaign is active on `phase9-security-v1-launch`.

The repository **must not** be tagged `1.0.0` until the final exact-SHA physical-device campaign is complete. The RR2 physical evidence count remains 0/12 at the start of RR9; browser automation, simulated device profiles, and source checks cannot substitute for those physical runs.

## Production serving boundary

The application is built as static Astro output under `/library`.

GitHub Pages remains a rollback mirror, but GitHub Pages does not provide repository-controlled arbitrary response headers. RR9 therefore promotes the existing Cloudflare Workers Static Assets configuration to the production edge for `thiepn.dev/library*`. The Worker serves the same certified `dist` tree after the GitHub Pages mirror has deployed successfully.

`public/_headers` is promoted by `scripts/prepare-deploy.mjs` to `dist/_headers`, where Cloudflare Workers Static Assets applies it to `/library/*` responses.

The production header policy requires:

- HTTPS/HSTS;
- MIME sniffing disabled;
- framing denied;
- browser permissions minimized;
- same-origin opener/resource boundaries;
- no document `<base>` rewriting or form submission;
- no plugins/objects;
- self-hosted application scripts/workers only;
- only the explicitly required image/media/font/style/connect origins;
- immutable caching only for hashed application assets.

Live production verification checks the actual response headers after the Cloudflare edge deployment. A source `_headers` file by itself is not accepted as production evidence.

## EPUB content boundary

EPUB input passes compatibility inspection before personal-file persistence. The preflight rejects unsafe ZIP paths, duplicate entries, encryption/DRM, unsupported compression, excessive entry count, excessive expanded size, pathological compression ratio, missing structural resources, and remote-resource references.

The native EPUB reader still needs a script-capable sandbox in WebKit so parent-installed reader event handlers work. RR9 preserves that compatibility requirement while tightening the publication document itself before EPUB.js serializes it:

- remove `script`, `iframe`, `object`, `embed`, `applet`, and `base` elements;
- remove meta refresh;
- remove inline event attributes;
- remove `javascript:` and `vbscript:` URL attributes;
- remove executable `data:text/html`, `data:application/xhtml+xml`, `file:`, and `filesystem:` navigation targets;
- replace any publisher CSP with the reader-owned restrictive CSP;
- set `default-src 'none'` inside the publication document;
- allow presentation resources only from same-origin/blob/data image/media/font/style sources;
- disable scripts, frames, workers, network connections, forms, objects, and base-URL rewriting.

The RR9 hostile EPUB browser fixture proves that scripts/events do not execute, `<base>` cannot redirect a relative resource to a remote host, dangerous navigation attributes disappear, the reader CSP is present, and a valid local image remains readable.

## PDF boundary

Personal PDFs are preflighted before persistence. Encryption/password protection, active PDF JavaScript/actions, invalid/truncated structures, and other unsupported hostile forms fail with bounded errors.

The integrated PDF.js reader additionally opens every accepted PDF with `isEvalSupported: false`, uses the bundled application-owned worker, renders to application-owned canvas/text layers, bounds raster dimensions/pixel area, and tears down render/search/document resources explicitly.

RR9 retains executable proof that an active-content PDF is rejected before it enters personal-book persistence.

## Service worker and offline boundary

The service worker only handles `GET` requests inside the same `/library/` origin/scope. Hosted publication caching is restricted to same-origin certified `.epub`/`.pdf` media paths. Personal book bytes remain IndexedDB-only and are never placed in Cache Storage or CI artifacts.

Offline downloads validate release identity/size metadata and remove partial cached files after failed or cancelled transfers.

## Dependency and supply-chain gate

The frozen `pnpm-lock.yaml` remains mandatory. pnpm 11's explicit `allowBuilds` policy limits install-time build scripts to the small reviewed set required by the application.

The first RR9 production audit exposed high-severity advisories in two dependency families. RR9 resolves them at the dependency graph instead of suppressing the audit:

- the browser runtime still uses `epubjs` 0.3.93, but its XML parser is overridden from vulnerable `@xmldom/xmldom` 0.7.x to maintained 0.8.15 LTS;
- Astro is a static build tool rather than shipped browser runtime, so Astro/YAML/Zod are classified as development dependencies instead of production dependencies;
- the build toolchain is upgraded to Astro 7.2.8, which resolves the vulnerable pre-7.2.8 image-processing line and pulls patched Sharp 0.35.x rather than 0.34.5;
- the shipped production dependency set is intentionally narrow: `epubjs` and `pdfjs-dist` only.

The production audit and production SBOM represent the code shipped into the browser dependency graph. The complete build toolchain remains frozen in the lockfile and must still pass install, source certification, TypeScript/Astro build, all browser gates, Worker dry-run, and production deployment.

RR9 adds two executable release checks:

1. `pnpm security:audit` runs a production-only advisory audit and fails for any high or critical production dependency advisory. The JSON result is retained as non-secret supply-chain evidence.
2. `pnpm security:supply-chain` generates a production CycloneDX SBOM plus the pnpm production license inventory and fails when installed production dependencies expose unresolved/unknown license declarations.

The SBOM, license inventory, audit report, and summary contain package metadata only. They must never include browser profiles, personal publication files, IndexedDB contents, authentication tokens, or secret environment values.

## CI artifact privacy

Browser traces/screenshots/videos are retained only on failure by the existing acceptance workflows. RR9 security fixtures are deterministic generated test publications, never user uploads.

The security workflow's always-retained evidence is limited to dependency/SBOM/license metadata. Cloudflare credentials are provided only through GitHub Actions secrets to deployment steps and are never copied into build artifacts.

## Public privacy and recovery claims

The public privacy/recovery/security surfaces must state accurately that:

- the application has no behavioral analytics in the v1 architecture;
- reading state and personal imports are browser-local;
- personal EPUB/PDF bytes are not included in the default JSON backup;
- Google-hosted font resources are a separate third-party network request while they remain part of the UI;
- browser/site-data clearing can remove local state;
- manual backup/restore is portability, not account/cloud synchronization;
- the security model disables publication scripting and remote publication subresources rather than promising that arbitrary malformed files are safe.

## Release protection and versioning

`main` is currently unprotected at the start of RR9. Final v1.0 release requires branch protection/rules that prevent an unreviewed direct push from bypassing required checks. The connected GitHub integration can verify protection state but cannot currently mutate repository rules, so protection enablement remains an explicit owner action unless a write-capable repository-rule tool becomes available.

The project version remains `1.0.0-rc.1` during the automatable RR9 campaign. The final `1.0.0` bump, changelog/release notes, exact tag, and production verification happen only after:

- RR9 security workflow is green;
- every preceding automated release gate is green;
- no high/critical production dependency advisory remains;
- production response headers are verified through the Cloudflare edge;
- `main` protection is enabled;
- RR2 physical-device evidence passes for the exact final SHA.

## Rollback

GitHub Pages remains the independently deployed static mirror while Cloudflare Workers Static Assets is the custom-domain edge. If the Worker deployment is unhealthy, the Worker route/version can be rolled back without rewriting user browser data or publication identities; the previous Pages deployment remains an origin-level fallback.

Application rollback must preserve the v9 main IndexedDB, v3 personal-book DB, PDF DB, RR8 backup format, and previously accepted user records. A rollback must not downgrade or destructively rewrite persisted browser state.

## RR9 automated exit criterion

The automatable portion of RR9 can close when the exact PR head passes:

- complete source certification including RR9;
- production dependency vulnerability audit;
- CycloneDX/license evidence generation;
- Cloudflare Worker dry-run validation;
- RR9 hostile publication browser acceptance;
- all existing browser, compatibility, performance, offline/storage, accessibility, ergonomics, and durability gates.

That does **not** itself authorize the `1.0.0` tag. Physical-device certification and repository protection remain mandatory final launch gates.

# RR9 — Security, privacy, dependency hardening, and v1.0 launch

## Status

Automated/code-level RR9 hardening is complete and production-certified on source `7b2a328c7923a56c7c8ff875d9d106bed13550bf` via production run `33366197854`.

The certified release-candidate pipeline passed source/build certification, exact R2 publication-media staging, staged Browser Acceptance, RR4 performance/memory, RR5 offline/PWA/storage, RR6 accessibility/inclusive reading against the staged canonical EPUB, RR7 ergonomics, RR8 data durability, RR9 security/privacy/dependency/provenance, GitHub Pages deployment, and live custom-domain verification.

The final `v1.0.0` launch is intentionally **not** complete. Exact-SHA physical-device evidence remains **0/12**, `main` remains unprotected, and the package remains `1.0.0-rc.1`. Those release gates may not be bypassed or represented as complete.

RR9 implementation was integrated through PR #44. Production follow-up PR #56 corrected the WebKit RR5 outage qualification boundary, and PR #57 corrected RR6 hosted tap-zone evidence so publication-owned links/controls are never mistaken for reader gesture evidence. Run `33366197854` is the first production run after those follow-ups to pass the complete fail-closed RR4→RR9 chain and live verification.

## Security boundary

Publication input is untrusted.

### EPUB

- ZIP paths, duplicates, encrypted entries, unsupported compression, entry counts, expanded bytes, per-entry bytes, and compression ratios are bounded before extraction.
- `container.xml` and OPF package metadata are bounded to 512 KiB.
- metadata fields used by the application are bounded.
- declared cover images are bounded to 8 MiB.
- XHTML/XML/CSS/JavaScript/SVG/NCX resources larger than the 8 MiB security-inspection boundary are rejected rather than skipped.
- manifest/spine resources must resolve inside the archive.
- remote manifest resources, remote CSS URLs/imports, remote `src`/`poster`/`data`, remote `srcset`, and remote SVG `href`/`xlink:href` resources are rejected.
- unsupported DRM/content encryption is rejected.
- publisher script is classified but never granted publication-script authority.

Before EPUB.js serializes a spine document, the reader removes executable elements, meta refresh, event-handler attributes, JavaScript URLs, ping endpoints, and remote resource attributes. A frame-local CSP then applies `default-src 'none'`, disables script/object/frame/worker/connect/form execution, and permits only reader-created `blob:`/`data:` publication assets plus inline publisher CSS required for rendering.

EPUB.js still uses the sandbox capability required for parent-installed reader input callbacks in WebKit. That browser requirement is not treated as permission for publisher JavaScript: publisher executable surfaces are removed before serialization and the frame CSP denies script execution.

### PDF

PDF preflight rejects encryption and active actions including JavaScript/JS, Launch, RichMedia, SubmitForm, ImportData, Rendition, and remote GoTo actions. The custom reader uses PDF.js with `isEvalSupported: false` and does not mount the stock PDF scripting application layer.

### Application

The application HTML owns a restrictive CSP and `no-referrer` policy. The current GitHub Pages host does not provide a repository-controlled arbitrary response-header layer, so RR9 does not pretend that the historical `_headers` file supplied live protection. Header-only directives such as `frame-ancestors` and Permissions-Policy remain hosting-layer capabilities and are not claimed unless the production response actually contains them.

Production verification checks the policy that exists in live HTML and records whether a response CSP header is present or the meta-CSP fallback is in force.

## Dependency and CI provenance

RR9 requires:

- a frozen pnpm lockfile;
- explicit `allowBuilds` decisions for dependency install/build scripts;
- `minimumReleaseAge: 1440` for routine resolution of newly published packages;
- production vulnerability audit failing on high/critical advisories;
- production license inventory with forbidden/unresolved license rejection;
- deterministic CycloneDX 1.6 SBOM generation from the lockfile;
- Dependabot PRs for npm and GitHub Actions;
- every external GitHub Action pinned to a full 40-character commit SHA;
- CI evidence uploads limited to reports/test results/dependency metadata, never publication-ingress packages or personal user files.

The generic owner-controlled `ingest/**` publication workflow remains privileged because it must write verified publication source/registry data and publish immutable R2 media. Historical L17B recovery and lockfile/bootstrap workflows are removed from active CI because their privileged write/secret surfaces are no longer required.

## Privacy boundary

Thiepn Library v1 has no account system, behavioral analytics, advertising, or automatic cloud synchronization. Reading state and personal books are browser-local. Manual backup exports portable state and personal-book metadata but not personal EPUB/PDF bytes or cover blobs.

Normal public reading can request the static site, immutable public publication media, and interface fonts. Those infrastructure requests are not treated as reading-history telemetry. Local annotations, progress, and personal-book content are not intentionally attached to those requests.

## Release identity

Every production build writes `/library/release-identity.json` containing the exact source SHA and Actions run ID. Post-deploy verification requires the live identity to match the source being verified. This replaces the old pattern of mutating `main` with a post-deployment status commit and keeps the deployment pipeline compatible with protected-main enforcement.

RR9 and later deployment outcomes are retained as immutable `production-deployment-<run-id>` GitHub Actions artifacts rather than written back to the repository after deployment.

## v1.0 release gate

`v1.0.0` is fail-closed. The release workflow requires all of the following for one exact 40-character source SHA:

1. `package.json` is exactly `1.0.0` and the changelog has a 1.0.0 section.
2. the exact source passes complete release certification plus RR9 security/dependency acceptance;
3. the exact source has complete RR2 physical-device release evidence;
4. `main` reports `protected: true` through the GitHub API;
5. production `/release-identity.json` equals the expected source SHA;
6. live production verification passes for application routes, immutable media, offline/PWA assets, public privacy/security/support pages, CSP evidence, and release identity;
7. only then may the workflow create and push annotated tag `v1.0.0`.

The current repository state does not satisfy steps 3 or 4: physical evidence is 0/12 and `main` is currently unprotected. RR9 automation is production-certified as a release candidate, but it must not manufacture a final v1 tag.

## Rollback and incident rule

A failed security or production gate prevents Pages artifact upload. A failed v1 gate prevents tagging. If a deployed release candidate is found defective, redeploy the last known-good source SHA through the same certified deployment workflow; immutable publication releases remain content-addressed/versioned and reading-state migrations are additive/compensated rather than destructively reset.

Security-sensitive findings should be fixed before final v1 when they are P0/P1 or create a high/critical shipped vulnerability. Claims in public documentation must match what the production host and reader actually enforce.

## Exit criteria

The automated/code-level RR9 exit criteria are satisfied by source `7b2a328c7923a56c7c8ff875d9d106bed13550bf` and production run `33366197854`: source certification, cross-engine security acceptance, high/critical dependency audit, license inventory, SBOM generation, all preceding automated RR gates, Pages deployment, and live verification passed.

The complete Phase 9 / v1.0 launch closes only after the separately tracked protected-main configuration and exact-SHA physical-device campaign also pass, the package/changelog are finalized as `1.0.0`, the exact final SHA is production-verified, and tag `v1.0.0` is created from that verified source.

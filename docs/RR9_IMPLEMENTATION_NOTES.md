# RR9 implementation notes

This file records the security/release audit decisions behind the RR9 implementation and production-closeout lineage.

## Confirmed findings addressed

- GitHub Pages does not treat the repository's former Cloudflare-style `_headers` file as a deployable arbitrary-header policy; the application now owns enforceable HTML CSP/referrer policy and production verification inspects live evidence.
- EPUB preflight was strong but render-time defense now repeats the no-script/no-network boundary inside every EPUB frame.
- EPUB metadata, cover, and text-like inspection resources now have explicit hostile-input bounds.
- remote `srcset` and SVG resource references and additional PDF active actions are rejected.
- PDF.js evaluation remains disabled.
- obsolete privileged L17B/bootstrap workflows were removed.
- all retained external GitHub Actions are required to use full commit SHAs.
- production deploy no longer commits status back to `main`; immutable production evidence is retained as an Actions artifact instead.
- generic verified publication ingest no longer pushes promotion directly to `main`; it opens a normal PR.
- production emits exact `release-identity.json` and verification checks it.
- the first RR9 production attempt exposed a WebKit qualification-harness defect: a hard TCP reset could make cached service-worker subresources fail internally. PR #56 replaced that harness-only outage model with a deterministic origin 503, taught navigation fallback to use cached pages on origin 5xx, and strengthened offline acceptance to require the styled shell.
- the next production attempt exposed a second evidence defect: the WebKit-phone RR6 synthetic tap could land on a real EPUB table-of-contents link and misinterpret EPUB.js `preventDefault()` as reader tap-zone ownership. PR #57 now resolves only non-interactive visible tap targets and waits for page-turn settlement, preserving the rule that publication links and controls win over reader gestures.
- source `7b2a328c7923a56c7c8ff875d9d106bed13550bf` then passed production run `33366197854`, including staged canonical media, Browser Acceptance, RR4–RR9, Pages deployment, and live custom-domain/source/media verification.

## Remaining final-v1 blockers

- exact-SHA physical-device evidence remains **0/12**; browser automation and simulated profiles do not satisfy this requirement;
- issue #36 remains open as the physical-device release blocker;
- `main` remains unprotected;
- `package.json` therefore remains `1.0.0-rc.1`, and no `v1.0.0` tag is created.

The final release workflow is fail-closed on these requirements. The automated/code-level RR9 campaign is production-certified, but the complete Phase 9 / v1.0 launch is not finished until the real physical campaign and protected-main gate pass for the exact final source.

## Deliberately not claimed

RR9 does not claim response-header-only protections that GitHub Pages does not currently expose through repository source, does not claim final physical-device certification, and does not create or move the `v1.0.0` tag while release blockers remain.

# RR9 implementation notes

This file records the security/release audit decisions behind the RR9 implementation branch.

## Confirmed findings addressed

- GitHub Pages does not treat the repository's former Cloudflare-style `_headers` file as a deployable arbitrary-header policy; the application now owns enforceable HTML CSP/referrer policy and production verification inspects live evidence.
- EPUB preflight was strong but render-time defense now repeats the no-script/no-network boundary inside every EPUB frame.
- EPUB metadata, cover, and text-like inspection resources now have explicit hostile-input bounds.
- remote `srcset` and SVG resource references and additional PDF active actions are rejected.
- PDF.js evaluation remains disabled.
- obsolete privileged L17B/bootstrap workflows were removed.
- all retained external GitHub Actions are required to use full commit SHAs.
- production deploy no longer commits status back to `main`.
- generic verified publication ingest no longer pushes promotion directly to `main`; it opens a normal PR.
- production emits exact `release-identity.json` and verification checks it.
- `main` was observed unprotected at RR9 start and physical evidence remains 0/12; the final v1 workflow is fail-closed on both requirements.

## Deliberately not claimed

RR9 does not claim response-header-only protections that GitHub Pages does not currently expose through repository source, does not claim final physical-device certification, and does not create or move the `v1.0.0` tag while release blockers remain.

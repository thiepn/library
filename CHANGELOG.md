# Changelog

All notable changes to Thiepn Library are recorded here.

## Unreleased

### Security

- Added deny-by-default EPUB frame CSP and render-time remote-resource stripping.
- Added explicit EPUB metadata, cover, and deep-inspection size limits.
- Expanded remote EPUB resource detection to `srcset` and SVG references.
- Expanded PDF active-action rejection while keeping PDF.js evaluation disabled.
- Added deployable application CSP/no-referrer policy and live production verification.
- Added high/critical production dependency audit, production license inventory, deterministic CycloneDX SBOM generation, minimum package release age, and full-SHA GitHub Action provenance.
- Removed obsolete privileged L17B recovery and bootstrap workflows.

### Privacy and support

- Published explicit Privacy, Security, and Support boundaries.
- Documented manual backup/personal-file boundaries and absence of automatic cloud sync, behavioral analytics, and advertising.

### Release operations

- Added exact live `release-identity.json` source verification.
- Replaced post-deploy commits to `main` with immutable deployment evidence so protected-main enforcement does not require a deployment-bot bypass.
- Added a fail-closed v1 release workflow and gate.

### Not yet released as v1.0.0

The final v1.0.0 tag remains blocked until the required exact-SHA physical-device campaign is complete and `main` is protected with required release checks.

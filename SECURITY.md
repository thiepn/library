# Security policy

## Supported versions

Thiepn Library is currently in the v1 release-candidate line. Security fixes are applied to the active `main` release lineage. A final `v1.0.0` support claim begins only after the repository’s exact-SHA physical-device and release gates pass.

## Reporting a vulnerability

Do not include private books, credentials, tokens, browser databases, or other sensitive user data in a public issue. If GitHub offers **Report a vulnerability** for this repository, use the repository Security tab so the report is handled privately. Otherwise contact the maintainer through an established private channel before publishing exploit details.

A useful report includes:

- affected route, reader format, browser/OS, and source/release SHA when known;
- a minimal synthetic EPUB/PDF or deterministic reproduction that contains no private material;
- expected versus observed security boundary;
- whether the issue can cause code execution, remote-resource access, data disclosure, data loss, or release/CI compromise.

## Security model

Publication files are untrusted. EPUB and PDF preflight, EPUB frame sanitization/CSP, PDF active-content rejection, browser-local storage boundaries, dependency provenance, and release CI are part of the supported security boundary. See `docs/RR9_SECURITY_PRIVACY_V1_LAUNCH.md` and the public `/security/` page for the current model and known hosting limitations.

## Disclosure and release

Confirmed high-impact defects should receive regression coverage and pass the complete current production gate before deployment. Do not weaken physical-device, protected-main, dependency, or publication-security gates to accelerate a release.

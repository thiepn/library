# THIEPN Library Book Notes N1E — Staging / RLS Handoff

**Draft only. NO_GO for release, deployment and live Account sync.**

## Verified inherited baseline (2026-10-12)

- N1A PR #165, `4ec1d62e24a0e570b25077b08d1fe0b356927ba7`: 8/8 CI PASS.
- N1B PR #167, `867221e2b3613eb622fcc2068096867949a3bee7`: 9/9 CI PASS.
- N1C PR #168, `6e94aeb60012761994da2ce563e3a7bce418883d`: 8/8 CI PASS.
- N1D PR #169, `788e98387d71b8c54402215c1892a62d44c8a64f`: 7/7 CI PASS.

N1D Browser Acceptance (38227473885) ran 179 PASS / 66 SKIP across Chromium, Firefox, WebKit and mobile profiles. Includes synthetic V2/V1 restore, EPUB CFI/PDF page/web chapter evidence, Obsidian export and denied-write draft recovery. N1D Security (38227473863) ran 65 PASS; Durability (38227473879) ran 44 PASS / 2 SKIP.

## Real N1E source defect repaired

The N1C SQL RPC replacement derived from the pre-SSO permission migration, not the latest 20261006202154 first-party SSO migration. Without N1E's repair it would reject authorized first-party OAuth clients and drop active account deletion locks. N1E preserves both protections, including independent grant and revision-CAS safety and V1 anti-rollback, with regression assertions that compare against the latest source Account migration. This is a source-only fix; no SQL has been applied anywhere.

## Disposable PostgreSQL test runner

Run from repository root **only on an approved disposable machine**:

`node scripts/qualification/book-notes-n1e-disposable-postgres.mjs`

Requires local `initdb`, `pg_ctl` and `psql`. On success it initializes a brand-new temporary local PostgreSQL cluster, private Unix socket, no TCP listener and no use of DATABASE_URL or existing Account credentials. It runs the latest historical SSO/RLS migration followed by the V2 notebook RPC, with synthetic auth functions/grants. It exercises owner isolation, permissions, first-party vs third-party OAuth, anonymous users, deletion lock, malformed V2 note, stale V1 downgrade and two client processes racing with the same revision. In all outcomes it stops and removes the isolated cluster. A nonzero exit or missing binaries is NOT_TESTED/FAIL, never PASS.

**Here, PostgreSQL binaries, Docker and an independent human reviewer were unavailable.** The runner is authored, not executed. Actual PostgreSQL RLS/CAS behavior and independent signoff remain NOT_TESTED. Synthetic auth functions do not replace production issuer/OAuth registry integration.

## Release gates

1. Qualify N1E exact-head CI and inspect failure logs without relaxing tests.
2. Execute the disposable PostgreSQL runner and retain logs; if unavailable preserve NOT_TESTED.
3. Independently review all SQL/auth contract changes, including migration ordering and security-definer ownership.
4. Verify real Account issuer integration with exclusively synthetic accounts/grants and two-device interrupted-write reconciliation in an authorized disposable environment.
5. Perform real physical device/accessibility acceptance; obtain explicit owner authorization before merge, SQL migration or deploy.

No main changes, production migration, actual OAuth grants, personal records, credentials, billing or DNS changes. Account notebook sync stays fail closed.

## N1F

N1F should resolve remaining executable staging and integration checks, repair any real CI regressions, and implement further learner-facing recovery and sync conflict UX improvements on a separate source-only stacked draft. Do not substitute certification for implementation.

# P4 — THIEPN Ecosystem Integration

## Goal

Library remains the owner of reading state while THIEPN Home can show a small, revocable reading projection and return the user to the exact publication identity.

P4 extends the H16 device-only bridge with optional THIEPN Account reconciliation. It does **not** give Hub direct access to Library's Supabase tables, tokens, raw backup envelope, book files, exact reader anchors, annotations, shelves, or tags.

## Consent

Hub sharing remains browser-profile consent stored under `thiepn:library:hub-consent:v1`.

Consent schema v2 adds one explicit field:

- `includeAccount`: allow Library to reconcile through its existing THIEPN Account sync before producing Hub metadata.

Historical schema-v1 consent is accepted only as local-only consent. It normalizes to `includeAccount: false`. Existing users therefore gain no cloud-facing behavior until they explicitly save the new choice.

Imported books remain a separate opt-in. A personal title is eligible only when its matching personal file exists on the current device.

## Account boundary

When a P4-capable Hub connection supplies its verified Account ID and `includeAccount` is enabled:

1. Library verifies its own native THIEPN Account session.
2. Library requires the Hub account ID and Library account ID to match.
3. Library requires Account sync to be enabled on this device.
4. Library runs its existing revision-CAS reconciliation.
5. Conflict, offline, signed-out, disabled-sync, or account-mismatch states do not unlock Account coverage.
6. Only after successful reconciliation does Library read its local authoritative reader stores and return the ordinary bounded metadata projection.

Hub never receives or presents a Supabase access token and never reads `library_sync_state` directly.

## Projection

Allowed fields remain:

- title;
- EPUB/PDF format;
- edition;
- release version;
- update time;
- current progress;
- furthest progress.

Explicitly excluded:

- EPUB CFI;
- PDF page anchor beyond normalized progress;
- chapter labels;
- bookmarks;
- highlights;
- notes and annotations;
- shelves and tags;
- personal file bytes;
- covers;
- search contents;
- reading history;
- raw Library backup/account snapshot.

The bridge reports `coverage: device-local` when Account reconciliation is not used and `coverage: account-synced` only after a successful same-account Library reconciliation.

## Compatibility

The wire protocol remains `thiepn-library-hub-v1` so rollout can be reversible.

- Legacy Hub `connect` requests receive a schema-v1, local-only consent view.
- New Hub requests include an optional Account ID and receive schema-v2 consent.
- New Hub code may fall back to the legacy connect request when paired with an older Library build.
- P2 moved the PDF database to v2. P4 updates Hub projection reads to PDF DB v2; the old v1-only bridge was no longer valid after P2.

## Continue Reading

Hub continues to send only publication identity to `/library/hub/continue`.

Library resolves the exact work/format/edition/release itself. Because successful Account coverage first reconciles Library's own local state, the native reader resumes from Library's normal authoritative CFI/page state without exposing that anchor to Hub.

## Qualification boundary

Automated qualification must cover both historical device-only consent and P4 account-aware behavior, including:

- no automatic Library owner load;
- no cloud read without explicit v2 consent;
- account mismatch/signed-out/disabled sync fail closed to device-local coverage;
- positive same-account reconciliation through the real Library Account code path;
- no raw token, CFI, annotation, or file leakage;
- exact release return flow;
- PDF DB v2 compatibility;
- revocation, hide/background, expiry, and identity-transition clearing.

Physical phone/tablet acceptance remains separate. P4 does not convert browser-engine tests into physical-device evidence or close RR10/H25.

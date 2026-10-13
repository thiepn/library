# Library Sync B24 — original saved-backup validation and finished conflict chooser

B24 continues directly from B22 Library draft PR #190. Library's existing original `sync_thiepn_library_state` expected-revision CAS and original `restoreLibraryBackupJson` remain the only writers and importers. This phase does **not** create a Core writer or shadow data store.

## Actual owner-facing conflict workflow

1. Inspect the original local and remote heads and choose the intended direction.
2. **Use cloud:** Prepare the local original portable safety backup using the B17–B22 native preflight, download it, and select that actual saved JSON file through the new "Validate saved device safety file" action.
3. **Use this device:** Prepare the current original cloud portable safety copy using the B21 preflight, download it, and select that saved JSON file through "Validate saved cloud safety file".
4. The selection is parsed by `parseLibraryBackupJson` (real original Library collection validation and duplicate checks) **without importing anything**. The canonical snapshot SHA-256 ignores only the nondurable export timestamp, so valid whitespace/indentation changes do not prevent reinspection. The selected file's digest must match the correct **direction-specific** prepared hash; a local saved backup cannot substitute for a remote cloud safety copy, or vice versa.
5. Before declaring the selected saved file matched, the original verified Account owner/device/permission, original local hash and cloud revision/digest are read again. The in-tab single-use 120-second preparation is marked `fileVerified` only if it remains the SAME live preparation after all awaits.
6. The original explicit Device/Cloud action consumes that preparation exactly once, requires its matched-file flag and rechecks local hash, cloud digest, owner/device, revision and expiry before invoking the existing CAS/restore mechanism. Expired, switched-owner, modified or mismatched files fail closed and must be re-prepared; no automatic overwrite occurs.
7. After an attempted choice, the original native head inspector checks for a matched readback. Only that readback signals the original automatic sync runtime that its conflict hold may be cleared. Stale success, rejected CAS, changed heads and unexpected errors leave the original chooser visible; the new post-choice button remains accessible **outside** the conflict panel even after resolution.

The saved-file selection proves only that a file currently available to this browser passes the original format validator and matches the preflight's canonical snapshot. It does not prove that it was retained externally, will remain saved, is independent custody, or includes personal EPUB/PDF bytes (which are outside the Library reading-state snapshot). The browser neither uploads nor imports the selected file.

## B24 acceptance

The new Node regression covers both saved-file directions, mismatched files, owner/device changes, expiry and recovery guidance. Inherited Library Quality, Offline Reliability, Security, Data Durability, Accessibility, Reading Ergonomics and canonical Browser Acceptance must execute on the exact B24 draft head. Authenticated simultaneous two-device Account races, real file retention, independent ciphertext signer/checkpoint and physical Android restore remain separate final-goal gates. No main/production changes, credentials, migrations, live grants, personal records, DNS or billing.

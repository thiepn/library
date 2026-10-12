# B15 — Library native recovery operations

B14 exact source parent `1f64b34d6f0416f430cb4153357adff89f212347`.

The Account screen has a read-only **Recovery inspection** action with concrete signed-in/paused/conflict/error/offline/owner-baseline guidance and links to native Library backup/restore and Account cloud deletion review. It uses the actual current verified Account identity and original Library sync baseline, never cross-origin Core data or a guessed Notes status.

The user can explicitly revoke Core coordination immediately from this panel without pausing native Library sync; the existing CAS source-of-truth chooser remains the sole authoritative conflict resolution. Rendering native Account settings is now observational: it no longer implicitly runs reconciliation simply because settings were opened or refreshed. Only original native runtime/events and explicit Sync now execute cloud operations.

A native Node test covers the incident state machine. Synthetic guest Chromium, full browser and Account acceptance must be separately checked. No production grants, migration, deployment or externally signed recovery evidence.

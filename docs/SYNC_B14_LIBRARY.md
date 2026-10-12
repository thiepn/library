# B14 Library native incident recovery and account-switch containment

Parent B13 draft `7cfae0d8b0bb6f3fda73645dcdeeb98526671936`. The original Library Account screen now shows local Core grant revision, describes actual conflict resolution and offers direct, source-owned Library backup/restore and Account cloud-deletion links. A manual Library action verifies the Account owner again **after** the native CAS completes; stale results cannot be rendered under another owner or clear another owner's conflict hold. Background sync events are ignored unless the native Library sync metadata belongs to the current verified owner.

Core-grant revocation on native Library pause is preserved from B13. No new cross-origin Account token, raw Library document, personal EPUB/PDF cloud bypass or alternate CAS synchronizer. User-facing sync status remains native. Local guest tests and Node regression are synthetic; production Account and offsite provider not exercised.

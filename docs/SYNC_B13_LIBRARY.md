# Library B13 app-owned consent and recovery

B12 parent: `577f475a8d4beae0d6e1418d61bbf4df49fb86d2`. The existing Account page now exposes a **separate default-off, per-owner and per-device Core coordination consent** and a manual "Request native Library sync" control. The transport is the existing Library CAS synchronizer only; no Library record, personal EPUB/PDF byte, session or token is sent to Core. The new wrapper revalidates the original Account owner, per-device Library grant and revocable consent revision before and after a request; it never reports apparent success if the owner or consent changes. The original conflict chooser remains solely in Library.

Pausing Library native sync also prevents new Core requests. This opt-in is deliberately distinct from Library's 30-second foreground auto-sync preference. The UI explains that Core coordination is still local/source-only, not a deployed cross-app background service.

Release bounds: real app user grants, cross-origin Core activation, independent offsite service, provider receipts and physical device acceptance remain unqualified. No production migrations or credentials.

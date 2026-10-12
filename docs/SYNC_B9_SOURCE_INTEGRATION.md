# Library B9 — source-only periodic Account reconciliation

Parent exact upstream main `03957c252298c97b70530c77e2a212cd8ada4372`. This draft does not authorize production rollout, new Account grants, or file bytes.

The existing Library `runtime.ts` was already the single application owner of sync scheduling (SSO, focus, reconnect, BroadcastChannel, storage). B9 adds a **30-second visible/online foreground tick** to that existing scheduler, guarded by its existing `isLibrarySyncEnabledForUser` consent. Disabled devices never reconcile automatically. Conflicts pause this tab's automatic reconciliation until Library's existing owner-conflict UI successfully pushes/pulls or acknowledges a synced state. Before the optional separate personal-file sync, the current authenticated account is checked again.

Local progress, annotations, personal-book metadata, and file permissions stay owned by Library; its existing revision-aware `reconcileLibraryAccountSync` remains the only writer. Hub metadata-sharing consent remains independent. Background updates after browser closure are NOT guaranteed. This is only an isolated integration candidate, not merged, installed, or deployed; source/CI/device acceptance must be recorded independently. B10 can wire a visible session status/opt-in explanation on the original Account page if needed.

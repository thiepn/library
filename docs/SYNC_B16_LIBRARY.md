# B16 — Source-owned Library incident history

B15 parent `a531fdd2e90f15055132b3495a1497d6739103f3`.

Original Library Account exposes a **session-only** recovery incident history, bounded to 12 events, with local timestamps and generic recovery codes. It captures real native CAS status, manual conflict choice, inspected recovery state and owner-scoped Core grant revocation. It neither persists to localStorage nor sends event history to Core or Account, and clears all entries on owner changes/disposal. History never contains book titles, notes, EPUB/PDF bytes, session tokens or cloud snapshots.

Original Library CAS/Device-vs-Cloud chooser and separate personal-file permissions remain authoritative. Native Account and backup links remain the recovery actions. Hub's consent-scoped RAM-only metadata is unchanged. These incident observations are **not external custody receipts**, not human signoff and not a new sync authority.

No merges, live data, migration or deployment. Physical-device acceptance and externally operated storage remain NOT TESTED.

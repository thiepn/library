# B11 Library owner-visible sync and safe conflict release

B10-child source-only branch. The original Library Account CAS engine, opt-in and independently authorized personal-file cloud are unchanged.

The existing foreground runtime now reports bounded, per-owner status to Account settings. A conflict remains paused until the **verified same owner** explicitly and successfully chooses `Use this device` or `Use cloud`. An unrelated successful sync event cannot resume a conflict-paused background run. Ownership, account grants and auto-sync permission are rechecked after reconciliation before separate personal-file sync. Native manual `Sync now` remains possible when automatic checks are paused. No sync after browser closure is claimed.

NO_GO: not installed or enabled in production; real Account and physical multi-device data are untouched.

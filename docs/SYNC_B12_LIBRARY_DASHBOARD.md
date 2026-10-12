# B12 — Library-owned ecosystem status dashboard

Parent B11 draft PR #176 head `32392811eede9a097db9e9cf8fcc70f0161d1f08`.

Library Account now displays **Library's own actual** local/automatic/foreground/conflict/error state and original consent, plus accurate **navigational** tiles for Notes and Hub. Cross-origin private Notes status is not guessed or fetched; Hub is explicitly read-only and session-bound. The Library refresh action delegates to `reconcileLibraryAccountSync`, retaining the existing native CAS/conflict chooser.

A B11 correctness defect is fixed: the foreground timer can no longer resume a Library conflict merely because any unrelated sync event reports success. Only a successful **owner-initiated** `chooseThisDeviceForLibrarySync` or `chooseCloudForLibrarySync` emits an owner-scoped conflict resolution signal. The runtime resets its owner-scoped state across account switching and reports errors for the actual verified owner. Neither Core nor Hub gains any Library write authority.

Tests/CI must be checked on the exact B12 draft; no production deployment or credentials.

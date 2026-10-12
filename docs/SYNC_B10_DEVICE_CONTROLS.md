# B10 Library owner-visible automatic sync

Stacked on B9 branch head `8cce68d711afd7f8601ca0edcb49abe3aea7add4`. The existing original Library per-device Account opt-in, revision CAS, conflict chooser and separately approved personal-file cloud remain authorities. Account settings now show a device-local foreground automatic sync switch and actual last-sync/conflict status. The switch defaults on for previously enabled account owners to preserve B9 behavior, and off for any device whose local preference is explicitly paused; loss of storage fails closed. Disabling periodic checks does NOT revoke the original manual sync or OAuth grant. The runtime never performs a second parallel sync engine. B9 interval and event listeners remain single-owner.

No new app grants, remote changes, file bytes in Core, production source or deploy. Browser/tab closed sync remains unsupported. Human conflict decisions remain required.

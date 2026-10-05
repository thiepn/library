# THIEPN Account sync

Library remains guest-first and local-first. No account is required to browse, import, or read.

## Identity

Library uses the canonical THIEPN Account Supabase Auth project. Google OAuth uses PKCE. A persisted browser session is only a hint; authenticated Library state is used only after `auth.getUser()` verifies the user.

The canonical owner is `auth.users.id`. Email and provider metadata are presentation attributes only.

## Device adoption

Signing in does not upload reading data by itself.

1. Read locally as a guest.
2. Sign in to THIEPN Account.
3. Choose **Sync this device**.
4. Library connects the `library` Account app and required permissions.
5. If no cloud snapshot exists, local portable state becomes revision 1.
6. If cloud state exists and this device has no meaningful reading state, cloud state is restored.
7. If both contain independent state, synchronization stops and requires **Use this device** or **Use cloud**.

Pausing sync or signing out never deletes browser-local data. Disconnecting Library from THIEPN Account revokes its cloud read/write data path; reconnecting requires an explicit **Sync this device** action.

Cloud-data deletion is owned by THIEPN Account rather than a second Library-specific deletion authority. Account shows the Library namespace in its data inventory, creates an expiring deletion plan, requires recent authentication, and deletes only when the planned cloud revision still matches. After deletion, a stale Library device with an earlier baseline sees the missing cloud snapshot as a conflict instead of silently recreating it.

## Synced state

The cloud snapshot reuses Library's validated backup/restore contract:

- saved/favorite books;
- native EPUB and legacy reading progress;
- EPUB bookmarks, highlights and notes;
- PDF progress and bookmarks;
- reading activity;
- reader/site settings;
- portable personal-book metadata.

Personal EPUB/PDF file bytes and local cover blobs are excluded.

## Concurrency

Each cloud snapshot has a monotonically increasing revision. Writes use `sync_thiepn_library_state` with an expected revision. If another device wins the race, the RPC fails closed instead of silently applying last-write-wins.

Each browser stores a non-authoritative baseline containing the Account user ID, observed revision, stable snapshot hash, last successful sync time, and a local device ID.

Reconciliation rules:

- local changed / cloud unchanged -> push;
- local unchanged / cloud changed -> pull;
- identical state -> update baseline;
- both changed -> explicit conflict;
- an unexpectedly missing cloud snapshot after an earlier baseline -> explicit conflict.

## Security

`public.library_sync_state` has RLS enabled. Authenticated users can select only their own row and only while the Library Account connection and read grant are active. Anonymous identities and delegated OAuth clients are denied raw state access. Sync mutations occur only through an owner-scoped revision-CAS RPC deriving the user from `auth.uid()` and checking the Library connection plus write grant. Destructive cloud-data deletion is routed through the audited THIEPN Account lifecycle and requires a recent authenticated session.

The browser contains only the Supabase publishable key. No service-role or secret key is shipped.

# THIEPN Account sync

Library remains guest-first and local-first. No account is required to browse, import, or read.

## Identity

Library is a registered first-party public OAuth 2.1 client of the canonical THIEPN Account Supabase Auth project. Google authentication is owned only by `account.thiepn.dev`; Library never starts Google OAuth itself.

Library uses Authorization Code + PKCE with client ID `76e41661-f8a9-4181-b8b9-4084f2e2acbf` and exact callback `https://thiepn.dev/library/auth/callback/`. The app stores only its own OAuth access/refresh tokens. Supabase data and Storage requests obtain the current app access token through the shared `@thiepn/account-session` runtime.

The canonical owner remains `auth.users.id`. The OAuth `client_id` identifies Library as the calling first-party app and is checked separately from user ownership.

## Device adoption

Signing in does not upload reading data by itself.

1. Read locally as a guest.
2. Library silently probes `account.thiepn.dev` for one bit of state: whether an existing verified THIEPN Account session is eligible to attach Library. No token or profile data crosses the iframe boundary.
3. If Account is already signed in and Library has not been deliberately disconnected, Library automatically starts the first-party OAuth authorization flow. Account auto-authorizes the registered basic-identity client and returns a one-time code to Library's exact callback.
4. If Account is signed out, Library remains a guest. The Account page offers **Connect THIEPN Account**, which sends the user to Account; Google authentication, if needed, happens there.
5. Signing in/attaching still does not upload reading data. Choose **Sync this device** separately.
6. If no cloud snapshot exists, local portable state becomes revision 1.
7. If cloud state exists and this device has no meaningful reading state, cloud state is restored.
8. If both contain independent state, synchronization stops and requires **Use this device** or **Use cloud**.

Pausing sync never deletes browser-local data. Deliberately disconnecting Library in THIEPN Account makes the silent probe ineligible, so Library does not immediately reconnect itself.

Cloud-data deletion is owned by THIEPN Account rather than a second Library-specific deletion authority. Account shows the Library namespace in its data inventory, creates an expiring deletion plan, requires recent authentication, and deletes only when the planned cloud revision still matches. After deletion, a stale Library device with an earlier baseline sees the missing cloud snapshot as a conflict instead of silently recreating it.

## Synced state

The cloud snapshot reuses Library's validated backup/restore contract:

- saved/favorite books;
- native EPUB and legacy reading progress;
- EPUB bookmarks, highlights and notes;
- PDF progress, bookmarks, highlights and notes;
- reading activity;
- reader/site settings;
- portable personal-book metadata, including edited title/creator/language plus shelves and tags.

Personal EPUB/PDF file bytes and local cover blobs are excluded from the revisioned reading-state snapshot.

## Optional personal-file continuity

Personal book cloud is a second, sensitive Account permission (`personal_files.sync`) and is not granted by ordinary Library connection or by **Sync this device**.

When the permission is granted:

- eligible personal EPUB/PDF files up to 50 MB are stored in the private `library-personal-books` bucket;
- object identity is immutable and content-addressed as `<auth.uid()>/<sha256>.<epub|pdf>`;
- there are no public URLs;
- owner-path RLS plus the active Library connection and the explicit file grant are required for ordinary upload/list/download;
- local cover blobs are not uploaded;
- metadata still travels through the revisioned Library snapshot, so a new device first adopts metadata and then downloads only exact SHA-256-matched files;
- downloaded files pass size/hash verification and the ordinary personal-publication inspection/import path before persistence;
- files above the cloud limit remain local-only and retain the existing manual SHA-256 relink path.

Revoking the optional permission stops ordinary file access. It does not silently delete retained objects. Destructive deletion remains owned by the THIEPN Account privacy lifecycle.

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

`public.library_sync_state` has RLS enabled. Authenticated users can select only their own row and only while the Library Account connection and read grant are active. The native Account session and the exact registered Library OAuth client are accepted; anonymous identities and unknown/delegated OAuth clients are denied raw state access. Sync mutations occur only through an owner-scoped revision-CAS RPC deriving the user from `auth.uid()` and checking the Library connection plus write grant. Destructive cloud-data deletion is routed through the audited THIEPN Account lifecycle and requires a recent authenticated session. The file-storage deletion path is separately authorized by an expiring Account deletion plan so the Library browser has no general cloud-file delete authority.

The browser contains only the Supabase publishable key and Library's public OAuth client ID. No OAuth client secret, service-role key, or other server secret is shipped.

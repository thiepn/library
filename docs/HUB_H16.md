# H16 — device-local Library continuity

Library owns `/library/hub` consent, `/library/hub/bridge` metadata reads and
`/library/hub/continue` identity-qualified handoffs. There is no Account or
Supabase dependency. Data belongs to the browser profile, including on shared
computers; sign-in does not establish account ownership of local reading data.

All summary/continue/search purposes start off. Imported titles require a fourth
explicit opt-in. Every save rotates the consent revision. Revocation removes
consent and the imported-title index. Backups never carry these sharing choices.
The bridge binds the exact Home parent, origin, source frame, random channel,
request ID, device and consent revision. Authorization is checked before and
after asynchronous reads. These same-origin applications share a script trust
boundary: consent is contractual enforcement, not isolation from malicious
same-origin JavaScript or browser extensions.

The allowlist is title, resource ID, EPUB/PDF format, edition, release, update
time, current and furthest progress. CFI, PDF anchors, chapters, book text,
files, covers, annotations, highlights, bookmarks, favorites, search text and
reading history are not exported. Active catalogue edition/release must match
stored progress; legacy unversioned web progress is deliberately unsupported.
Formats remain separate. The native readers retain responsibility for restoring
exact positions. A stale continuation identity never redirects to a newer release.

The bridge opens only existing supported native database versions, uses bounded
read-only cursors (1,024 rows per store) and does not create/upgrade reading DBs.
Blocked, incompatible and oversized storage fails as unavailable, not empty.
Summary/continue export at most 10 items, search at most 20. Search matches titles
only and remains in postMessage/RAM, never URLs or persistent state. Snapshots
expire after two minutes. Native progress events and cross-tab consent changes
invalidate the connection; Home must explicitly reconnect.

Imported-title indexing happens only on the top-level consent screen after the
user chooses it. Native import/delete hooks maintain that metadata index from
records already loaded by Library. The bridge uses key-only cursors against the
personal-books store, never its file/cover values, and drops deleted books.
Titles that cannot satisfy the contract make opt-in fail explicitly. Failed
index updates cannot break native import/delete and suppress indexed results.

Qualification: automated fictional browser fixtures consume the actual built
Library owner pages and actual staged Hub in Chromium, Firefox and WebKit.
Real personal browser/profile testing and public activation remain H20 work.
Production Hub keeps `PUBLIC_HUB_LIBRARY_PRIVATE` unset. This change does not
represent cloud synchronization, reading uploads, or permission activation.

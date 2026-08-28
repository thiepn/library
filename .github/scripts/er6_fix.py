from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, got {count}')
    return text.replace(old, new, 1)


# saved.astro server markup uses the same base path as its client script.
path = Path('src/pages/saved.astro')
text = path.read_text()
text = replace_once(
    text,
    "const works = await getWorks();\n---",
    "const works = await getWorks();\nconst base = import.meta.env.BASE_URL.replace(/\\/$/, '');\n---",
    'saved server base',
)
path.write_text(text)

# Activity writes are monotonic by openedAt, preventing a delayed older tab from replacing newer recency.
path = Path('src/lib/client/library-db.ts')
text = path.read_text()
old = """  await withStore('readingActivity', 'readwrite', async (store) => {
    await request(store.put(record));
  });
  broadcast('readingActivity', input.workId);
  return record;"""
new = """  let committed = record;
  await withStore('readingActivity', 'readwrite', async (store) => {
    const existing = await request<ReadingActivityRecordV1 | undefined>(store.get(input.workId));
    if (isReadingActivityRecordV1(existing) && existing.openedAt > record.openedAt) {
      committed = existing;
      return;
    }
    await request(store.put(record));
  });
  if (committed === record) broadcast('readingActivity', input.workId);
  return committed;"""
text = replace_once(text, old, new, 'monotonic activity write')
path.write_text(text)

# Record successful reader opens after the canonical reader has actually mounted.
path = Path('src/pages/works/[slug]/read/index.astro')
text = path.read_text()
old = """              void recordReadingOpen({
                workId: publication.workId,
                edition: publication.edition,
                releaseVersion: publication.version,
                format: 'epub',
                source: 'hosted',
              }).catch(() => {});
              readerPerformance?.markShellPainted();
              void bootNativeReader(publication);"""
new = """              readerPerformance?.markShellPainted();
              void bootNativeReader(publication);"""
text = replace_once(text, old, new, 'remove pre-mount hosted epub activity')
old = """          const handle = await mountReaderPublicationWithFallbackHarness(root, publication);
          if (pageClosing) handle.destroy();
          else {
            mounted = handle;
            if (handle.reader) void cacheReaderPublicationForOffline(publication.epub.url);
          }"""
new = """          const handle = await mountReaderPublicationWithFallbackHarness(root, publication);
          if (pageClosing) handle.destroy();
          else {
            mounted = handle;
            void recordReadingOpen({
              workId: publication.workId,
              edition: publication.edition,
              releaseVersion: publication.version,
              format: 'epub',
              source: 'hosted',
            }).catch(() => {});
            if (handle.reader) void cacheReaderPublicationForOffline(publication.epub.url);
          }"""
text = replace_once(text, old, new, 'post-mount hosted epub activity')
path.write_text(text)

path = Path('src/pages/works/[slug]/pdf.astro')
text = path.read_text()
old = """        void recordReadingOpen({
          ...candidate.identity,
          format: 'pdf',
          source: 'hosted',
        }).catch(() => {});
        mounted = await mountPdfReader(root, candidate);"""
new = """        mounted = await mountPdfReader(root, candidate);
        void recordReadingOpen({
          ...candidate.identity,
          format: 'pdf',
          source: 'hosted',
        }).catch(() => {});"""
text = replace_once(text, old, new, 'post-mount hosted pdf activity')
path.write_text(text)

path = Path('src/pages/personal/read.astro')
text = path.read_text()
old = """        void recordReadingOpen({ ...identity, format: 'epub', source: 'personal' }).catch(() => {});
        const handle = await mountReaderSourceWithFallbackHarness(root, {
          source,
          identity,
        });
        if (closing) handle.destroy();
        else mounted = handle;"""
new = """        const handle = await mountReaderSourceWithFallbackHarness(root, {
          source,
          identity,
        });
        if (closing) handle.destroy();
        else {
          mounted = handle;
          void recordReadingOpen({ ...identity, format: 'epub', source: 'personal' }).catch(() => {});
        }"""
text = replace_once(text, old, new, 'post-mount personal epub activity')
path.write_text(text)

path = Path('src/pages/personal/pdf.astro')
text = path.read_text()
old = """        void recordReadingOpen({ ...identity, format: 'pdf', source: 'personal' }).catch(() => {});
        const candidate: PdfCanonicalCandidate = {
          source,
          identity,"""
new = """        const candidate: PdfCanonicalCandidate = {
          source,
          identity,"""
text = replace_once(text, old, new, 'remove pre-mount personal pdf activity')
old = """        mounted = await mountPdfReader(root, candidate);"""
new = """        mounted = await mountPdfReader(root, candidate);
        void recordReadingOpen({ ...identity, format: 'pdf', source: 'personal' }).catch(() => {});"""
text = replace_once(text, old, new, 'post-mount personal pdf activity')
path.write_text(text)

# Continue Reading already owns in-progress works; Recently read avoids duplicating those rows.
path = Path('src/lib/reading-activity/library-dom.ts')
text = path.read_text()
text = replace_once(
    text,
    ".filter((item): item is { node: HTMLAnchorElement; state: ReadingLibraryState } => Boolean(item.state && hasReadingActivity(item.state)))",
    ".filter((item): item is { node: HTMLAnchorElement; state: ReadingLibraryState } => Boolean(item.state && hasReadingActivity(item.state) && item.state.status !== 'in-progress'))",
    'recent duplicate guard',
)
old = """  const anchor = node.querySelector<HTMLElement>(anchorSelector);
  if (anchor?.parentElement) anchor.parentElement.insertBefore(label, anchor);
  else node.append(label);"""
new = """  const anchor = node.querySelector<HTMLElement>(anchorSelector);
  if (anchor?.matches('.work-card')) anchor.insertAdjacentElement('afterend', label);
  else if (anchor?.parentElement) anchor.parentElement.insertBefore(label, anchor);
  else node.append(label);"""
text = replace_once(text, old, new, 'hosted state label placement')
path.write_text(text)

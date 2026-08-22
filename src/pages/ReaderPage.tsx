import { useEffect, useMemo, useState } from 'react';
import type { CatalogWork, ChapterDocument, LibraryState, WorkManifest } from '../domain';
import { loadChapter, loadWork } from '../lib/content';
import { setPreferences, setProgress, upsertAnnotation, removeAnnotation } from '../lib/library-store';
import { hrefFor } from '../lib/routes';
import { Link } from '../components/Link';
import { ErrorState, Loading } from '../components/Status';

export function ReaderPage({ work, chapterSlug, state }: { work: CatalogWork; chapterSlug?: string; state: LibraryState }) {
  const [manifest, setManifest] = useState<WorkManifest>();
  const [chapter, setChapter] = useState<ChapterDocument>();
  const [error, setError] = useState<string>();
  const [controlsOpen, setControlsOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    let active = true;
    setError(undefined);
    loadWork(work).then((value) => active && setManifest(value)).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Unable to load publication'));
    return () => { active = false; };
  }, [work]);

  const chapterRef = useMemo(() => manifest?.chapters.find((entry) => entry.slug === chapterSlug) ?? manifest?.chapters[0], [manifest, chapterSlug]);

  useEffect(() => {
    if (!chapterRef) return;
    let active = true;
    setChapter(undefined);
    setError(undefined);
    loadChapter(chapterRef.href).then((value) => active && setChapter(value)).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Unable to load chapter'));
    return () => { active = false; };
  }, [chapterRef]);

  useEffect(() => {
    if (!manifest || !chapterRef) return;
    const index = manifest.chapters.findIndex((entry) => entry.id === chapterRef.id);
    const percent = ((index + 1) / Math.max(1, manifest.chapters.length)) * 100;
    setProgress(work.id, { chapterId: chapterRef.id, chapterSlug: chapterRef.slug, percent, updatedAt: new Date().toISOString() });
  }, [manifest, chapterRef, work.id]);

  if (error) return <ErrorState message={error} />;
  if (!manifest || !chapterRef || !chapter) return <Loading label="Preparing reader" />;

  const chapterIndex = manifest.chapters.findIndex((entry) => entry.id === chapterRef.id);
  const previous = manifest.chapters[chapterIndex - 1];
  const next = manifest.chapters[chapterIndex + 1];
  const notes = state.annotations.filter((entry) => entry.workId === work.id && entry.chapterId === chapter.id);
  const prefs = state.preferences;
  const appearanceClass = prefs.appearance === 'system' ? '' : `reader-${prefs.appearance}`;

  function addNote() {
    const clean = noteText.trim();
    if (!clean) return;
    const now = new Date().toISOString();
    upsertAnnotation({ id: crypto.randomUUID(), workId: work.id, chapterId: chapter.id, note: clean, createdAt: now, updatedAt: now });
    setNoteText('');
  }

  return (
    <div className={`reader ${appearanceClass}`} style={{ '--reader-scale': prefs.fontScale, '--reader-leading': prefs.lineHeight, '--reader-measure': `${prefs.measure}ch` } as React.CSSProperties}>
      <header className="reader-bar">
        <Link href={hrefFor(`work/${work.slug}`)} className="reader-book-link"><span aria-hidden="true">←</span> {work.title}</Link>
        <div className="reader-tools">
          <button type="button" onClick={() => setNotesOpen((value) => !value)}>Notes{notes.length ? ` ${notes.length}` : ''}</button>
          <button type="button" onClick={() => setControlsOpen((value) => !value)}>Aa</button>
        </div>
      </header>

      {controlsOpen && (
        <aside className="reader-popover" aria-label="Reading preferences">
          <label>Text size <input type="range" min="0.85" max="1.25" step="0.05" value={prefs.fontScale} onChange={(event) => setPreferences({ fontScale: Number(event.target.value) })} /></label>
          <label>Line height <input type="range" min="1.45" max="2" step="0.05" value={prefs.lineHeight} onChange={(event) => setPreferences({ lineHeight: Number(event.target.value) })} /></label>
          <label>Measure <input type="range" min="52" max="82" step="2" value={prefs.measure} onChange={(event) => setPreferences({ measure: Number(event.target.value) })} /></label>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((appearance) => <button className={prefs.appearance === appearance ? 'active' : ''} type="button" key={appearance} onClick={() => setPreferences({ appearance })}>{appearance}</button>)}
          </div>
        </aside>
      )}

      {notesOpen && (
        <aside className="notes-panel" aria-label="Chapter notes">
          <div className="notes-panel-header"><h2>Chapter notes</h2><button type="button" onClick={() => setNotesOpen(false)}>Close</button></div>
          <textarea value={noteText} onChange={(event) => setNoteText(event.target.value)} placeholder="Write a note about this chapter…" rows={5} />
          <button className="primary-action" type="button" onClick={addNote}>Save note</button>
          <div className="notes-list">
            {notes.map((note) => <article key={note.id}><p>{note.note}</p><button type="button" onClick={() => removeAnnotation(note.id)}>Delete</button></article>)}
            {!notes.length && <p className="muted">No notes in this chapter.</p>}
          </div>
        </aside>
      )}

      <main className="reader-main">
        <aside className="reader-toc" aria-label="Table of contents">
          <p className="eyebrow">Contents</p>
          <ol>{manifest.chapters.map((entry) => <li className={entry.id === chapter.id ? 'active' : ''} key={entry.id}><Link href={hrefFor(`read/${work.slug}/${entry.slug}`)}>{entry.title}</Link></li>)}</ol>
        </aside>

        <article className="reader-article">
          <header>
            <p className="eyebrow">Chapter {chapterRef.number ?? chapterIndex + 1} of {manifest.chapters.length}</p>
            {chapter.kicker && <p className="chapter-kicker">{chapter.kicker}</p>}
            <h1>{chapter.title}</h1>
          </header>
          <div className="prose" dangerouslySetInnerHTML={{ __html: chapter.html }} />
          <nav className="chapter-nav" aria-label="Chapter navigation">
            {previous ? <Link href={hrefFor(`read/${work.slug}/${previous.slug}`)}><span>Previous</span>{previous.title}</Link> : <span />}
            {next ? <Link className="next" href={hrefFor(`read/${work.slug}/${next.slug}`)}><span>Next</span>{next.title}</Link> : <Link className="next" href={hrefFor(`work/${work.slug}`)}><span>Finished</span>Back to publication</Link>}
          </nav>
        </article>
      </main>
    </div>
  );
}

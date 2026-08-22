import { useEffect, useState } from 'react';
import type { CatalogWork, LibraryState, WorkManifest } from '../domain';
import { loadWork } from '../lib/content';
import { setSaved } from '../lib/library-store';
import { hrefFor } from '../lib/routes';
import { Link } from '../components/Link';
import { ErrorState, Loading } from '../components/Status';

export function WorkPage({ work, state }: { work: CatalogWork; state: LibraryState }) {
  const [manifest, setManifest] = useState<WorkManifest>();
  const [error, setError] = useState<string>();
  const saved = state.savedWorkIds.includes(work.id);
  const progress = state.progress[work.id];

  useEffect(() => {
    let active = true;
    loadWork(work).then((value) => active && setManifest(value)).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : 'Unable to load publication'));
    return () => { active = false; };
  }, [work]);

  if (error) return <ErrorState message={error} />;
  if (!manifest) return <Loading label={`Opening ${work.title}`} />;

  const firstChapter = manifest.chapters[0];
  return (
    <article className="work-page">
      <header className="work-masthead">
        <div className="work-cover large-cover">{work.cover ? <img src={`${import.meta.env.BASE_URL}${work.cover.replace(/^\//, '')}`} alt="" /> : <span>{work.title.slice(0, 1)}</span>}</div>
        <div className="work-masthead-copy">
          <p className="eyebrow">{manifest.edition ?? 'Digital edition'}</p>
          <h1>{work.title}</h1>
          {work.subtitle && <p className="work-deck">{work.subtitle}</p>}
          <p className="byline">By {work.authors.join(', ')}</p>
          <p className="work-description">{work.description}</p>
          <div className="work-actions">
            {firstChapter && (
              <Link className="primary-action" href={hrefFor(`read/${work.slug}/${progress?.chapterSlug ?? firstChapter.slug}`)}>
                {progress?.percent ? 'Continue reading' : 'Start reading'}
              </Link>
            )}
            <button className="text-action" type="button" onClick={() => setSaved(work.id, !saved)}>{saved ? 'Remove from my library' : 'Save to my library'}</button>
          </div>
          <dl className="work-facts">
            <div><dt>Published</dt><dd>{new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(new Date(work.publishedAt))}</dd></div>
            <div><dt>Language</dt><dd>{work.language}</dd></div>
            <div><dt>Length</dt><dd>{manifest.chapters.length} chapters{work.readingMinutes ? ` · ~${work.readingMinutes} min` : ''}</dd></div>
          </dl>
        </div>
      </header>

      <section className="work-contents">
        <div className="section-heading"><div><p className="eyebrow">Contents</p><h2>Table of contents</h2></div></div>
        {manifest.parts.length ? manifest.parts.map((part) => (
          <section className="toc-part" key={part.id}>
            <h3>{part.title}</h3>
            <ol>
              {part.chapterIds.map((chapterId) => {
                const chapter = manifest.chapters.find((entry) => entry.id === chapterId);
                return chapter ? <li key={chapter.id}><Link href={hrefFor(`read/${work.slug}/${chapter.slug}`)}><span>{chapter.number ?? '—'}</span>{chapter.title}</Link></li> : null;
              })}
            </ol>
          </section>
        )) : (
          <ol className="flat-toc">{manifest.chapters.map((chapter) => <li key={chapter.id}><Link href={hrefFor(`read/${work.slug}/${chapter.slug}`)}>{chapter.title}</Link></li>)}</ol>
        )}
      </section>

      {manifest.formats.length > 0 && (
        <section className="edition-row">
          <div><p className="eyebrow">Editions</p><h2>Read in your preferred format</h2></div>
          <div className="edition-links">
            {manifest.formats.map((format) => format.kind === 'pdf' ? (
              <Link key={format.kind} href={hrefFor(`document/${work.slug}/pdf`)}>{format.label}</Link>
            ) : (
              <a key={format.kind} href={`${import.meta.env.BASE_URL}${format.href.replace(/^\//, '')}`} download={format.kind === 'epub' ? true : undefined}>{format.label}</a>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}

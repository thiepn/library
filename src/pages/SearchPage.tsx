import { useEffect, useMemo, useState } from 'react';
import type { SearchEntry } from '../domain';
import { loadSearchIndex } from '../lib/content';
import { searchEntries } from '../lib/search';
import { hrefFor, navigate } from '../lib/routes';
import { Link } from '../components/Link';

export function SearchPage({ initialQuery }: { initialQuery: string }) {
  const [entries, setEntries] = useState<SearchEntry[]>([]);
  const [query, setQuery] = useState(initialQuery);
  const [error, setError] = useState<string>();

  useEffect(() => {
    loadSearchIndex().then((index) => setEntries(index.entries)).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Search index unavailable'));
  }, []);

  useEffect(() => setQuery(initialQuery), [initialQuery]);
  const results = useMemo(() => searchEntries(entries, query), [entries, query]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const clean = query.trim();
    navigate(`${hrefFor('search')}?q=${encodeURIComponent(clean)}`);
  }

  return (
    <section className="page-section search-page">
      <div className="page-title-row"><div><p className="eyebrow">Full-text archive</p><h1>Search</h1></div></div>
      <form className="search-form" onSubmit={submit} role="search">
        <input autoFocus aria-label="Search library" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, chapters, topics…" />
        <button type="submit">Search</button>
      </form>
      {error && <p className="form-error">{error}</p>}
      {initialQuery && !results.length && !error && <div className="empty-state"><h2>No results for “{initialQuery}”.</h2><p>Search covers published titles, chapter headings, topics, and indexed text.</p></div>}
      <div className="search-results">
        {results.map(({ entry }) => {
          const href = entry.chapterSlug ? hrefFor(`read/${entry.workSlug}/${entry.chapterSlug}`) : hrefFor(`work/${entry.workSlug}`);
          return (
            <article key={entry.id}>
              <p className="eyebrow">{entry.workTitle}</p>
              <h2><Link href={href}>{entry.title}</Link></h2>
              <p>{entry.text.slice(0, 260)}{entry.text.length > 260 ? '…' : ''}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

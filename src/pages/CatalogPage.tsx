import type { Catalog, LibraryState } from '../domain';
import { WorkCard } from '../components/WorkCard';
import { Link } from '../components/Link';
import { hrefFor } from '../lib/routes';

export function CatalogPage({ catalog, state }: { catalog: Catalog; state: LibraryState }) {
  const topics = [...new Set(catalog.works.flatMap((work) => work.topics))].sort();
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Independent digital editions</p>
          <h1>A library designed for reading, not browsing.</h1>
        </div>
        <p className="hero-copy">
          Long-form books, essays, research editions, and courses published as durable web texts with downloadable editions when available.
        </p>
      </section>

      <section className="catalog-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Catalog</p>
            <h2>All works</h2>
          </div>
          {topics.length > 0 && <p className="catalog-count">{catalog.works.length} works · {topics.length} topics</p>}
        </div>

        {catalog.works.length ? (
          <div className="work-grid">
            {catalog.works.map((work) => (
              <WorkCard key={work.id} work={work} progress={state.progress[work.id]?.percent} />
            ))}
          </div>
        ) : (
          <div className="empty-state publication-empty">
            <p className="eyebrow">Repository ready</p>
            <h2>No publications have been imported yet.</h2>
            <p>The application shell is live. The next content operation is to publish the first complete work into the catalog.</p>
          </div>
        )}
      </section>

      <section className="catalog-actions" aria-label="Library shortcuts">
        <Link href={hrefFor('saved')}>Open my library <span aria-hidden="true">→</span></Link>
        <Link href={hrefFor('search')}>Search the archive <span aria-hidden="true">→</span></Link>
      </section>
    </>
  );
}

import type { Catalog, LibraryState } from '../domain';
import { WorkCard } from '../components/WorkCard';

export function SavedPage({ catalog, state }: { catalog: Catalog; state: LibraryState }) {
  const works = catalog.works.filter((work) => state.savedWorkIds.includes(work.id));
  return (
    <section className="page-section">
      <div className="page-title-row">
        <div>
          <p className="eyebrow">Personal reading state</p>
          <h1>My library</h1>
        </div>
        <p>{works.length} saved</p>
      </div>
      {works.length ? (
        <div className="work-grid">{works.map((work) => <WorkCard key={work.id} work={work} progress={state.progress[work.id]?.percent} />)}</div>
      ) : (
        <div className="empty-state"><h2>Nothing saved yet.</h2><p>Save a published work from its detail page. Reading progress stays on this device.</p></div>
      )}
    </section>
  );
}

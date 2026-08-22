import { AppShell } from './components/AppShell';
import { ErrorState, Loading } from './components/Status';
import { useCatalog, useLibraryState, useRoute } from './hooks';
import { CatalogPage } from './pages/CatalogPage';
import { SavedPage } from './pages/SavedPage';
import { WorkPage } from './pages/WorkPage';
import { ReaderPage } from './pages/ReaderPage';
import { SearchPage } from './pages/SearchPage';
import { DocumentPage } from './pages/DocumentPage';
import { Link } from './components/Link';
import { hrefFor } from './lib/routes';

export default function App() {
  const route = useRoute();
  const { catalog, error } = useCatalog();
  const state = useLibraryState();

  if (error) return <AppShell><ErrorState message={error} /></AppShell>;
  if (!catalog) return <AppShell><Loading /></AppShell>;

  const work = 'slug' in route ? catalog.works.find((entry) => entry.slug === route.slug) : undefined;

  if (route.name === 'reader') {
    return work ? <ReaderPage work={work} chapterSlug={route.chapterSlug} state={state} /> : <NotFound />;
  }

  if (route.name === 'document') {
    return work ? <DocumentPage work={work} /> : <NotFound />;
  }

  return (
    <AppShell>
      {route.name === 'catalog' && <CatalogPage catalog={catalog} state={state} />}
      {route.name === 'saved' && <SavedPage catalog={catalog} state={state} />}
      {route.name === 'search' && <SearchPage initialQuery={route.query} />}
      {route.name === 'work' && (work ? <WorkPage work={work} state={state} /> : <NotFound />)}
      {route.name === 'notFound' && <NotFound />}
    </AppShell>
  );
}

function NotFound() {
  return (
    <section className="empty-state not-found">
      <p className="eyebrow">404</p>
      <h1>This shelf does not exist.</h1>
      <p><Link href={hrefFor('')}>Return to the catalog</Link></p>
    </section>
  );
}

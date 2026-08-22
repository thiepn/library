import { useEffect, useState } from 'react';
import type { Catalog, LibraryState } from './domain';
import { loadCatalog } from './lib/content';
import { readLibraryState, subscribeLibraryState } from './lib/library-store';
import { routeFromLocation, type Route } from './lib/routes';

export function useRoute() {
  const [route, setRoute] = useState<Route>(() => routeFromLocation());
  useEffect(() => {
    const update = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  return route;
}

export function useCatalog() {
  const [state, setState] = useState<{ catalog?: Catalog; error?: string }>({});
  useEffect(() => {
    let active = true;
    loadCatalog()
      .then((catalog) => active && setState({ catalog }))
      .catch((error: unknown) => active && setState({ error: error instanceof Error ? error.message : 'Unable to load catalog' }));
    return () => { active = false; };
  }, []);
  return state;
}

export function useLibraryState() {
  const [state, setState] = useState<LibraryState>(() => readLibraryState());
  useEffect(() => subscribeLibraryState(() => setState(readLibraryState())), []);
  return state;
}

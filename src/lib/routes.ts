const BASE = '/library';

export type Route =
  | { name: 'catalog' }
  | { name: 'saved' }
  | { name: 'search'; query: string }
  | { name: 'work'; slug: string }
  | { name: 'reader'; slug: string; chapterSlug?: string }
  | { name: 'document'; slug: string; kind: 'pdf' }
  | { name: 'notFound' };

export function routeFromLocation(): Route {
  let path = window.location.pathname;
  if (path === BASE) path = `${BASE}/`;
  if (!path.startsWith(BASE)) return { name: 'notFound' };
  const relative = path.slice(BASE.length).replace(/^\/+|\/+$/g, '');
  const parts = relative ? relative.split('/').map(decodeURIComponent) : [];
  const params = new URLSearchParams(window.location.search);

  if (!parts.length) return { name: 'catalog' };
  if (parts[0] === 'saved' && parts.length === 1) return { name: 'saved' };
  if (parts[0] === 'search' && parts.length === 1) return { name: 'search', query: params.get('q') ?? '' };
  if (parts[0] === 'work' && parts[1] && parts.length === 2) return { name: 'work', slug: parts[1] };
  if (parts[0] === 'read' && parts[1]) return { name: 'reader', slug: parts[1], chapterSlug: parts[2] };
  if (parts[0] === 'document' && parts[1] && parts[2] === 'pdf') return { name: 'document', slug: parts[1], kind: 'pdf' };
  return { name: 'notFound' };
}

export function hrefFor(path: string) {
  const clean = path.replace(/^\/+/, '');
  return `${BASE}/${clean}`.replace(/\/$/, clean ? '' : '/');
}

export function navigate(path: string) {
  const href = path.startsWith(BASE) ? path : hrefFor(path);
  window.history.pushState({}, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

export function interceptLink(event: React.MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const anchor = event.currentTarget;
  const url = new URL(anchor.href);
  if (url.origin === window.location.origin && url.pathname.startsWith(BASE)) {
    event.preventDefault();
    navigate(url.pathname + url.search + url.hash);
  }
}

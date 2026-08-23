export const LIBRARY_BASE = '/library';
export const LIBRARY_ORIGIN = 'https://thiepn.dev';
export const LIBRARY_URL = `${LIBRARY_ORIGIN}${LIBRARY_BASE}`;

export function libraryPath(path = ''): string {
  if (!path) return LIBRARY_BASE;
  return `${LIBRARY_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

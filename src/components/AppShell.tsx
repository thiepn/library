import type { PropsWithChildren } from 'react';
import { Link } from './Link';
import { hrefFor } from '../lib/routes';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="site-shell">
      <header className="site-header">
        <Link className="brand" href={hrefFor('')} aria-label="Library home">
          <span className="brand-mark" aria-hidden="true">L</span>
          <span>Library</span>
        </Link>
        <nav className="main-nav" aria-label="Primary navigation">
          <Link href={hrefFor('')}>Catalog</Link>
          <Link href={hrefFor('saved')}>My library</Link>
          <Link href={hrefFor('search')}>Search</Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer className="site-footer">
        <span>Library</span>
        <span>Books, research, and courses in durable web editions.</span>
      </footer>
    </div>
  );
}

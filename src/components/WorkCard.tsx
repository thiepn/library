import type { CatalogWork } from '../domain';
import { Link } from './Link';
import { hrefFor } from '../lib/routes';

export function WorkCard({ work, progress }: { work: CatalogWork; progress?: number }) {
  return (
    <article className="work-card">
      <Link className="work-cover" href={hrefFor(`work/${work.slug}`)} aria-label={`Open ${work.title}`}>
        {work.cover ? <img src={`${import.meta.env.BASE_URL}${work.cover.replace(/^\//, '')}`} alt="" /> : <span>{work.title.slice(0, 1)}</span>}
      </Link>
      <div className="work-card-body">
        <p className="eyebrow">{work.topics.slice(0, 2).join(' · ') || 'Publication'}</p>
        <h2><Link href={hrefFor(`work/${work.slug}`)}>{work.title}</Link></h2>
        {work.subtitle && <p className="work-subtitle">{work.subtitle}</p>}
        <p className="work-meta">{work.authors.join(', ')} · {new Date(work.publishedAt).getFullYear()}</p>
        {typeof progress === 'number' && progress > 0 && (
          <div className="progress-line" aria-label={`${Math.round(progress)} percent read`}>
            <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}

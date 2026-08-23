import type { APIRoute } from 'astro';
import { getWorks } from '../lib/content/repository';
import { getChaptersForWork } from '../lib/content/chapters';
import { getTaxonomyItems } from '../lib/content/taxonomy';
import { LIBRARY_URL } from '../lib/site';

const escapeXml = (value: string) => value.replace(/[<>&'\"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char);

export const GET: APIRoute = async () => {
  const works = await getWorks();
  const urls: Array<{ loc: string; lastmod?: string }> = [
    { loc: LIBRARY_URL },
    { loc: `${LIBRARY_URL}/subjects` },
    { loc: `${LIBRARY_URL}/collections` },
    { loc: `${LIBRARY_URL}/about` },
  ];
  for (const subject of getTaxonomyItems(works, 'subjects')) urls.push({ loc: `${LIBRARY_URL}/subjects/${subject.slug}` });
  for (const collection of getTaxonomyItems(works, 'collections')) urls.push({ loc: `${LIBRARY_URL}/collections/${collection.slug}` });
  for (const work of works) {
    const lastmod = String(work.publication.lastUpdated).slice(0, 10);
    urls.push({ loc: `${LIBRARY_URL}/works/${work.slug}`, lastmod });
    if (work.webMaterialized) {
      for (const chapter of await getChaptersForWork(work.id)) urls.push({ loc: `${LIBRARY_URL}/works/${work.slug}/read/${chapter.entry.data.id}`, lastmod });
    }
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
};

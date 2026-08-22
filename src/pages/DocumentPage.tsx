import type { CatalogWork } from '../domain';
import { useEffect, useState } from 'react';
import { loadWork } from '../lib/content';
import { Link } from '../components/Link';
import { hrefFor } from '../lib/routes';
import { ErrorState, Loading } from '../components/Status';

export function DocumentPage({ work }: { work: CatalogWork }) {
  const [pdfHref, setPdfHref] = useState<string>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    loadWork(work).then((manifest) => {
      const pdf = manifest.formats.find((format) => format.kind === 'pdf');
      if (!pdf) throw new Error('This work has no PDF edition.');
      setPdfHref(`${import.meta.env.BASE_URL}${pdf.href.replace(/^\//, '')}`);
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'PDF unavailable'));
  }, [work]);
  if (error) return <ErrorState message={error} />;
  if (!pdfHref) return <Loading label="Opening PDF edition" />;
  return (
    <div className="document-viewer">
      <header><Link href={hrefFor(`work/${work.slug}`)}>← {work.title}</Link><a href={pdfHref} target="_blank" rel="noreferrer">Open PDF in browser</a></header>
      <object data={pdfHref} type="application/pdf"><p>Your browser cannot display this PDF. <a href={pdfHref}>Open the PDF directly.</a></p></object>
    </div>
  );
}

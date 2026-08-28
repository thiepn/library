export interface PdfReaderIdentity {
  workId: string;
  edition: number;
  releaseVersion: string;
}

export interface PdfCanonicalCandidate {
  source: string | ArrayBuffer;
  identity: PdfReaderIdentity;
  title: string;
  language?: string;
  fallbackUrl?: string;
  backHref?: string;
}

export interface HostedPdfCandidateInput {
  workId: string;
  edition: number;
  releaseVersion: string;
  url: string;
  title: string;
  language?: string;
  fallbackUrl?: string;
  backHref?: string;
}

/**
 * ER4 pure transport adapter. Hosted URLs and browser-local ArrayBuffers remain distinct
 * source transports while sharing one exact-release reader identity and runtime contract.
 */
export function pdfCanonicalCandidateFromHosted(input: HostedPdfCandidateInput): PdfCanonicalCandidate {
  return {
    source: input.url,
    identity: {
      workId: input.workId,
      edition: input.edition,
      releaseVersion: input.releaseVersion,
    },
    title: input.title,
    ...(input.language ? { language: input.language } : {}),
    ...(input.fallbackUrl ? { fallbackUrl: input.fallbackUrl } : {}),
    ...(input.backHref ? { backHref: input.backHref } : {}),
  };
}

export function pdfReaderIdentityKey(identity: PdfReaderIdentity): string {
  return `${encodeURIComponent(identity.workId)}::${identity.edition}::${encodeURIComponent(identity.releaseVersion)}`;
}

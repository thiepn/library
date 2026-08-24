import { readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { WorkManifest } from './schema';

export interface ReleaseArtifact {
  url: string;
  sizeBytes: number;
  sha256: string;
  filename: string;
  mimeType: string;
}

export interface PublicationRelease {
  schemaVersion: 1;
  workId: string;
  version: string;
  edition: number;
  releasedAt: string;
  sourceHash?: string;
  artifacts: {
    pdf?: ReleaseArtifact;
    epub?: ReleaseArtifact;
  };
}

const releasesRoot = path.join(process.cwd(), 'src/publications/releases');
const mediaOrigin = 'https://thiepn.dev/library/media/';
const sha256 = /^[a-f0-9]{64}$/i;

function artifact(value: unknown, kind: 'pdf' | 'epub'): ReleaseArtifact | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const expectedMime = kind === 'pdf' ? 'application/pdf' : 'application/epub+zip';
  if (typeof candidate.url !== 'string' || !candidate.url.startsWith(mediaOrigin)) return undefined;
  if (typeof candidate.filename !== 'string' || candidate.filename.trim() === '') return undefined;
  if (candidate.mimeType !== expectedMime) return undefined;
  if (!Number.isInteger(candidate.sizeBytes) || Number(candidate.sizeBytes) <= 0) return undefined;
  if (typeof candidate.sha256 !== 'string' || !sha256.test(candidate.sha256)) return undefined;
  return {
    url: candidate.url,
    filename: candidate.filename,
    mimeType: expectedMime,
    sizeBytes: Number(candidate.sizeBytes),
    sha256: candidate.sha256.toLowerCase(),
  };
}

export async function getActiveRelease(work: WorkManifest): Promise<PublicationRelease | undefined> {
  const version = work.publication.activeRelease;
  if (!version) return undefined;
  try {
    const raw = YAML.parse(await readFile(path.join(releasesRoot, work.id, `${version}.yaml`), 'utf8')) as Record<string, unknown>;
    if (raw.schemaVersion !== 1 || raw.workId !== work.id || raw.version !== version || raw.edition !== work.publication.edition) return undefined;
    const artifactsRaw = raw.artifacts && typeof raw.artifacts === 'object' ? raw.artifacts as Record<string, unknown> : {};
    const pdf = work.formats.pdf.enabled ? artifact(artifactsRaw.pdf, 'pdf') : undefined;
    const epub = work.formats.epub.enabled ? artifact(artifactsRaw.epub, 'epub') : undefined;
    if (work.formats.pdf.enabled && !pdf) return undefined;
    if (work.formats.epub.enabled && !epub) return undefined;
    const releasedAt = typeof raw.releasedAt === 'string' ? raw.releasedAt : '';
    if (!releasedAt) return undefined;
    return {
      schemaVersion: 1,
      workId: work.id,
      version,
      edition: work.publication.edition,
      releasedAt,
      ...(typeof raw.sourceHash === 'string' && sha256.test(raw.sourceHash) ? { sourceHash: raw.sourceHash.toLowerCase() } : {}),
      artifacts: { ...(pdf ? { pdf } : {}), ...(epub ? { epub } : {}) },
    };
  } catch {
    return undefined;
  }
}

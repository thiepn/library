/** Metadata-only Library-owned Hub contract. Reader anchors, annotations and file bytes never cross it. */
export const CONSENT_KEY = 'thiepn:library:hub-consent:v1';
export const PERSONAL_INDEX_KEY = 'thiepn:library:hub-personal-index:v1';
export const OPERATIONS = ['summary', 'continue', 'search'] as const;
export type Operation = typeof OPERATIONS[number];

export interface LegacyConsentV1 {
  schemaVersion: 1;
  deviceId: string;
  revision: string;
  permissions: Operation[];
  includePersonal: boolean;
}

export interface Consent {
  schemaVersion: 2;
  deviceId: string;
  revision: string;
  permissions: Operation[];
  includePersonal: boolean;
  includeAccount: boolean;
}

export interface Book {
  workId: string;
  title: string;
  format: 'epub' | 'pdf';
  edition: number;
  releaseVersion: string;
  slug: string;
  personalId?: string;
}

export interface Item {
  resourceId: string;
  title: string;
  updatedAt: string;
  format: 'epub' | 'pdf';
  edition: number;
  releaseVersion: string;
  current: number;
  furthest: number;
}

export const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const exact = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).sort().join(',') === [...keys].sort().join(',');
export const token = (v: unknown): v is string => typeof v === 'string' && /^[a-zA-Z0-9:_-]{1,128}$/.test(v);
export const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
export const timestamp = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
export const title = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 160 && !/[\u0000-\u001f\u007f]/.test(v);

function validPermissions(value: unknown): value is Operation[] {
  return Array.isArray(value)
    && value.length <= OPERATIONS.length
    && new Set(value).size === value.length
    && value.every((permission) => OPERATIONS.includes(permission as Operation));
}

export function parseConsent(value: unknown): Consent | null {
  if (!object(value) || !uuid(value.deviceId) || !uuid(value.revision) || !validPermissions(value.permissions) || typeof value.includePersonal !== 'boolean') return null;
  if (value.schemaVersion === 1
    && exact(value, ['schemaVersion', 'deviceId', 'revision', 'permissions', 'includePersonal'])) {
    return {
      schemaVersion: 2,
      deviceId: value.deviceId,
      revision: value.revision,
      permissions: value.permissions,
      includePersonal: value.includePersonal,
      includeAccount: false,
    };
  }
  if (value.schemaVersion === 2
    && exact(value, ['schemaVersion', 'deviceId', 'revision', 'permissions', 'includePersonal', 'includeAccount'])
    && typeof value.includeAccount === 'boolean') {
    return value as unknown as Consent;
  }
  return null;
}

export function legacyConsent(consent: Consent): LegacyConsentV1 {
  return {
    schemaVersion: 1,
    deviceId: consent.deviceId,
    revision: consent.revision,
    permissions: consent.permissions,
    includePersonal: consent.includePersonal,
  };
}

export function readConsent(): Consent | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    return raw && raw.length < 1280 ? parseConsent(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function validBook(v: unknown): v is Book {
  return object(v) && token(v.workId) && title(v.title) && (v.format === 'epub' || v.format === 'pdf') && Number.isInteger(v.edition) && Number(v.edition) > 0 && Number(v.edition) <= 100000 && token(v.releaseVersion) && typeof v.slug === 'string' && /^[a-z0-9-]{1,128}$/.test(v.slug) && (v.personalId === undefined || token(v.personalId)) && token(`${v.workId}:${v.format}`);
}

export function project(books: Book[], epub: unknown[], pdf: unknown[], operation: Operation, query = '', now = Date.now()): Item[] {
  const rows: Item[] = [];
  for (const book of books) {
    if (!validBook(book) || (operation === 'search' && !book.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))) continue;
    const candidates = (book.format === 'epub' ? epub : pdf).filter(value => {
      if (!object(value) || value.schemaVersion !== (book.format === 'epub' ? 2 : 1) || !timestamp(value.updatedAt) || Date.parse(value.updatedAt) > now) return false;
      const identity = book.format === 'epub' ? value : value.identity;
      return object(identity) && identity.workId === book.workId && identity.edition === book.edition && identity.releaseVersion === book.releaseVersion;
    }) as Record<string, unknown>[];
    const record = candidates.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    if (!record) continue;
    let current: unknown = record.percentage, furthest: unknown = record.furthestPercentage;
    if (book.format === 'pdf') {
      if (![record.page, record.furthestPage, record.pageCount].every(n => Number.isInteger(n) && Number(n) >= 1) || Number(record.pageCount) > 1000000 || Number(record.page) > Number(record.furthestPage) || Number(record.furthestPage) > Number(record.pageCount)) continue;
      current = Number(record.page) / Number(record.pageCount);
      furthest = Number(record.furthestPage) / Number(record.pageCount);
    }
    if (typeof current !== 'number' || typeof furthest !== 'number' || !Number.isFinite(current) || !Number.isFinite(furthest) || current < 0 || current > furthest || furthest > 1) continue;
    rows.push({ resourceId: `${book.workId}:${book.format}`, title: book.title, updatedAt: record.updatedAt, format: book.format, edition: book.edition, releaseVersion: book.releaseVersion, current, furthest });
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.resourceId.localeCompare(b.resourceId)).slice(0, operation === 'search' ? 20 : 10);
}

export function continuation(books: Book[], resourceId: string, edition: number, releaseVersion: string): string | null {
  const book = books.find(b => validBook(b) && `${b.workId}:${b.format}` === resourceId && b.edition === edition && b.releaseVersion === releaseVersion);
  if (!book) return null;
  return book.personalId ? `/library/personal/${book.format === 'epub' ? 'read' : 'pdf'}?id=${encodeURIComponent(book.personalId)}` : book.format === 'epub' ? `/library/read/${book.slug}` : `/library/works/${book.slug}/pdf`;
}

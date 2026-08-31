const ACTIVE_CONTENT_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'applet']);
const SCRIPT_URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction']);
const RESOURCE_URL_ATTRIBUTES = new Set(['src', 'poster', 'data', 'srcset']);
const RESOURCE_HREF_ELEMENTS = new Set(['link', 'image', 'use', 'feimage']);

export const READER_EPUB_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data: blob:",
  "style-src 'unsafe-inline' blob:",
].join('; ');

function normalizedAttributeValue(value: string): string {
  return value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
}

function isRemoteResourceValue(value: string): boolean {
  const normalized = normalizedAttributeValue(value);
  if (normalized.startsWith('//')) return true;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(normalized)) return false;
  return !normalized.startsWith('blob:') && !normalized.startsWith('data:');
}

function srcsetHasRemoteResource(value: string): boolean {
  return value.split(',').some((candidate) => {
    const url = candidate.trim().split(/\s+/, 1)[0] ?? '';
    return isRemoteResourceValue(url);
  });
}

/**
 * EPUB.js needs `allow-scripts` in WebKit for parent-installed DOM event callbacks to run
 * inside its sandboxed srcdoc iframe. Before a spine document is serialized, remove publisher
 * executable surfaces and add a CSP that keeps publication scripting disabled. This preserves
 * the reader's programmatic input handlers without granting arbitrary EPUB content script power.
 *
 * Import preflight rejects remote publication resources. The sanitizer repeats that boundary at
 * render time so a stale/bypassed compatibility report still cannot turn an EPUB frame into a
 * network client.
 */
export function sanitizeEpubDocument(document: Document): void {
  const namespace = document.documentElement?.namespaceURI ?? 'http://www.w3.org/1999/xhtml';
  let head: Element | null = null;

  for (const element of Array.from(document.getElementsByTagName('*'))) {
    const localName = element.localName.toLowerCase();
    if (localName === 'head') head = element;

    if (ACTIVE_CONTENT_ELEMENTS.has(localName)) {
      element.remove();
      continue;
    }

    if (localName === 'meta' && element.getAttribute('http-equiv')?.trim().toLowerCase() === 'refresh') {
      element.remove();
      continue;
    }

    if (localName === 'a' && element.hasAttribute('ping')) element.removeAttribute('ping');

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLowerCase();
      const value = normalizedAttributeValue(attribute.value);
      if (name.startsWith('on') || (SCRIPT_URL_ATTRIBUTES.has(name) && value.startsWith('javascript:'))) {
        element.removeAttributeNode(attribute);
        continue;
      }

      if (RESOURCE_URL_ATTRIBUTES.has(name)) {
        const remote = name === 'srcset' ? srcsetHasRemoteResource(attribute.value) : isRemoteResourceValue(attribute.value);
        if (remote) element.removeAttributeNode(attribute);
        continue;
      }

      if ((name === 'href' || name === 'xlink:href') && RESOURCE_HREF_ELEMENTS.has(localName) && isRemoteResourceValue(attribute.value)) {
        element.removeAttributeNode(attribute);
      }
    }
  }

  if (!head) {
    head = document.createElementNS(namespace, 'head');
    document.documentElement?.insertBefore(head, document.documentElement.firstChild);
  }
  if (!head) return;

  for (const existing of Array.from(head.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]'))) existing.remove();

  const meta = document.createElementNS(namespace, 'meta');
  meta.setAttribute('http-equiv', 'Content-Security-Policy');
  meta.setAttribute('content', READER_EPUB_CSP);
  meta.setAttribute('data-reader-csp', 'true');
  head.insertBefore(meta, head.firstChild);
}
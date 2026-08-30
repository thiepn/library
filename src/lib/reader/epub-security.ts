const ACTIVE_CONTENT_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'base']);
const SCRIPT_URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction']);

export const READER_EPUB_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data: blob:",
  "style-src 'self' blob: 'unsafe-inline'",
].join('; ');

function normalizedAttributeValue(value: string): string {
  return value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
}

function isExecutableNavigation(value: string): boolean {
  return value.startsWith('javascript:')
    || value.startsWith('vbscript:')
    || value.startsWith('data:text/html')
    || value.startsWith('data:application/xhtml+xml')
    || value.startsWith('file:')
    || value.startsWith('filesystem:');
}

/**
 * EPUB.js needs `allow-scripts` in WebKit for parent-installed DOM event callbacks to run
 * inside its sandboxed srcdoc iframe. Before a spine document is serialized, remove publisher
 * executable surfaces and add a CSP that keeps publication scripting and remote subresources
 * disabled. This preserves the reader's programmatic input handlers without granting arbitrary
 * EPUB content script or network power.
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

    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.localName.toLowerCase();
      const value = normalizedAttributeValue(attribute.value);
      const executableUrl = SCRIPT_URL_ATTRIBUTES.has(name)
        && (value.startsWith('javascript:') || value.startsWith('vbscript:'));
      const executableNavigation = (name === 'href' || name === 'action' || name === 'formaction')
        && isExecutableNavigation(value);
      if (name.startsWith('on') || executableUrl || executableNavigation) {
        element.removeAttributeNode(attribute);
      }
    }
  }

  if (!head) {
    head = document.createElementNS(namespace, 'head');
    document.documentElement?.insertBefore(head, document.documentElement.firstChild);
  }
  if (!head) return;

  for (const existing of Array.from(head.querySelectorAll('meta[http-equiv="Content-Security-Policy" i]'))) {
    existing.remove();
  }

  const meta = document.createElementNS(namespace, 'meta');
  meta.setAttribute('http-equiv', 'Content-Security-Policy');
  meta.setAttribute('content', READER_EPUB_CSP);
  meta.setAttribute('data-reader-csp', 'true');
  head.insertBefore(meta, head.firstChild);
}

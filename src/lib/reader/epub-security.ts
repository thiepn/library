const ACTIVE_CONTENT_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'applet']);
const SCRIPT_URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction']);

export const READER_EPUB_CSP = [
  "script-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
].join('; ');

function normalizedAttributeValue(value: string): string {
  return value.replace(/[\u0000-\u0020]+/g, '').toLowerCase();
}

/**
 * EPUB.js needs `allow-scripts` in WebKit for parent-installed DOM event callbacks to run
 * inside its sandboxed srcdoc iframe. Before a spine document is serialized, remove publisher
 * executable surfaces and add a CSP that keeps publication scripting disabled. This preserves
 * the reader's programmatic input handlers without granting arbitrary EPUB content script power.
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
      if (name.startsWith('on') || (SCRIPT_URL_ATTRIBUTES.has(name) && value.startsWith('javascript:'))) {
        element.removeAttributeNode(attribute);
      }
    }
  }

  if (!head) {
    head = document.createElementNS(namespace, 'head');
    document.documentElement?.insertBefore(head, document.documentElement.firstChild);
  }
  if (!head) return;

  const meta = document.createElementNS(namespace, 'meta');
  meta.setAttribute('http-equiv', 'Content-Security-Policy');
  meta.setAttribute('content', READER_EPUB_CSP);
  meta.setAttribute('data-reader-csp', 'true');
  head.insertBefore(meta, head.firstChild);
}

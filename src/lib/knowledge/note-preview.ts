import { notebookTitle, type BookNoteDocumentV1 } from './note-model';

export interface NotebookPreviewOptions {
  notes: readonly BookNoteDocumentV1[];
  onOpenNote?: (note: BookNoteDocumentV1) => void;
}

/**
 * Safe, in-browser Markdown reader: uses DOM nodes + textContent, NEVER raw
 * markdown-as-HTML or innerHTML. External links are HTTP(S) only; note links
 * route to locally stored, stable-ID documents. Preview never mutates notes.
 */
export function renderNotebookPreview(
  target: HTMLElement, markdown: string, options: NotebookPreviewOptions,
): void {
  target.replaceChildren();
  const lookup = new Map(options.notes.map(note => [note.id, note]));
  const addText = (parent: Node, value: string) => parent.append(document.createTextNode(value));
  const inlinePattern =
    /\[\[note:([A-Za-z0-9_-]{1,180})(?:\|([^\]\r\n]{1,200}))?\]\]|\[([^\]\r\n]+)\]\((https?:\/\/[^\s)]+)\)|\`([^\`\r\n]+)\`|\*\*([^*\n]+)\*\*|~~([^~\n]+)~~|\*([^*\n]+)\*/g;

  function addInline(parent: HTMLElement, text: string): void {
    let from = 0;
    inlinePattern.lastIndex = 0;
    for (const match of text.matchAll(inlinePattern)) {
      const index = match.index ?? 0;
      if (index > from) addText(parent, text.slice(from, index));
      const [token, id, override, label, url, code, bold, deleted, italic] = match;
      if (id) {
        const note = lookup.get(id);
        if (note) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'book-notebook__preview-ref';
          button.textContent = override || notebookTitle(note);
          button.title = 'Open linked notebook note';
          button.addEventListener('click', () => options.onOpenNote?.(note));
          parent.append(button);
        } else {
          const missing = document.createElement('span');
          missing.className = 'book-notebook__preview-missing';
          missing.textContent = override || 'Missing note';
          missing.title = 'The referenced note is unavailable on this device';
          parent.append(missing);
        }
      } else if (label && url) {
        const link = document.createElement('a');
        link.href = url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = label;
        parent.append(link);
      } else if (code !== undefined) {
        const element = document.createElement('code');
        element.textContent = code;
        parent.append(element);
      } else if (bold !== undefined || deleted !== undefined || italic !== undefined) {
        const element = document.createElement(bold !== undefined ? 'strong' :
          deleted !== undefined ? 'del' : 'em');
        element.textContent = bold ?? deleted ?? italic;
        parent.append(element);
      } else addText(parent, token);
      from = index + token.length;
    }
    if (from < text.length) addText(parent, text.slice(from));
  }

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  let index = 0;
  let list: HTMLUListElement | HTMLOListElement | undefined;
  let listKind = '';
  const clearList = () => { list = undefined; listKind = ''; };

  while (index < lines.length) {
    const original = lines[index];
    const line = original.trim();
    if (!line) { clearList(); index++; continue; }

    const fence = line.match(/^(\`{3,}|~{3,})(.*)$/);
    if (fence) {
      clearList();
      const marker = fence[1][0];
      const length = fence[1].length;
      const body: string[] = [];
      index++;
      while (index < lines.length && !new RegExp('^\\s*' +
        (marker === '~' ? '~' : '\`') + '{' + length + ',}\\s*$').test(lines[index])) {
        body.push(lines[index]); index++;
      }
      if (index < lines.length) index++;
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      code.textContent = body.join('\n');
      pre.append(code); target.append(pre);
      continue;
    }

    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      clearList();
      const element = document.createElement('h' + Math.min(6, h[1].length + 1));
      addInline(element, h[2]);
      target.append(element); index++; continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      clearList(); target.append(document.createElement('hr')); index++; continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      clearList();
      const block = document.createElement('blockquote');
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        const p = document.createElement('p');
        addInline(p, lines[index].replace(/^\s*>\s?/, ''));
        block.append(p); index++;
      }
      target.append(block); continue;
    }
    const checkbox = line.match(/^[-*]\s+\[([xX ])\]\s+(.*)$/);
    const unordered = !checkbox && line.match(/^[-*+]\s+(.*)$/);
    const ordered = !checkbox && !unordered && line.match(/^\d+[.)]\s+(.*)$/);
    if (checkbox || unordered || ordered) {
      const kind = ordered ? 'ol' : 'ul';
      if (!list || listKind !== kind) {
        list = document.createElement(kind) as HTMLUListElement | HTMLOListElement;
        listKind = kind; target.append(list);
      }
      const li = document.createElement('li');
      if (checkbox) {
        const input = document.createElement('input');
        input.type = 'checkbox'; input.checked = checkbox[1].toLowerCase() === 'x';
        input.disabled = true; input.setAttribute('aria-label','Read-only task');
        li.append(input);
      }
      addInline(li, checkbox?.[2] ?? unordered?.[1] ?? ordered?.[1] ?? '');
      list.append(li); index++; continue;
    }
    clearList();

    // Obsidian-compatible, pipe-delimited Markdown table.
    if (line.startsWith('|') && index + 1 < lines.length
      && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(lines[index + 1].trim())) {
      const table = document.createElement('table');
      const head = document.createElement('thead');
      const body = document.createElement('tbody');
      const cells = (value: string) => value.trim().replace(/^\||\|$/g, '').split('|').map(v => v.trim());
      const headings = cells(original);
      const row = document.createElement('tr');
      for (const cell of headings) {
        const th = document.createElement('th'); addInline(th, cell); row.append(th);
      }
      head.append(row); index += 2;
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        const tr = document.createElement('tr');
        for (const cell of cells(lines[index])) {
          const td = document.createElement('td'); addInline(td, cell); tr.append(td);
        }
        body.append(tr); index++;
      }
      table.append(head, body); target.append(table); continue;
    }

    const paragraph: string[] = [line];
    index++;
    while (index < lines.length && lines[index].trim()
      && !/^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|\`{3,}|~{3,})/.test(lines[index].trim())) {
      paragraph.push(lines[index].trim());
      index++;
    }
    const p = document.createElement('p');
    addInline(p, paragraph.join(' '));
    target.append(p);
  }
  if (!target.childNodes.length) {
    const p = document.createElement('p');
    p.className = 'micro';
    p.textContent = 'Nothing to preview yet. Start writing in Markdown.';
    target.append(p);
  }
}

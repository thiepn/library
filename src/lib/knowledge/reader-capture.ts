import { createBookNote, listBookNotes, updateBookNote } from './note-store';
import { normalizedChapterKey, type BookNoteDocumentV1, type BookNoteScope, type SourceAnchorV1 } from './note-model';

export interface CaptureContext {
  workId: string;
  chapterKey: string;
  chapterLabel: string;
  anchor: SourceAnchorV1;
}
export interface CaptureOptions {
  toolbar: HTMLElement;
  getContext: () => CaptureContext | undefined;
  buttonClass?: string;
  onOpen?: () => void;
}
export interface CaptureHandle {
  readonly isOpen: boolean;
  open(scope?: BookNoteScope, selection?: { quote: string; anchor: SourceAnchorV1 }): void;
  destroy(): void;
}
const quoteMarkdown = (quote: string) => quote.trim().slice(0, 1800).replace(/\r/g, '').split('\n').map(s => '> ' + s).join('\n') + '\n\n';

/** Captures the active reader's location without touching progress or annotation state. */
export function mountReaderNotebook(options: CaptureOptions): CaptureHandle {
  const button = document.createElement('button');
  button.type = 'button'; button.className = options.buttonClass ?? 'reader-notebook-trigger';
  button.dataset.bookNotebookToggle = '';
  button.textContent = 'Notebook'; button.setAttribute('aria-label', 'Open book notebook');
  options.toolbar.append(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'reader-notebook'; dialog.dataset.readerNotebook = '';
  dialog.setAttribute('aria-label', 'Book notebook');
  dialog.innerHTML = [
    '<div class="reader-notebook__head"><strong>Book Notebook</strong><button type="button" data-capture-close aria-label="Close notebook">×</button></div>',
    '<div class="reader-notebook__modes" role="group" aria-label="Note type">',
    '<button type="button" data-capture-scope="reading-note">Quick note</button>',
    '<button type="button" data-capture-scope="chapter-summary">Chapter summary</button>',
    '<button type="button" data-capture-scope="book-overview">Book overview</button></div>',
    '<p data-capture-source class="reader-notebook__source"></p>',
    '<label for="reader-notebook-title">Title</label><input id="reader-notebook-title" data-capture-title maxlength="200" />',
    '<label for="reader-notebook-body">Markdown note</label><textarea id="reader-notebook-body" data-capture-body maxlength="250000" placeholder="Write a thought or summary…"></textarea>',
    '<p data-capture-status role="status" aria-live="polite"></p>',
    '<div class="reader-notebook__actions"><button type="button" data-capture-save>Save now</button>',
    '<button type="button" data-capture-copy>Copy Markdown</button><button type="button" data-capture-done>Done</button></div>',
    '<p class="reader-notebook__warning">Notebook records are included in V2 JSON backup. Cloud sync is paused until the server V2 safety guard is enabled. Keep a manual backup.</p>',
  ].join('');
  document.body.append(dialog);
  const title = dialog.querySelector<HTMLInputElement>('[data-capture-title]')!;
  const body = dialog.querySelector<HTMLTextAreaElement>('[data-capture-body]')!;
  const status = dialog.querySelector<HTMLElement>('[data-capture-status]')!;
  const source = dialog.querySelector<HTMLElement>('[data-capture-source]')!;
  const modeButtons = [...dialog.querySelectorAll<HTMLButtonElement>('[data-capture-scope]')];
  let context: CaptureContext | undefined;
  let scope: BookNoteScope = 'reading-note';
  let record: BookNoteDocumentV1 | undefined;
  let draft = false, saving = false, destroyed = false;
  let savedTitle = '', savedBody = '';
  let debounce: number | undefined, epoch = 0;
  let opener: HTMLElement = button;
  const dirty = () => (draft || !!record) && (savedTitle !== title.value || savedBody !== body.value);
  const clear = () => { if (debounce !== undefined) clearTimeout(debounce); debounce = undefined; };
  const setStatus = (value: string) => { status.textContent = value; };
  const schedule = () => {
    clear(); setStatus('Unsaved changes');
    debounce = window.setTimeout(() => { void save(); }, 650);
  };
  async function save(): Promise<boolean> {
    if (!context || !dirty()) return true;
    if (saving) return false;
    if (!title.value.trim() && !body.value.trim()) return true;
    saving = true; clear(); setStatus('Saving…');
    const t = title.value, b = body.value;
    try {
      const next = record
        ? await updateBookNote(record.id, record.revision, { title: t, bodyMarkdown: b })
        : await createBookNote({
          workId: context.workId, scope, title: t, bodyMarkdown: b,
          ...(scope === 'chapter-summary' ? { chapterKey: normalizedChapterKey(context.chapterKey) } : {}),
          anchor: context.anchor,
        });
      record = next; draft = false; savedTitle = t; savedBody = b;
      setStatus('Saved locally');
      if (dirty()) schedule();
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Save failed. Copy your text before closing.');
      return false;
    } finally { saving = false; }
  }
  async function changeScope(next: BookNoteScope, selected?: { quote: string; anchor: SourceAnchorV1 }) {
    if (!context || destroyed) return;
    if (dirty() && !await save()) return;
    const seq = ++epoch;
    scope = next; record = undefined; draft = true;
    if (selected && next === 'reading-note') context = { ...context, anchor: selected.anchor };
    const defaultTitle = next === 'book-overview' ? 'Book overview'
      : next === 'chapter-summary' ? context.chapterLabel + ' — summary' : 'Reading note';
    title.value = defaultTitle; body.value = selected?.quote && next === 'reading-note' ? quoteMarkdown(selected.quote) : '';
    savedTitle = defaultTitle; savedBody = '';
    modeButtons.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.captureScope === next)));
    setStatus('Draft — not yet saved');
    source.textContent = context.chapterLabel + ' · ' + context.anchor.format.toUpperCase();
    if (next !== 'reading-note') {
      try {
        const key = normalizedChapterKey(context.chapterKey);
        const notes = await listBookNotes(context.workId);
        if (seq !== epoch || !dialog.open) return;
        const existing = notes.find(n => next === 'book-overview'
          ? n.scope === 'book-overview'
          : n.scope === 'chapter-summary' && n.chapterKey === key);
        if (existing) {
          record = existing; draft = false;
          title.value = existing.title; body.value = existing.bodyMarkdown;
          savedTitle = existing.title; savedBody = existing.bodyMarkdown;
          setStatus('Loaded saved note');
        }
      } catch {
        // Never create a second singleton when the existing-record lookup failed.
        draft = false;
        setStatus('Cannot load this notebook. Copy any text before closing.');
      }
    }
    body.focus({ preventScroll: true });
  }
  function open(kind: BookNoteScope = 'reading-note', selection?: { quote: string; anchor: SourceAnchorV1 }) {
    if (dialog.open || destroyed) return;
    const selectedContext = options.getContext();
    if (!selectedContext) return;
    context = selectedContext;
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    options.onOpen?.();
    dialog.showModal();
    void changeScope(kind, selection);
  }
  async function close() {
    if (dirty() && !await save()) return;
    ++epoch; clear(); dialog.close();
    context = undefined; record = undefined; draft = false;
    if (opener.isConnected && !opener.closest('[hidden]') && opener.getClientRects().length > 0) opener.focus({ preventScroll: true });
    else button.focus({ preventScroll: true });
  }
  button.addEventListener('click', () => open());
  dialog.addEventListener('cancel', event => { event.preventDefault(); void close(); });
  dialog.querySelector('[data-capture-close]')!.addEventListener('click', () => void close());
  dialog.querySelector('[data-capture-done]')!.addEventListener('click', () => void close());
  dialog.querySelector('[data-capture-save]')!.addEventListener('click', () => void save());
  dialog.querySelector('[data-capture-copy]')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('# ' + title.value + '\n\n' + body.value);
      setStatus('Copied');
    } catch { setStatus('Clipboard unavailable. Select and copy the text directly.'); }
  });
  modeButtons.forEach(b => b.addEventListener('click', () => {
    const next = b.dataset.captureScope as BookNoteScope;
    if (next && next !== scope) void changeScope(next);
  }));
  title.addEventListener('input', schedule);
  body.addEventListener('input', schedule);
  title.addEventListener('blur', () => { if (dirty()) void save(); });
  body.addEventListener('blur', () => { if (dirty()) void save(); });
  dialog.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault(); void save();
    }
    event.stopPropagation(); // Arrow/page shortcuts must not reach the underlying reader.
  });
  return { get isOpen() { return dialog.open; }, open, destroy() {
    destroyed = true; ++epoch; clear();
    if (dialog.open) dialog.close();
    dialog.remove(); button.remove();
  } };
}

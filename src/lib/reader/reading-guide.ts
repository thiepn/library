export interface ReadingGuideAction {
  label: string;
  selector: string;
}
export interface ReadingGuideOptions {
  mode: 'epub' | 'pdf';
  actions: ReadingGuideAction[];
}
/**
 * Source-neutral, session-only reader help. Action buttons delegate to native reader controls;
 * no duplicate navigation, bookmarks, positions or Account state are introduced.
 */
export function mountReadingGuide(root: HTMLElement, options: ReadingGuideOptions): () => void {
  const cluster = root.querySelector<HTMLElement>(options.mode === 'epub'
    ? '.reader-shell__cluster--end' : '.pdf-reader__tools');
  if (!cluster) return () => {};
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.readingGuideToggle = '';
  button.className = 'reading-guide-toggle';
  button.textContent = '?';
  button.title = 'Reading help and shortcuts';
  button.setAttribute('aria-label', 'Reading help and shortcuts');
  button.setAttribute('aria-expanded', 'false');
  const dialog = document.createElement('section');
  dialog.dataset.readingGuide = '';
  dialog.className = 'reading-guide';
  dialog.hidden = true;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', 'Reading help and shortcuts');
  const backdrop = document.createElement('button');
  backdrop.type = 'button';
  backdrop.className = 'reading-guide__backdrop';
  backdrop.setAttribute('tabindex', '-1');
  backdrop.setAttribute('aria-label', 'Close reading guide');
  const panel = document.createElement('div');
  panel.className = 'reading-guide__panel';
  const heading = document.createElement('h2');
  heading.textContent = 'Reading tools';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.dataset.readingGuideClose = '';
  const intro = document.createElement('p');
  intro.textContent = options.mode === 'epub'
    ? 'Use the book’s own contents, search and annotation tools. Reader positions remain in EPUB.'
    : 'Use the existing page, search, saved-page and annotation controls. PDF positions stay page-based.';
  const shortcuts = document.createElement('p');
  shortcuts.className = 'reading-guide__shortcuts';
  shortcuts.textContent = options.mode === 'epub'
    ? 'Keys: ← / Page Up previous · → / Page Down next · Space next · Shift+Space previous · ? help · Escape close'
    : 'Keys: ← / Page Up previous · → / Page Down next · + / − zoom · ? help · Escape close';
  const actionRow = document.createElement('div');
  actionRow.className = 'reading-guide__actions';
  let lastFocus: HTMLElement | null = null;
  let disposed = false;

  function dismiss(restore = true) {
    if (dialog.hidden) return;
    dialog.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (restore) (lastFocus?.isConnected ? lastFocus : button).focus({ preventScroll: true });
  }
  function reveal() {
    if (disposed) return;
    // Native readers own their original settings and tools. The help view never rewrites them.
    lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : button;
    dialog.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    close.focus({ preventScroll: true });
  }
  for (const action of options.actions) {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = action.label;
    item.addEventListener('click', () => {
      dismiss(false);
      const target = root.querySelector<HTMLButtonElement>(action.selector);
      if (!target || target.disabled) {
        button.focus({ preventScroll: true });
        return;
      }
      target.click();
    });
    actionRow.append(item);
  }
  panel.append(heading, close, intro, shortcuts, actionRow);
  dialog.append(backdrop, panel);
  root.append(dialog);
  cluster.append(button);

  const toggle = () => dialog.hidden ? reveal() : dismiss();
  const onDocumentKeydown = (event: KeyboardEvent) => {
    if (disposed || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!dialog.hidden) {
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation(); dismiss(); return;
      }
      if (event.key === 'Tab') {
        const focusable = [close, ...Array.from(actionRow.querySelectorAll<HTMLButtonElement>('button'))];
        const index = focusable.indexOf(document.activeElement as HTMLButtonElement);
        if (event.shiftKey && index <= 0) {
          event.preventDefault(); focusable[focusable.length - 1]?.focus();
        } else if (!event.shiftKey && index === focusable.length - 1) {
          event.preventDefault(); focusable[0]?.focus();
        }
      }
      return;
    }
    if (event.key !== '?') return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || !!target.closest('input, textarea, select, [role="textbox"]'))) return;
    event.preventDefault();
    reveal();
  };
  const onBackdrop = () => dismiss();
  button.addEventListener('click', toggle);
  close.addEventListener('click', onBackdrop);
  backdrop.addEventListener('click', onBackdrop);
  document.addEventListener('keydown', onDocumentKeydown, true);
  return () => {
    if (disposed) return;
    disposed = true;
    document.removeEventListener('keydown', onDocumentKeydown, true);
    button.removeEventListener('click', toggle);
    close.removeEventListener('click', onBackdrop);
    backdrop.removeEventListener('click', onBackdrop);
    dialog.remove();
    button.remove();
  };
}

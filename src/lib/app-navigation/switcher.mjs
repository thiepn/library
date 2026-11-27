import { ACTIONS, APPS, HUB_URL } from './catalogue.mjs';

/** Accept only registry identities, not arbitrary destinations. */
export function navigationHref(id) {
  if (id === 'hub') return HUB_URL;
  return (
    APPS.find((app) => app.id === id)?.url ??
    ACTIONS.find((action) => action.id === id)?.url ??
    null
  );
}

/** Native modal; keep the source tab, and never transmit private context. */
export function mountAppSwitcher(trigger, currentApp) {
  const doc = trigger.ownerDocument;
  const dialog = doc.createElement('dialog');
  dialog.className = 'thiepn-app-switcher';
  dialog.setAttribute('aria-label', 'THIEPN app switcher');
  const heading = doc.createElement('h2');
  heading.textContent = 'Switch app';
  const close = doc.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  const header = doc.createElement('header');
  header.append(heading, close);
  const detail = doc.createElement('p');
  detail.textContent = 'Opens in a new tab. Your current work stays here.';
  const nav = doc.createElement('nav');
  nav.setAttribute('aria-label', 'THIEPN apps');
  const actions = doc.createElement('nav');
  actions.setAttribute('aria-label', 'App actions');
  const actionTitle = doc.createElement('h3');
  actionTitle.textContent = 'Quick actions';
  const link = (id, title) => {
    const anchor = doc.createElement('a');
    anchor.href = navigationHref(id);
    anchor.textContent = title;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.addEventListener('click', () => dialog.close());
    return anchor;
  };
  if (currentApp !== 'hub') nav.append(link('hub', 'THIEPN Hub'));
  for (const app of APPS) {
    if (app.id === currentApp) {
      const current = doc.createElement('span');
      current.textContent = app.title + ' · Current';
      current.setAttribute('aria-current', 'page');
      nav.append(current);
    } else {
      nav.append(link(app.id, app.title));
    }
  }
  for (const action of ACTIONS) actions.append(link(action.id, action.label));
  dialog.append(header, detail, nav, actionTitle, actions);
  doc.body.append(dialog);
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  const open = () => {
    if (!dialog.open) {
      dialog.showModal();
      trigger.setAttribute('aria-expanded', 'true');
      close.focus();
    }
  };
  const dismiss = () => dialog.close();
  const restore = () => {
    trigger.setAttribute('aria-expanded', 'false');
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  trigger.addEventListener('click', open);
  close.addEventListener('click', dismiss);
  dialog.addEventListener('close', restore);
  return () => {
    trigger.removeEventListener('click', open);
    dialog.removeEventListener('close', restore);
    dialog.remove();
    trigger.removeAttribute('aria-haspopup');
    trigger.removeAttribute('aria-expanded');
  };
}

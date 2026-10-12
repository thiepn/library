import type { LibraryAccountUser } from './supabase';
import {
  downloadCloudConflictBackup,
  downloadLocalConflictBackup,
  previewLibraryConflict,
  resolveReviewedLibraryConflict,
  type LibraryConflictReview,
  type LibrarySyncResult,
} from './sync';
import type { CopySummary } from './sync-review';

type SyncChoice = 'device' | 'cloud';
const fields: Array<[keyof CopySummary, string]> = [
  ['savedBooks', 'Saved books'],
  ['readingPositions', 'Reading positions'],
  ['bookmarks', 'Bookmarks'],
  ['highlights', 'Annotations'],
  ['notebookNotes', 'Notebook notes'],
  ['notebookBooks', 'Books with notes'],
  ['personalBooks', 'Personal book records'],
];

/** One local-first conflict panel; reading, reviewing and downloading never select a winner. */
export function mountLibraryConflictReview(
  currentUser: () => LibraryAccountUser | null,
  afterChoice: (result: LibrarySyncResult) => Promise<void>,
): { reset(): void; dispose(): void } {
  const find = <T extends HTMLElement>(selector: string) => document.querySelector<T>(selector);
  const status = find<HTMLElement>('[data-sync-review-status]');
  const panel = find<HTMLElement>('[data-sync-review]');
  const downloads = find<HTMLElement>('[data-sync-download-status]');
  const checkbox = find<HTMLInputElement>('[data-sync-confirm-choice]');
  const deviceChoice = find<HTMLButtonElement>('[data-use-device]');
  const cloudChoice = find<HTMLButtonElement>('[data-use-cloud]');
  const cloudDownload = find<HTMLButtonElement>('[data-sync-cloud-download]');
  let review: LibraryConflictReview | undefined;
  let localRequested = false;
  let cloudRequested = false;
  let working = false;
  let alive = true;
  const listeners: Array<() => void> = [];

  const bind = (selector: string, event: string, handler: EventListener) => {
    const el=find<HTMLElement>(selector);
    if (!el) return;
    el.addEventListener(event, handler);
    listeners.push(() => el.removeEventListener(event, handler));
  };
  const say = (message: string) => { if (status) status.textContent=message; };
  const setDownloadText = () => {
    if (downloads) downloads.textContent =
      (localRequested ? 'Device download requested' : 'Device backup needed')
      + ' · ' + (review?.cloud
        ? (cloudRequested ? 'Cloud download requested' : 'Cloud backup needed')
        : 'No cloud copy');
  };
  const updateChoices = () => {
    const ready = Boolean(review && localRequested
      && (cloudRequested || !review.cloud) && checkbox?.checked && !working);
    if (deviceChoice) deviceChoice.disabled=!ready;
    if (cloudChoice) cloudChoice.disabled=!ready || !review?.cloud;
    if (cloudDownload) cloudDownload.disabled=working || !review?.cloud;
  };
  const setWorking = (value: boolean) => {
    working=value;
    updateChoices();
    const compare=find<HTMLButtonElement>('[data-sync-review-open]');
    if (compare) compare.disabled=value;
  };
  const fill = (selector: string, summary?: CopySummary) => {
    const list=find<HTMLElement>(selector);
    if (!list) return;
    list.replaceChildren();
    if (!summary) {
      const term=document.createElement('p');
      term.textContent='No cloud snapshot available';
      list.append(term);
      return;
    }
    for (const [key,label] of fields) {
      const row=document.createElement('div');
      row.className='sync-compare__metric';
      const term=document.createElement('dt'); term.textContent=label;
      const value=document.createElement('dd'); value.textContent=String(summary[key]);
      row.append(term,value); list.append(row);
    }
  };
  const show = (value: LibraryConflictReview) => {
    review=value;
    localRequested=false; cloudRequested=false;
    if (checkbox) checkbox.checked=false;
    if (panel) panel.hidden=false;
    fill('[data-sync-device-details]',value.device);
    fill('[data-sync-cloud-details]',value.cloud);
    const version=find<HTMLElement>('[data-sync-cloud-version]');
    if (version) version.textContent=value.cloudRevision===null
      ? 'No cloud copy'
      : 'Revision '+value.cloudRevision
        +(value.cloudUpdatedAt ? ' · '+new Date(value.cloudUpdatedAt).toLocaleString() : '');
    const diff=find<HTMLElement>('[data-sync-notes-diff]');
    if (diff) {
      diff.replaceChildren();
      const label=document.createElement('h4'); label.textContent='Notebook differences';
      diff.append(label);
      if (value.noteChanges) {
        const details=document.createElement('p');
        const n=value.noteChanges;
        details.textContent=n.localOnly+' only on device · '+n.cloudOnly
          +' only in cloud · '+n.changed+' changed in both · '+n.identical+' identical';
        diff.append(details);
        if (n.changedTitles.length) {
          const names=document.createElement('p');
          names.className='micro';
          names.textContent='Differing notes: '+n.changedTitles.join(', ');
          diff.append(names);
        }
      } else {
        const details=document.createElement('p');details.textContent='No cloud version to compare.';
        diff.append(details);
      }
    }
    setDownloadText(); updateChoices();
    say('Review the differences, request the safety downloads, then confirm your choice.');
  };
  const reset = () => {
    review=undefined; localRequested=false;cloudRequested=false;
    if(checkbox)checkbox.checked=false;
    if(panel)panel.hidden=true;
    if(downloads)downloads.textContent='No backups downloaded from this review.';
    updateChoices();
  };
  bind('[data-sync-review-open]','click',() => {
    const user=currentUser(); if(!user)return;
    reset(); setWorking(true); say('Reading the two versions…');
    void previewLibraryConflict(user).then(value => {
      if(alive && currentUser()?.id===user.id)show(value);
    }).catch(error=>say(error instanceof Error?error.message:'Cannot open review. Local notes are unchanged.'))
      .finally(()=>setWorking(false));
  });
  const downloadDevice=() => {
    setWorking(true);
    void downloadLocalConflictBackup().then(()=>{
      if(!alive)return;
      if(review)localRequested=true;
      setDownloadText();
      say('Device JSON download requested. Confirm the file is saved before deciding.');
    }).catch(error=>say(error instanceof Error?error.message:'Could not export local backup.'))
      .finally(()=>setWorking(false));
  };
  bind('[data-sync-local-download]','click',downloadDevice);
  bind('[data-sync-local-download-review]','click',downloadDevice);
  bind('[data-sync-cloud-download]','click',() => {
    const user=currentUser();if(!user || !review?.cloud)return;
    setWorking(true);
    void downloadCloudConflictBackup(user).then(()=>{
      if(!alive)return;
      cloudRequested=true;setDownloadText();
      say('Cloud JSON download requested. Confirm the file is saved before deciding.');
    }).catch(error=>say(error instanceof Error?error.message:'Could not export cloud backup.'))
      .finally(()=>setWorking(false));
  });
  bind('[data-sync-confirm-choice]','change',()=>updateChoices());
  const resolve = (choice:SyncChoice) => {
    const user=currentUser();
    const selected=review;
    if(!user || !selected || working || !checkbox?.checked
      || !localRequested || (selected.cloud && !cloudRequested))return;
    setWorking(true);
    say('Checking both versions again before applying your choice…');
    void resolveReviewedLibraryConflict(user,selected,choice).then(async result=>{
      if(!alive)return;
      if(result.status==='conflict' || result.status==='error'){
        reset();say(result.message);
      } else { reset();say(result.message); }
      await afterChoice(result);
    }).catch(error=>say(error instanceof Error?error.message:'Could not apply this choice.'))
      .finally(()=>setWorking(false));
  };
  bind('[data-use-device]','click',()=>resolve('device'));
  bind('[data-use-cloud]','click',()=>resolve('cloud'));
  reset();
  return {reset,dispose(){
    alive=false;reset();
    for(const remove of listeners)remove();
  }};
}

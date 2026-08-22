import type { Annotation, LibraryState, ReaderPreferences, WorkProgress } from '../domain';

const KEY = 'library.state.v1';
const EVENT = 'library-state-change';

const defaults: LibraryState = {
  savedWorkIds: [],
  progress: {},
  preferences: {
    appearance: 'system',
    fontScale: 1,
    lineHeight: 1.72,
    measure: 68,
  },
  annotations: [],
};

function safeState(value: unknown): LibraryState {
  if (!value || typeof value !== 'object') return structuredClone(defaults);
  const candidate = value as Partial<LibraryState>;
  return {
    savedWorkIds: Array.isArray(candidate.savedWorkIds) ? candidate.savedWorkIds.filter((id): id is string => typeof id === 'string') : [],
    progress: candidate.progress && typeof candidate.progress === 'object' ? candidate.progress : {},
    preferences: { ...defaults.preferences, ...(candidate.preferences ?? {}) },
    annotations: Array.isArray(candidate.annotations) ? candidate.annotations : [],
  };
}

export function readLibraryState(): LibraryState {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? safeState(JSON.parse(raw)) : structuredClone(defaults);
  } catch {
    return structuredClone(defaults);
  }
}

function write(state: LibraryState) {
  localStorage.setItem(KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeLibraryState(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function setSaved(workId: string, saved: boolean) {
  const state = readLibraryState();
  const ids = new Set(state.savedWorkIds);
  saved ? ids.add(workId) : ids.delete(workId);
  write({ ...state, savedWorkIds: [...ids] });
}

export function setProgress(workId: string, progress: WorkProgress) {
  const state = readLibraryState();
  write({ ...state, progress: { ...state.progress, [workId]: progress } });
}

export function setPreferences(preferences: Partial<ReaderPreferences>) {
  const state = readLibraryState();
  write({ ...state, preferences: { ...state.preferences, ...preferences } });
}

export function upsertAnnotation(annotation: Annotation) {
  const state = readLibraryState();
  const annotations = state.annotations.filter((entry) => entry.id !== annotation.id);
  annotations.push(annotation);
  write({ ...state, annotations });
}

export function removeAnnotation(id: string) {
  const state = readLibraryState();
  write({ ...state, annotations: state.annotations.filter((entry) => entry.id !== id) });
}

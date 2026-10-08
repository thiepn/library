import type { ReaderSettingsRecord } from './settings';

/**
 * Browser-independent baseline for first-sync conflict detection and the reader.
 * Keep in a pure module so Node's policy regressions never import reader UI/CSS.
 */
export const READER_SETTINGS_DEFAULTS: ReaderSettingsRecord = {
  schemaVersion: 1,
  fontFamily: 'publisher',
  fontScale: 1,
  lineHeight: 1.55,
  paragraphSpacing: 0,
  alignment: 'left',
  theme: 'light',
  textWidth: 'medium',
  pageMargins: 'medium',
  flow: 'paginated',
  spread: 'auto',
};

import type { ReaderAnnotationIdentity } from './annotation-store';
import {
  mountReaderPublicationWithAccessibilityHarness,
  mountReaderShellWithAccessibilityHarness,
  type ReaderAccessibilityHarnessHandle,
} from './accessibility-harness';
import { ReaderPublicationCompatibilityController } from './compatibility';
import type { ReaderDesktopOptions } from './desktop';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions } from './types';

export interface ReaderCompatibilityHarnessHandle extends ReaderAccessibilityHarnessHandle {
  compatibility: ReaderPublicationCompatibilityController;
}

function attachCompatibility(
  root: HTMLElement,
  base: ReaderAccessibilityHarnessHandle,
): ReaderCompatibilityHarnessHandle {
  const compatibility = new ReaderPublicationCompatibilityController(root, base.theme);
  let destroyed = false;
  compatibility.start();

  return {
    ...base,
    compatibility,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      compatibility.destroy();
      base.destroy();
    },
  };
}

/** Non-public qualification harness with the complete P23 reader plus P24 EPUB styling compatibility. */
export async function mountReaderShellWithCompatibilityHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  identity: ReaderAnnotationIdentity,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderCompatibilityHarnessHandle> {
  const base = await mountReaderShellWithAccessibilityHarness(root, source, identity, options, target, desktopOptions);
  return attachCompatibility(root, base);
}

/** Generic publication-aware staged reader with P24 publisher-CSS compatibility hardening. */
export async function mountReaderPublicationWithCompatibilityHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderCompatibilityHarnessHandle> {
  const base = await mountReaderPublicationWithAccessibilityHarness(root, publication, options, target, desktopOptions);
  return attachCompatibility(root, base);
}

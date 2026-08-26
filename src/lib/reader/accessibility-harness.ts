import type { ReaderAnnotationIdentity } from './annotation-store';
import { ReaderAccessibilityController } from './accessibility';
import {
  mountReaderPublicationWithDesktopHarness,
  mountReaderShellWithDesktopHarness,
  type ReaderDesktopHarnessHandle,
} from './desktop-harness';
import type { ReaderDesktopOptions } from './desktop';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions } from './types';

export interface ReaderAccessibilityHarnessHandle extends ReaderDesktopHarnessHandle {
  accessibility: ReaderAccessibilityController;
}

function attachAccessibility(base: ReaderDesktopHarnessHandle): ReaderAccessibilityHarnessHandle {
  const accessibility = new ReaderAccessibilityController(base.controller, base.shell);
  let destroyed = false;
  accessibility.start();

  return {
    ...base,
    accessibility,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      accessibility.destroy();
      base.destroy();
    },
  };
}

/** Non-public qualification harness with the complete P22 reader plus P23 accessibility remediation. */
export async function mountReaderShellWithAccessibilityHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  identity: ReaderAnnotationIdentity,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderAccessibilityHarnessHandle> {
  const base = await mountReaderShellWithDesktopHarness(root, source, identity, options, target, desktopOptions);
  return attachAccessibility(base);
}

/** Generic publication-aware staged reader with P23 WCAG-focused accessibility behavior. */
export async function mountReaderPublicationWithAccessibilityHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderAccessibilityHarnessHandle> {
  const base = await mountReaderPublicationWithDesktopHarness(root, publication, options, target, desktopOptions);
  return attachAccessibility(base);
}

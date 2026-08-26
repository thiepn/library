import type { ReaderAnnotationIdentity } from './annotation-store';
import {
  mountReaderPublicationWithMobileHarness,
  mountReaderShellWithMobileHarness,
  type ReaderMobileHarnessHandle,
} from './mobile-harness';
import { ReaderDesktopController, type ReaderDesktopOptions } from './desktop';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions } from './types';

export interface ReaderDesktopHarnessHandle extends ReaderMobileHarnessHandle {
  desktop: ReaderDesktopController;
}

function attachDesktop(
  base: ReaderMobileHarnessHandle,
  options: ReaderDesktopOptions = {},
): ReaderDesktopHarnessHandle {
  const desktop = new ReaderDesktopController(base.shell, options);
  let destroyed = false;
  desktop.start();

  return {
    ...base,
    desktop,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      desktop.destroy();
      base.destroy();
    },
  };
}

/** Non-public fixture harness with P21 mobile plus P22 tablet/desktop environment qualification. */
export async function mountReaderShellWithDesktopHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  identity: ReaderAnnotationIdentity,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderDesktopHarnessHandle> {
  const base = await mountReaderShellWithMobileHarness(root, source, identity, options, target);
  return attachDesktop(base, desktopOptions);
}

/** Generic publication-aware staged reader with P22 tablet, split-window, desktop, and ultrawide qualification. */
export async function mountReaderPublicationWithDesktopHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  desktopOptions: ReaderDesktopOptions = {},
): Promise<ReaderDesktopHarnessHandle> {
  const base = await mountReaderPublicationWithMobileHarness(root, publication, options, target);
  return attachDesktop(base, desktopOptions);
}

import type { ReaderAnnotationIdentity } from './annotation-store';
import {
  mountReaderPublicationWithAnnotationsHarness,
  mountReaderShellWithAnnotationsHarness,
  type ReaderAnnotationsHarnessHandle,
} from './annotations-harness';
import { ReaderMobileController, type ReaderMobileOptions } from './mobile';
import type { ReaderPublicationCandidate } from './publication';
import type { ReaderOpenOptions } from './types';

export interface ReaderMobileHarnessHandle extends ReaderAnnotationsHarnessHandle {
  mobile: ReaderMobileController;
}

function attachMobile(
  base: ReaderAnnotationsHarnessHandle,
  options: ReaderMobileOptions = {},
): ReaderMobileHarnessHandle {
  const mobile = new ReaderMobileController(base.shell, options);
  let destroyed = false;
  mobile.start();

  return {
    ...base,
    mobile,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      mobile.destroy();
      base.destroy();
    },
  };
}

/** Non-public fixture harness with the complete P20 reader plus P21 phone environment handling. */
export async function mountReaderShellWithMobileHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  identity: ReaderAnnotationIdentity,
  options: ReaderOpenOptions = {},
  target?: string,
  mobileOptions: ReaderMobileOptions = {},
): Promise<ReaderMobileHarnessHandle> {
  const base = await mountReaderShellWithAnnotationsHarness(root, source, identity, options, target);
  return attachMobile(base, mobileOptions);
}

/** Generic publication-aware staged reader with P21 visual-viewport and mobile UI qualification. */
export async function mountReaderPublicationWithMobileHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
  mobileOptions: ReaderMobileOptions = {},
): Promise<ReaderMobileHarnessHandle> {
  const base = await mountReaderPublicationWithAnnotationsHarness(root, publication, options, target);
  return attachMobile(base, mobileOptions);
}

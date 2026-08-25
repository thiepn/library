import { ReaderController } from './controller';
import type { ReaderOpenOptions } from './types';

export interface ReaderHarnessHandle {
  controller: ReaderController;
  destroy(): void;
}

/**
 * Mounts the EPUB reader core without creating a public Library route.
 * Intended for synthetic fixtures, browser tests, and local development only.
 */
export async function mountReaderEngineHarness(
  container: Element,
  source: string | ArrayBuffer,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderHarnessHandle> {
  const controller = new ReaderController();
  try {
    await controller.open(source, container, options, target);
    return {
      controller,
      destroy: () => controller.destroy(),
    };
  } catch (error) {
    controller.destroy();
    throw error;
  }
}

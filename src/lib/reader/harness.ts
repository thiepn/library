import { ReaderController } from './controller';
import { ReaderNavigationController } from './navigation';
import { ReaderPageLayoutController, type ReaderPageLayoutOptions } from './page-layout';
import { ReaderProgressController, type ReaderProgressIdentity } from './progress';
import { ReaderProgressUxController } from './progress-ux';
import type { ReaderPublicationCandidate } from './publication';
import { ReaderReadingModeController, type ReaderReadingModeOptions } from './reading-mode';
import { ReaderSettingsStore } from './settings';
import { mountReaderShell, type ReaderShellController } from './shell';
import { ReaderThemeController, type ReaderThemeOptions } from './theme';
import { ReaderTypographyController, type ReaderTypographyOptions } from './typography';
import { clearReaderFailureState, setReaderFailureState } from './fallback';
import type { ReaderOpenOptions, Unsubscribe } from './types';

export interface ReaderHarnessHandle {
  controller: ReaderController;
  destroy(): void;
}

export interface ReaderShellHarnessHandle extends ReaderHarnessHandle {
  shell: ReaderShellController;
  navigation: ReaderNavigationController;
  readingMode: ReaderReadingModeController;
  typography: ReaderTypographyController;
  pageLayout: ReaderPageLayoutController;
  theme: ReaderThemeController;
  settings: ReaderSettingsStore;
  progress?: ReaderProgressController;
  progressUx?: ReaderProgressUxController;
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

/**
 * Connects the reader shell, persistent settings, version-aware reading position,
 * non-blocking whole-book progress UX, serialized navigation controls, reading-mode controller,
 * typography engine, page-layout controller, theme controller, and EPUB engine without exposing a book route.
 */
export async function mountReaderShellHarness(
  root: HTMLElement,
  source: string | ArrayBuffer,
  options: ReaderOpenOptions = {},
  target?: string,
  progressIdentity?: ReaderProgressIdentity,
): Promise<ReaderShellHarnessHandle> {
  const shell = mountReaderShell(root);
  const controller = new ReaderController();
  const settings = new ReaderSettingsStore();
  const progress = progressIdentity ? new ReaderProgressController(controller, progressIdentity) : undefined;
  const progressUx = progress && progressIdentity
    ? new ReaderProgressUxController(controller, progress, shell, progressIdentity)
    : undefined;
  const resolvedOptions = settings.resolveOpenOptions(options);
  const readingModeOptions: ReaderReadingModeOptions = {
    ...(resolvedOptions.flow ? { flow: resolvedOptions.flow } : {}),
    ...(resolvedOptions.spread ? { spread: resolvedOptions.spread } : {}),
    ...(resolvedOptions.minSpreadWidth !== undefined ? { minSpreadWidth: resolvedOptions.minSpreadWidth } : {}),
  };
  const typographyOptions: ReaderTypographyOptions = resolvedOptions.appearance ? {
    ...(resolvedOptions.appearance.fontFamily ? { fontFamily: resolvedOptions.appearance.fontFamily } : {}),
    ...(resolvedOptions.appearance.fontScale !== undefined ? { fontScale: resolvedOptions.appearance.fontScale } : {}),
    ...(resolvedOptions.appearance.lineHeight !== undefined ? { lineHeight: resolvedOptions.appearance.lineHeight } : {}),
    ...(resolvedOptions.appearance.paragraphSpacing !== undefined ? { paragraphSpacing: resolvedOptions.appearance.paragraphSpacing } : {}),
    ...(resolvedOptions.appearance.alignment ? { alignment: resolvedOptions.appearance.alignment } : {}),
  } : {};
  const pageLayoutOptions: ReaderPageLayoutOptions = resolvedOptions.appearance ? {
    ...(resolvedOptions.appearance.textWidth ? { textWidth: resolvedOptions.appearance.textWidth } : {}),
    ...(resolvedOptions.appearance.pageMargins ? { pageMargins: resolvedOptions.appearance.pageMargins } : {}),
  } : {};
  const themeOptions: ReaderThemeOptions = resolvedOptions.appearance?.theme ? { theme: resolvedOptions.appearance.theme } : {};
  const theme = new ReaderThemeController(controller, shell.root, themeOptions);
  const readingMode = new ReaderReadingModeController(controller, shell.viewport, readingModeOptions);
  const navigation = new ReaderNavigationController(controller, readingMode, shell);
  const pageLayout = new ReaderPageLayoutController(readingMode, shell.root, pageLayoutOptions);
  const typography = new ReaderTypographyController(controller, typographyOptions);
  const cleanups: Unsubscribe[] = [];
  let destroyed = false;
  let modesStarted = false;
  let navigationStarted = false;
  let typographyStarted = false;
  let pageLayoutStarted = false;
  let themeStarted = false;
  let progressStarted = false;
  let progressUxStarted = false;

  const currentOpenOptions = (): ReaderOpenOptions => ({
    ...resolvedOptions,
    flow: readingMode.snapshot.flow,
    spread: readingMode.snapshot.spreadPreference,
    appearance: {
      ...typography.snapshot,
      ...pageLayout.snapshot,
      theme: theme.snapshot.theme,
    },
  });

  const resolveOpenTarget = async (): Promise<string | undefined> => {
    if (target) return target;
    const resume = await progress?.getResumeCandidate();
    return resume?.status === 'same-release' ? resume.target : undefined;
  };

  const open = async () => {
    clearReaderFailureState(shell);
    shell.setStatus('loading', 'Opening book…');
    try {
      const openTarget = await resolveOpenTarget();
      await controller.open(source, shell.viewport, currentOpenOptions(), openTarget);
      if (themeStarted) theme.reapply();
      else {
        themeStarted = true;
        theme.start();
      }
      if (modesStarted) await readingMode.reapply();
      else {
        modesStarted = true;
        await readingMode.start();
      }
      if (!navigationStarted) {
        navigationStarted = true;
        navigation.start();
      }
      if (typographyStarted) await typography.reapply();
      else {
        typographyStarted = true;
        await typography.start();
      }
      if (pageLayoutStarted) await pageLayout.reapply();
      else {
        pageLayoutStarted = true;
        await pageLayout.start();
      }
      if (progress && !progressStarted) {
        progressStarted = true;
        progress.start();
      }
      if (progressUx) {
        if (progressUxStarted) await progressUx.reapply();
        else {
          progressUxStarted = true;
          progressUx.start();
        }
      }
    } catch (error) {
      setReaderFailureState(shell, error);
      throw error;
    }
  };

  cleanups.push(readingMode.subscribe((state) => {
    shell.setReadingMode(state.flow, state.spreadPreference, state.effectiveSpread);
    settings.patch({ flow: state.flow, spread: state.spreadPreference });
  }));

  cleanups.push(typography.subscribe((state) => {
    shell.setTypography(state);
    settings.patch(state);
  }));

  cleanups.push(pageLayout.subscribe((state) => {
    shell.root.dataset.readerTextWidth = state.textWidth;
    shell.root.dataset.readerPageMargins = state.pageMargins;
    settings.patch(state);
  }));

  cleanups.push(theme.subscribe((state) => {
    shell.root.dataset.readerTheme = state.theme;
    settings.patch({ theme: state.theme });
  }));

  cleanups.push(controller.subscribe((state) => {
    if (state.status === 'loading') shell.setStatus('loading');
    if (state.status === 'ready') {
      clearReaderFailureState(shell);
      shell.setStatus('ready');
    }
    if (state.status === 'error') setReaderFailureState(shell, state.error);

    if (state.location) {
      shell.setChapter(state.location.href || 'Current section');
      if (!progressUx) {
        const percentage = state.location.percentage;
        shell.setProgress({
          label: percentage === undefined ? 'Reading' : `${Math.round(percentage * 100)}%`,
          ...(percentage === undefined ? {} : { percentage }),
        });
      }
    }
  }));

  cleanups.push(shell.onTypographyIntent((intent) => {
    const run = async () => {
      if (intent.type === 'reset') {
        await typography.reset();
        shell.announce('Typography reset to book defaults');
      }
      if (intent.type === 'fontFamily') {
        await typography.setFontFamily(intent.value);
        shell.announce(`Font changed to ${intent.value === 'publisher' ? 'book font' : intent.value}`);
      }
      if (intent.type === 'fontScale') await typography.setFontScale(intent.value);
      if (intent.type === 'lineHeight') await typography.setLineHeight(intent.value);
      if (intent.type === 'paragraphSpacing') await typography.setParagraphSpacing(intent.value);
      if (intent.type === 'alignment') {
        await typography.setAlignment(intent.value);
        shell.announce(intent.value === 'justify' ? 'Justified text' : 'Left aligned text');
      }
    };
    void run().catch((error) => {
      setReaderFailureState(shell, error);
    });
  }));

  cleanups.push(shell.onCommand((command) => {
    const run = async () => {
      if (command === 'retry') await open();
      if (command === 'flow-paginated') {
        await readingMode.setFlow('paginated');
        shell.announce('Paginated reading mode');
      }
      if (command === 'flow-scrolled') {
        await readingMode.setFlow('scrolled');
        shell.announce('Scrolling reading mode');
      }
      if (command === 'spread-auto') {
        await readingMode.setSpreadPreference('auto');
        shell.announce('Automatic page spread');
      }
      if (command === 'spread-single') {
        await readingMode.setSpreadPreference('single');
        shell.announce('Single page spread');
      }
      if (command === 'spread-double') {
        await readingMode.setSpreadPreference('double');
        shell.announce('Two page spread where space allows');
      }
    };

    void run().catch((error) => {
      setReaderFailureState(shell, error);
    });
  }));

  try {
    await open();
  } catch (error) {
    for (const cleanup of cleanups) cleanup();
    progressUx?.destroy();
    progress?.destroy();
    navigation.destroy();
    pageLayout.destroy();
    typography.destroy();
    readingMode.destroy();
    theme.destroy();
    controller.destroy();
    shell.destroy();
    throw error;
  }

  return {
    controller,
    shell,
    navigation,
    readingMode,
    typography,
    pageLayout,
    theme,
    settings,
    ...(progress ? { progress } : {}),
    ...(progressUx ? { progressUx } : {}),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      for (const cleanup of cleanups) cleanup();
      progressUx?.destroy();
      progress?.destroy();
      navigation.destroy();
      pageLayout.destroy();
      typography.destroy();
      readingMode.destroy();
      theme.destroy();
      controller.destroy();
      shell.destroy();
    },
  };
}

/**
 * Generic publication-aware harness used by future public route integration. The exact active
 * edition and release version define whether a saved EPUB CFI is eligible for restoration.
 */
export function mountReaderPublicationHarness(
  root: HTMLElement,
  publication: ReaderPublicationCandidate,
  options: ReaderOpenOptions = {},
  target?: string,
): Promise<ReaderShellHarnessHandle> {
  return mountReaderShellHarness(
    root,
    publication.epub.url,
    options,
    target,
    {
      workId: publication.workId,
      edition: publication.edition,
      releaseVersion: publication.version,
    },
  );
}

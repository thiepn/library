import assert from 'node:assert/strict';
import test from 'node:test';
import { ReaderNavigationController } from '../../src/lib/reader/navigation';
import type { ReaderController } from '../../src/lib/reader/controller';
import type { ReaderReadingModeController } from '../../src/lib/reader/reading-mode';
import type { ReaderShellController } from '../../src/lib/reader/shell';

function makeNavigationHarness() {
  const root = {
    dataset: {
      readerStatus: 'ready',
      readerControls: 'hidden',
    },
  } as unknown as HTMLElement;

  let hideCalls = 0;
  let showCalls = 0;

  const shell = {
    root,
    announce: () => undefined,
    setNavigationAvailability: () => undefined,
    hideControls: () => {
      hideCalls += 1;
      root.dataset.readerControls = 'hidden';
    },
    showControls: () => {
      showCalls += 1;
      root.dataset.readerControls = 'visible';
    },
  } as unknown as ReaderShellController;

  const controller = {
    snapshot: {
      status: 'ready',
      location: {
        atStart: false,
        atEnd: false,
      },
      toc: [],
      error: null,
    },
    next: async () => {
      // Model the physical-browser failure: EPUB relocation/focus briefly reveals the shell while
      // the page-turn promise is in flight. Navigation must restore the reader's pre-turn intent.
      shell.showControls();
    },
    previous: async () => {
      shell.showControls();
    },
  } as unknown as ReaderController;

  const readingMode = {
    snapshot: {
      flow: 'paginated',
      spreadPreference: 'single',
      effectiveSpread: 'single',
    },
  } as unknown as ReaderReadingModeController;

  const navigation = new ReaderNavigationController(controller, readingMode, shell);
  return {
    navigation,
    root,
    get hideCalls() { return hideCalls; },
    get showCalls() { return showCalls; },
  };
}

test('non-keyboard page turns preserve an intentionally hidden reader chrome', async () => {
  const harness = makeNavigationHarness();

  await harness.navigation.navigate('next', 'tap');
  assert.equal(harness.root.dataset.readerControls, 'hidden');
  assert.equal(harness.hideCalls, 1);

  await harness.navigation.navigate('previous', 'swipe');
  assert.equal(harness.root.dataset.readerControls, 'hidden');
  assert.equal(harness.hideCalls, 2);
});

test('keyboard navigation keeps its explicit chrome reveal behavior', async () => {
  const harness = makeNavigationHarness();

  await harness.navigation.navigate('next', 'keyboard');
  assert.equal(harness.root.dataset.readerControls, 'visible');
  assert.ok(harness.showCalls >= 1);
});

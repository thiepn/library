import assert from 'node:assert/strict';
import test from 'node:test';
import { ReaderController } from '../../src/lib/reader/controller';
import { ReaderEngineError } from '../../src/lib/reader/types';
import { FakeReaderEngine, regressionLocation, regressionToc } from './reader-fake-engine';

const container = {} as Element;

async function openReady(engine = new FakeReaderEngine(), target?: string) {
  const controller = new ReaderController(engine);
  await controller.open('/library/media/synthetic/book.epub', container, { flow: 'paginated', spread: 'auto' }, target);
  return { controller, engine };
}

test('open transitions to ready with native nested EPUB navigation', async () => {
  const { controller, engine } = await openReady();
  assert.equal(controller.snapshot.status, 'ready');
  assert.deepEqual(controller.snapshot.toc, regressionToc);
  assert.equal(engine.openCalls.length, 1);
  assert.equal(engine.displayCalls.length, 1);
  assert.equal(engine.displayCalls[0], undefined);
  controller.destroy();
});

test('saved target failure falls back to ordinary first display instead of blocking reading', async () => {
  const engine = new FakeReaderEngine();
  engine.displayFailures.set('epubcfi(/bad)', new ReaderEngineError('invalid-location', 'Synthetic bad target'));
  const { controller } = await openReady(engine, 'epubcfi(/bad)');
  assert.equal(controller.snapshot.status, 'ready');
  assert.deepEqual(engine.displayCalls, ['epubcfi(/bad)', undefined]);
  controller.destroy();
});

test('EPUB CFI and href navigation remain distinct engine paths', async () => {
  const { controller, engine } = await openReady();
  await controller.goTo('epubcfi(/6/4!/4/2)');
  await controller.goTo('text/chapter-2.xhtml#section');
  assert.deepEqual(engine.cfiCalls, ['epubcfi(/6/4!/4/2)']);
  assert.deepEqual(engine.hrefCalls, ['text/chapter-2.xhtml#section']);
  controller.destroy();
});

test('previous and next commands remain serialized through the controller boundary', async () => {
  const { controller, engine } = await openReady();
  await controller.previous();
  await controller.next();
  assert.equal(engine.previousCalls, 1);
  assert.equal(engine.nextCalls, 1);
  controller.destroy();
});

test('layout reflow preserves the exact current CFI by default', async () => {
  const { controller, engine } = await openReady();
  const location = regressionLocation({ cfi: 'epubcfi(/6/8!/4/2/6)' });
  engine.emitLocation(location);
  await controller.updateReadingLayout({ flow: 'scrolled', spread: 'single', width: 744, height: 920 });
  assert.deepEqual(engine.flowCalls, ['scrolled']);
  assert.deepEqual(engine.spreadCalls, [{ spread: 'single' }]);
  assert.deepEqual(engine.resizeCalls, [{ width: 744, height: 920 }]);
  assert.equal(engine.displayCalls.at(-1), location.cfi);
  controller.destroy();
});

test('layout reflow can explicitly opt out of location redisplay', async () => {
  const { controller, engine } = await openReady();
  engine.emitLocation(regressionLocation());
  const before = engine.displayCalls.length;
  await controller.updateReadingLayout({ flow: 'scrolled', preserveLocation: false });
  assert.equal(engine.displayCalls.length, before);
  controller.destroy();
});

test('appearance reflow preserves CFI while ordinary theme application can remain in-place', async () => {
  const { controller, engine } = await openReady();
  const location = regressionLocation({ cfi: 'epubcfi(/6/10!/4/2)' });
  engine.emitLocation(location);
  controller.setAppearance({ theme: 'sepia' });
  const before = engine.displayCalls.length;
  assert.equal(engine.displayCalls.length, before);
  await controller.updateAppearance({ fontScale: 1.15 });
  assert.deepEqual(engine.appearanceCalls, [{ theme: 'sepia' }, { fontScale: 1.15 }]);
  assert.equal(engine.displayCalls.at(-1), location.cfi);
  controller.destroy();
});

test('generated location maps enrich current percentage without replacing the CFI', async () => {
  const { controller, engine } = await openReady();
  const location = regressionLocation({ cfi: 'epubcfi(/6/12!/4/2)' });
  engine.emitLocation(location);
  engine.locationPercentages.set(location.cfi, 0.625);
  const map = await controller.generateLocations(1200);
  assert.equal(map.length, 1);
  assert.equal(controller.snapshot.location?.cfi, location.cfi);
  assert.equal(controller.snapshot.location?.percentage, 0.625);
  assert.deepEqual(engine.generateLocationCalls, [1200]);
  controller.destroy();
});

test('precomputed location maps can be loaded and immediately refresh current percentage', async () => {
  const { controller, engine } = await openReady();
  const location = regressionLocation({ cfi: 'epubcfi(/6/14!/4/2)' });
  engine.emitLocation(location);
  engine.locationPercentages.set(location.cfi, 0.8);
  controller.loadLocations('["synthetic"]');
  assert.deepEqual(engine.loadedLocationPayloads, ['["synthetic"]']);
  assert.equal(controller.snapshot.location?.percentage, 0.8);
  controller.destroy();
});

test('selection and content-interaction events cross the controller boundary without duplication', async () => {
  const { controller, engine } = await openReady();
  const selections: string[] = [];
  const unsubscribeSelection = controller.onSelection((selection) => selections.push(selection.cfiRange));
  const unsubscribeInteraction = controller.onInteraction((interaction) => interaction.type === 'tap');
  engine.emitSelection({ cfiRange: 'epubcfi(/6/2!,/4/2/2:0,/4/2/2:5)', text: 'Grace' });
  const handled = engine.emitInteraction({
    type: 'tap',
    xRatio: 0.9,
    yRatio: 0.5,
    pointerType: 'touch',
    interactive: false,
    hasSelection: false,
  });
  assert.deepEqual(selections, ['epubcfi(/6/2!,/4/2/2:0,/4/2/2:5)']);
  assert.equal(handled, true);
  unsubscribeSelection();
  unsubscribeInteraction();
  controller.destroy();
});

test('engine failures are normalized and leave the controller in explicit error state', async () => {
  const engine = new FakeReaderEngine();
  engine.openError = new Error('synthetic open failure');
  const controller = new ReaderController(engine);
  await assert.rejects(
    controller.open('/synthetic.epub', container),
    (error: unknown) => error instanceof ReaderEngineError && error.code === 'epub-open-failed',
  );
  assert.equal(controller.snapshot.status, 'error');
  assert.equal(controller.snapshot.error?.code, 'epub-open-failed');
  controller.destroy();
});

test('destroy is idempotent and all subsequent reader commands are rejected', async () => {
  const { controller, engine } = await openReady();
  controller.destroy();
  controller.destroy();
  assert.equal(engine.destroyCalls, 1);
  assert.equal(controller.snapshot.status, 'destroyed');
  await assert.rejects(controller.next(), (error: unknown) => error instanceof ReaderEngineError && error.code === 'engine-not-ready');
});

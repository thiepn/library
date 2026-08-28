import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePdfDeviceState } from '../../src/lib/pdf-reader/device';

test('portrait phone remains keyboard closed at full height', () => {
  const result = resolvePdfDeviceState({ viewportWidth: 390, viewportHeight: 844, layoutHeight: 844, baselineHeight: 844, focusedEditable: false, touch: true });
  assert.equal(result.state.phone, true);
  assert.equal(result.state.orientation, 'portrait');
  assert.equal(result.state.compact, false);
  assert.equal(result.state.keyboardOpen, false);
});

test('focused phone input detects a visual viewport contraction', () => {
  const result = resolvePdfDeviceState({ viewportWidth: 390, viewportHeight: 514, layoutHeight: 844, baselineHeight: 844, focusedEditable: true, touch: true });
  assert.equal(result.state.keyboardOpen, true);
  assert.equal(result.state.keyboardHeight, 330);
  assert.equal(result.state.compact, true);
});

test('contraction without editable focus is not a keyboard', () => {
  const result = resolvePdfDeviceState({ viewportWidth: 390, viewportHeight: 514, layoutHeight: 844, baselineHeight: 844, focusedEditable: false, touch: true });
  assert.equal(result.state.keyboardOpen, false);
  assert.equal(result.state.keyboardHeight, 0);
});

test('short landscape devices use compact mode', () => {
  const tablet = resolvePdfDeviceState({ viewportWidth: 844, viewportHeight: 390, layoutHeight: 390, baselineHeight: 390, focusedEditable: false, touch: true });
  assert.equal(tablet.state.phone, false);
  assert.equal(tablet.state.orientation, 'landscape');
  assert.equal(tablet.state.compact, true);

  const phone = resolvePdfDeviceState({ viewportWidth: 740, viewportHeight: 360, layoutHeight: 360, baselineHeight: 360, focusedEditable: false, touch: true });
  assert.equal(phone.state.phone, true);
  assert.equal(phone.state.orientation, 'landscape');
  assert.equal(phone.state.compact, true);
});

test('minor browser chrome movement stays below the keyboard threshold', () => {
  const result = resolvePdfDeviceState({ viewportWidth: 412, viewportHeight: 835, layoutHeight: 915, baselineHeight: 915, focusedEditable: true, touch: true });
  assert.equal(result.state.keyboardOpen, false);
  assert.equal(result.state.keyboardHeight, 0);
});

test('orientation reset replaces a stale baseline', () => {
  const result = resolvePdfDeviceState({ viewportWidth: 800, viewportHeight: 420, layoutHeight: 420, baselineHeight: 844, focusedEditable: false, touch: true, resetBaseline: true });
  assert.equal(result.baselineHeight, 420);
  assert.equal(result.state.keyboardOpen, false);
  assert.equal(result.state.orientation, 'landscape');
});

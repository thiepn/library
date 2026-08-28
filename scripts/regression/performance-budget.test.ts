import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateUpperBudget,
  formatBudgetFailure,
  percentile,
  positiveGrowth,
  summarizePerformanceSamples,
} from '../../src/lib/performance-budget';

test('RR4 percentile and summaries are deterministic', () => {
  const values = [900, 100, 400, 200, Number.NaN, -1, 800, 300, 700, 600, 500];
  assert.equal(percentile(values, 0.5), 500);
  assert.equal(percentile(values, 0.95), 900);
  assert.deepEqual(summarizePerformanceSamples(values), {
    samples: [100, 200, 300, 400, 500, 600, 700, 800, 900],
    minimum: 100,
    maximum: 900,
    average: 500,
    p50: 500,
    p95: 900,
  });
});

test('RR4 upper budgets fail closed for non-finite observations', () => {
  assert.equal(evaluateUpperBudget('page-turn', 499, 500).passed, true);
  assert.equal(evaluateUpperBudget('page-turn', 501, 500).passed, false);
  const invalid = evaluateUpperBudget('heap', Number.NaN, 1024, 'bytes');
  assert.equal(invalid.passed, false);
  assert.match(formatBudgetFailure(invalid), /heap: observed Infinity bytes, budget 1024 bytes/);
});

test('RR4 retained-memory comparisons ignore reclaimed memory', () => {
  assert.equal(positiveGrowth(150, 100), 50);
  assert.equal(positiveGrowth(80, 100), 0);
  assert.equal(positiveGrowth(Number.NaN, 100), Number.POSITIVE_INFINITY);
});

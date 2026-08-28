export interface PerformanceSamples {
  samples: number[];
  minimum: number;
  maximum: number;
  average: number;
  p50: number;
  p95: number;
}

export interface PerformanceBudgetResult {
  metric: string;
  observed: number;
  limit: number;
  passed: boolean;
  unit: 'ms' | 'bytes' | 'count';
}

function finiteSamples(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
}

export function percentile(values: readonly number[], quantile: number): number {
  const sorted = finiteSamples(values);
  if (sorted.length === 0) return 0;
  const bounded = Math.max(0, Math.min(1, quantile));
  const index = Math.max(0, Math.ceil(sorted.length * bounded) - 1);
  return sorted[index] ?? sorted.at(-1) ?? 0;
}

export function summarizePerformanceSamples(values: readonly number[]): PerformanceSamples {
  const samples = finiteSamples(values);
  const total = samples.reduce((sum, value) => sum + value, 0);
  return {
    samples,
    minimum: samples[0] ?? 0,
    maximum: samples.at(-1) ?? 0,
    average: samples.length ? total / samples.length : 0,
    p50: percentile(samples, 0.5),
    p95: percentile(samples, 0.95),
  };
}

export function evaluateUpperBudget(
  metric: string,
  observed: number,
  limit: number,
  unit: PerformanceBudgetResult['unit'] = 'ms',
): PerformanceBudgetResult {
  const safeObserved = Number.isFinite(observed) ? Math.max(0, observed) : Number.POSITIVE_INFINITY;
  const safeLimit = Number.isFinite(limit) ? Math.max(0, limit) : 0;
  return {
    metric,
    observed: safeObserved,
    limit: safeLimit,
    passed: safeObserved <= safeLimit,
    unit,
  };
}

export function positiveGrowth(after: number, before: number): number {
  if (!Number.isFinite(after) || !Number.isFinite(before)) return Number.POSITIVE_INFINITY;
  return Math.max(0, after - before);
}

export function formatBudgetFailure(result: PerformanceBudgetResult): string {
  const suffix = result.unit === 'bytes' ? ' bytes' : result.unit === 'ms' ? ' ms' : '';
  return `${result.metric}: observed ${Math.round(result.observed)}${suffix}, budget ${Math.round(result.limit)}${suffix}`;
}

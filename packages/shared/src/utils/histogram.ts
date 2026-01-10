/**
 * @fileoverview Histogram-based percentile calculation
 */

/**
 * Histogram for memory-efficient percentile calculation
 */
export interface Histogram {
  counts: Map<number, number>;  // value -> count
  total: number;
}

/**
 * Create an empty histogram
 */
export function createHistogram(): Histogram {
  return { counts: new Map(), total: 0 };
}

/**
 * Add a value to the histogram
 */
export function addToHistogram(histogram: Histogram, value: number): void {
  const currentCount = histogram.counts.get(value) || 0;
  histogram.counts.set(value, currentCount + 1);
  histogram.total++;
}

/**
 * Compute percentile from a histogram
 */
export function histogramPercentile(histogram: Histogram, p: number): number {
  if (histogram.total === 0) return 0;
  
  const targetIdx = Math.ceil((p / 100) * histogram.total);
  const sortedValues = Array.from(histogram.counts.keys()).sort((a, b) => a - b);
  
  let cumulative = 0;
  for (const value of sortedValues) {
    cumulative += histogram.counts.get(value)!;
    if (cumulative >= targetIdx) {
      return value;
    }
  }
  
  return sortedValues[sortedValues.length - 1] ?? 0;
}

/**
 * Reset histogram to empty state
 */
export function clearHistogram(histogram: Histogram): void {
  histogram.counts.clear();
  histogram.total = 0;
}

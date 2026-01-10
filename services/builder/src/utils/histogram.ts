/**
 * @fileoverview Histogram-based percentile calculation
 * Memory-efficient alternative to storing raw values
 */

/**
 * Histogram for memory-efficient percentile calculation
 * Stores count per value instead of raw values
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
 * @param histogram The histogram to compute from
 * @param p Percentile (0-100)
 * @returns The value at the given percentile
 */
export function histogramPercentile(histogram: Histogram, p: number): number {
  if (histogram.total === 0) return 0;
  
  const targetIdx = Math.ceil((p / 100) * histogram.total);
  
  // Get sorted values
  const sortedValues = Array.from(histogram.counts.keys()).sort((a, b) => a - b);
  
  let cumulative = 0;
  for (const value of sortedValues) {
    cumulative += histogram.counts.get(value)!;
    if (cumulative >= targetIdx) {
      return value;
    }
  }
  
  // Return last value if we somehow didn't find one
  return sortedValues[sortedValues.length - 1] ?? 0;
}

/**
 * Reset histogram to empty state
 */
export function clearHistogram(histogram: Histogram): void {
  histogram.counts.clear();
  histogram.total = 0;
}

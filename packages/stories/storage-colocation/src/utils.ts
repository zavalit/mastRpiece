/**
 * @fileoverview Utility functions for storage colocation story
 */

/**
 * Extract period (YYYY-MM) from a date string
 * @param date - Date string in YYYY-MM-DD format
 * @returns Period string or null if invalid
 */
export function extractPeriod(date: string | null): string | null {
  if (!date) return null;
  
  const match = /^(\d{4}-\d{2})-\d{2}$/.exec(date);
  return match?.[1] ?? null;
}

/**
 * Compute lag in months between PV and storage commissioning dates
 * @param pvDate - PV commissioning date (YYYY-MM-DD)
 * @param storageDate - Storage commissioning date (YYYY-MM-DD)
 * @returns Lag in months (positive = storage after PV), or null if invalid
 */
export function computeLagMonths(
  pvDate: string | null,
  storageDate: string | null
): number | null {
  if (!pvDate || !storageDate) return null;
  
  const pv = new Date(pvDate);
  const storage = new Date(storageDate);
  
  if (isNaN(pv.getTime()) || isNaN(storage.getTime())) return null;
  
  // Calculate month difference
  const yearDiff = storage.getFullYear() - pv.getFullYear();
  const monthDiff = storage.getMonth() - pv.getMonth();
  
  return yearDiff * 12 + monthDiff;
}

/**
 * Bin lag months into categorical ranges
 * @param lagMonths - Lag in months (can be negative)
 * @returns Bin label
 */
export function binLag(lagMonths: number): string {
  if (lagMonths < 0) return 'pv_after_storage';
  if (lagMonths <= 3) return '0-3m';
  if (lagMonths <= 12) return '3-12m';
  if (lagMonths <= 24) return '1-2y';
  if (lagMonths <= 48) return '2-4y';
  if (lagMonths <= 72) return '4-6y';
  return '6y+';
}

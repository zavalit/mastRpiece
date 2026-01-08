/**
 * @fileoverview Dataset ID generation
 */

/**
 * Generate a deterministic dataset ID
 * Format: <YYYYMMDDTHHMM>_sha256_<first12> or exportDate_<YYYYMMDD>_sha256_<first12>
 */
export function generateDatasetId(
  sha256: string,
  portalLastUpdatedAt: Date | null
): string {
  const sha256Prefix = sha256.substring(0, 12);

  if (portalLastUpdatedAt) {
    // Use portal timestamp: YYYYMMDDTHHMM_sha256_<first12>
    const dateStr = formatTimestampForId(portalLastUpdatedAt);
    return `${dateStr}_sha256_${sha256Prefix}`;
  } else {
    // Use export date: exportDate_YYYYMMDD_sha256_<first12>
    const today = new Date();
    const dateStr = formatDateForId(today);
    return `exportDate_${dateStr}_sha256_${sha256Prefix}`;
  }
}

/**
 * Format timestamp for dataset ID (YYYYMMDDTHHMM)
 */
function formatTimestampForId(date: Date): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hour = date.getHours().toString().padStart(2, '0');
  const minute = date.getMinutes().toString().padStart(2, '0');
  
  return `${year}${month}${day}T${hour}${minute}`;
}

/**
 * Format date for dataset ID (YYYYMMDD)
 */
function formatDateForId(date: Date): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return `${year}${month}${day}`;
}

/**
 * Extract export date from dataset ID
 */
export function extractExportDateFromId(datasetId: string): string {
  // Pattern: YYYYMMDDTHHMM_sha256_... or exportDate_YYYYMMDD_sha256_...
  const timestampMatch = datasetId.match(/^(\d{4})(\d{2})(\d{2})T/);
  if (timestampMatch) {
    return `${timestampMatch[1]}-${timestampMatch[2]}-${timestampMatch[3]}`;
  }

  const exportDateMatch = datasetId.match(/^exportDate_(\d{4})(\d{2})(\d{2})_/);
  if (exportDateMatch) {
    return `${exportDateMatch[1]}-${exportDateMatch[2]}-${exportDateMatch[3]}`;
  }

  // Fallback to today
  const today = new Date();
  return today.toISOString().split('T')[0] ?? '';
}

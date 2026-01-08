/**
 * @fileoverview ZIP file validation
 */

import { open } from 'node:fs/promises';

/**
 * ZIP file magic bytes
 */
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate that a file is a valid ZIP
 * Checks magic bytes and minimum size
 */
export async function validateZipFile(
  filePath: string,
  minSizeBytes: number
): Promise<ValidationResult> {
  let fileHandle;
  
  try {
    fileHandle = await open(filePath, 'r');
    const stats = await fileHandle.stat();

    // Check minimum size
    if (stats.size < minSizeBytes) {
      return {
        valid: false,
        error: `File too small: ${stats.size} bytes (minimum: ${minSizeBytes})`,
      };
    }

    // Check magic bytes
    const header = Buffer.alloc(4);
    await fileHandle.read(header, 0, 4, 0);

    if (!header.equals(ZIP_MAGIC)) {
      return {
        valid: false,
        error: `Invalid ZIP magic bytes: expected ${ZIP_MAGIC.toString('hex')}, got ${header.toString('hex')}`,
      };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: `Failed to validate ZIP: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await fileHandle?.close();
  }
}

/**
 * Check if downloaded content is an HTML error page
 * (Portal may return HTML on rate limiting or errors)
 */
export function isHtmlResponse(contentType: string | null, firstBytes?: Buffer): boolean {
  // Check content type
  if (contentType && contentType.toLowerCase().includes('text/html')) {
    return true;
  }

  // Check for HTML doctype in first bytes
  if (firstBytes) {
    const str = firstBytes.toString('utf-8').toLowerCase();
    return str.includes('<!doctype html') || str.includes('<html');
  }

  return false;
}

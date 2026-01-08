/**
 * @fileoverview SAX-based streaming XML parser with UTF-8/UTF-16 support
 */

import sax from 'sax';
import iconv from 'iconv-lite';
import type { Readable } from 'node:stream';

/**
 * Detect BOM and return encoding
 */
function detectEncoding(buffer: Buffer): { encoding: string; offset: number } {
  // UTF-8 BOM
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { encoding: 'utf-8', offset: 3 };
  }
  // UTF-16 LE BOM
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { encoding: 'utf-16le', offset: 2 };
  }
  // UTF-16 BE BOM
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    return { encoding: 'utf-16be', offset: 2 };
  }
  // Default to UTF-8
  return { encoding: 'utf-8', offset: 0 };
}

/**
 * Convert buffer to UTF-8 string, handling various encodings
 */
function decodeToUtf8(buffer: Buffer): string {
  const { encoding, offset } = detectEncoding(buffer);
  const content = buffer.slice(offset);

  if (encoding === 'utf-8') {
    return content.toString('utf-8');
  }

  return iconv.decode(content, encoding);
}

/**
 * Parse XML stream and yield records
 */
export async function parseXmlRecords<T extends Record<string, string | undefined>>(
  stream: Readable,
  recordElement: string
): Promise<T[]> {
  // Collect all data first (for BOM detection)
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  }
  const buffer = Buffer.concat(chunks);
  const xmlContent = decodeToUtf8(buffer);

  // Create SAX parser
  const parser = sax.parser(true, {
    trim: true,
    normalize: true,
  });

  let currentElement = '';
  let inRecord = false;
  let currentRecord: Record<string, string> = {};
  const records: T[] = [];

  parser.onopentag = (node) => {
    const tagName = node.name;
    currentElement = tagName;

    if (tagName === recordElement) {
      inRecord = true;
      currentRecord = {};
    }
  };

  parser.ontext = (text) => {
    if (inRecord && currentElement) {
      const trimmed = text.trim();
      if (trimmed) {
        currentRecord[currentElement] = trimmed;
      }
    }
  };

  parser.onclosetag = (tagName) => {
    if (tagName === recordElement && inRecord) {
      inRecord = false;
      records.push(currentRecord as T);
      currentRecord = {};
    }

    currentElement = '';
  };

  parser.onerror = (err) => {
    console.error('XML parsing error:', err.message);
    // Reset parser to continue
    (parser as unknown as { error: Error | null }).error = null;
    parser.resume();
  };

  // Parse the XML content
  parser.write(xmlContent).close();

  return records;
}

/**
 * Parse a number string (handles German decimal format with dot)
 */
export function parseNumber(value: string | undefined): number | null {
  if (!value || value.trim() === '') return null;
  const num = parseFloat(value.replace(',', '.'));
  return isNaN(num) ? null : num;
}

/**
 * Parse a date string (YYYY-MM-DD format)
 */
export function parseDate(value: string | undefined): string | null {
  if (!value || value.trim() === '') return null;
  // Basic validation
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return null;
}

/**
 * Extract bundesland AGS from Gemeindeschluessel (first 2 digits)
 */
export function extractBundeslandAgs(ags: string | undefined): string | null {
  if (!ags || ags.length < 2) return null;
  return ags.substring(0, 2);
}

/**
 * Get first day of month from a date string
 */
export function getMonthStart(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length < 2) return null;
  return `${parts[0]}-${parts[1]}-01`;
}

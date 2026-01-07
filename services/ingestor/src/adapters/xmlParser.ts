/**
 * @fileoverview SAX-based streaming XML parser with UTF-8/UTF-16 support
 */

import sax from 'sax';
import iconv from 'iconv-lite';
import type { Readable } from 'node:stream';
import type { ParsedUnit, TechType } from '@energy/shared';
import {
  parseDate,
  parseNumber,
  normalizeEmpty,
  XML_FIELD_MAPPING,
} from '@energy/shared';

/**
 * Parser statistics
 */
export interface ParserStats {
  parsed: number;
  skipped: number;
}

/**
 * Possible record element names in the XML
 */
const RECORD_ELEMENTS = new Set([
  'EinheitSolar',
  'EinheitWind',
  'EinheitBiomasse',
  'EinheitWasser',
  'EinheitSpeicher',
  'Einheit',
]);

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
 * Stream XML and yield parsed unit records
 */
export async function* parseXmlStream(
  stream: Readable,
  tech: TechType
): AsyncGenerator<ParsedUnit, ParserStats> {
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
  let currentRecord: Partial<Record<string, string>> = {};
  const records: ParsedUnit[] = [];
  let skipped = 0;

  parser.onopentag = (node) => {
    const tagName = node.name;
    currentElement = tagName;

    if (RECORD_ELEMENTS.has(tagName)) {
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
    if (RECORD_ELEMENTS.has(tagName) && inRecord) {
      inRecord = false;

      // Map XML fields to canonical fields
      const unitId = currentRecord['EinheitMastrNummer'];

      if (!unitId) {
        skipped++;
        return;
      }

      const parsed: ParsedUnit = {
        unit_id: unitId,
        tech,
        commissioning_date: parseDate(currentRecord['Inbetriebnahmedatum']),
        decommissioning_date: parseDate(currentRecord['DatumEndgueltigeStilllegung']),
        brutto_kw: parseNumber(currentRecord['Bruttoleistung']),
        netto_kw: parseNumber(currentRecord['Nettonennleistung']),
        bundesland_code: normalizeEmpty(currentRecord['Bundesland']),
        ags: normalizeEmpty(currentRecord['Gemeindeschluessel']),
        plz: normalizeEmpty(currentRecord['Postleitzahl']),
      };

      records.push(parsed);
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

  // Yield all parsed records
  for (const record of records) {
    yield record;
  }

  return { parsed: records.length, skipped };
}

/**
 * Create a minimal parser for testing with string input
 */
export function parseXmlString(
  xmlContent: string,
  tech: TechType
): { records: ParsedUnit[]; skipped: number } {
  const parser = sax.parser(true, {
    trim: true,
    normalize: true,
  });

  let currentElement = '';
  let inRecord = false;
  let currentRecord: Partial<Record<string, string>> = {};
  const records: ParsedUnit[] = [];
  let skipped = 0;

  parser.onopentag = (node) => {
    const tagName = node.name;
    currentElement = tagName;

    if (RECORD_ELEMENTS.has(tagName)) {
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
    if (RECORD_ELEMENTS.has(tagName) && inRecord) {
      inRecord = false;

      const unitId = currentRecord['EinheitMastrNummer'];

      if (!unitId) {
        skipped++;
        return;
      }

      const parsed: ParsedUnit = {
        unit_id: unitId,
        tech,
        commissioning_date: parseDate(currentRecord['Inbetriebnahmedatum']),
        decommissioning_date: parseDate(currentRecord['DatumEndgueltigeStilllegung']),
        brutto_kw: parseNumber(currentRecord['Bruttoleistung']),
        netto_kw: parseNumber(currentRecord['Nettonennleistung']),
        bundesland_code: normalizeEmpty(currentRecord['Bundesland']),
        ags: normalizeEmpty(currentRecord['Gemeindeschluessel']),
        plz: normalizeEmpty(currentRecord['Postleitzahl']),
      };

      records.push(parsed);
      currentRecord = {};
    }

    currentElement = '';
  };

  parser.onerror = (err) => {
    console.error('XML parsing error:', err.message);
    (parser as unknown as { error: Error | null }).error = null;
    parser.resume();
  };

  parser.write(xmlContent).close();

  return { records, skipped };
}

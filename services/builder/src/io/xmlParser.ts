/**
 * @fileoverview SAX-based streaming XML parser
 * Simplified version that processes records as callbacks
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
 * Parse XML stream with callback for each record (streaming, low memory)
 */
export async function parseXmlWithCallback<T extends Record<string, string | undefined>>(
  stream: Readable,
  recordElement: string,
  onRecord: (record: T) => void | Promise<void>
): Promise<{ recordCount: number }> {
  return new Promise((resolve, reject) => {
    // Collect enough data to detect encoding
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    let initialized = false;
    let recordCount = 0;

    // SAX parser and state
    let parser: ReturnType<typeof sax.parser>;
    let currentElement = '';
    let inRecord = false;
    let currentRecord: Record<string, string> = {};
    let pendingPromises: Promise<void>[] = [];

    const initParser = (encoding: string, offset: number, initialBuffer: Buffer) => {
      // Create SAX parser (strict mode)
      parser = sax.parser(true, { trim: true, normalize: true });

      parser.onopentag = (node) => {
        currentElement = node.name;
        if (node.name === recordElement) {
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
          const promise = onRecord(currentRecord as T);
          if (promise instanceof Promise) {
            pendingPromises.push(promise);
          }
          recordCount++;
          currentRecord = {};
        }
        currentElement = '';
      };

      parser.onerror = (err) => {
        // Log but continue
        console.error('XML parsing error:', err.message);
        (parser as unknown as { error: Error | null }).error = null;
        parser.resume();
      };

      // Create stateful decoder stream
      const decodeStream = iconv.decodeStream(encoding);

      decodeStream.on('data', async (str: string) => {
        try {
          decodeStream.pause();
          parser.write(str);
          
          if (pendingPromises.length > 0) {
            await Promise.all(pendingPromises);
            pendingPromises = [];
          }
          
          decodeStream.resume();
        } catch (err) {
          console.error('Parser write error:', err);
          decodeStream.resume();
        }
      });

      decodeStream.on('end', () => {
        if (parser) {
          parser.close();
        }
        resolve({ recordCount });
      });

      decodeStream.on('error', (err) => {
        reject(err);
      });

      // Write initial buffer (skipping BOM)
      decodeStream.write(initialBuffer.slice(offset));

      // Pipe the rest of the stream
      stream.pipe(decodeStream);
      
      initialized = true;
    };

    const onData = (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      
      chunks.push(buf);
      totalBytes += buf.length;
      
      // Initialize once we have enough data for BOM detection
      if (totalBytes >= 4) {
        stream.removeListener('data', onData);
        stream.pause(); // Pause while we setup the pipeline
        
        const fullInitialBuffer = Buffer.concat(chunks);
        const { encoding, offset } = detectEncoding(fullInitialBuffer);
        
        initParser(encoding, offset, fullInitialBuffer);
        stream.resume();
      }
    };

    stream.on('data', onData);

    stream.on('end', () => {
      // Handle case where file is smaller than 4 bytes
      if (!initialized) {
        const fullInitialBuffer = Buffer.concat(chunks);
        const { encoding, offset } = detectEncoding(fullInitialBuffer);
        initParser(encoding, offset, fullInitialBuffer);
      }
    });

    stream.on('error', (err) => {
      if (!initialized) {
        reject(err);
      }
    });
  });
}

/**
 * Parse XML stream and return all records (for smaller files)
 */
export async function parseXmlRecords<T extends Record<string, string | undefined>>(
  stream: Readable,
  recordElement: string
): Promise<T[]> {
  const records: T[] = [];
  await parseXmlWithCallback<T>(stream, recordElement, (record) => {
    records.push(record);
  });
  return records;
}


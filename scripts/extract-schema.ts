import yauzl from 'yauzl';
import sax from 'sax';
import fs from 'fs';
import path from 'path';
import { Transform } from 'stream';

const bulkZipPath = process.argv[2];
if (!bulkZipPath) {
  console.error('Please provide a path to bulk.zip');
  process.exit(1);
}

const outputPath = path.join(path.dirname(bulkZipPath), 'schema.json');

interface EntitySchema {
  fields: Set<string>;
  sampleCount: number;
}

const schemas: Record<string, EntitySchema> = {};

function getEntityName(filename: string): string {
  return filename.replace(/_[0-9]+\.xml$/, '.xml').replace(/\.xml$/, '');
}

async function processFile(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<void> {
  const entityName = getEntityName(entry.fileName);
  if (!schemas[entityName]) {
    schemas[entityName] = { fields: new Set(), sampleCount: 0 };
  }

  if (schemas[entityName].sampleCount >= 1) return;

  return new Promise((resolve, reject) => {
    zipFile.openReadStream(entry, (err, readStream) => {
      if (err || !readStream) return reject(err);

      const decoder = new TextDecoder('utf-16'); // Handles BOM automatically
      const decodeStream = new Transform({
        transform(chunk, encoding, callback) {
          try {
            const text = decoder.decode(chunk, { stream: true });
            this.push(text);
            callback();
          } catch (e: any) {
            callback(e);
          }
        },
        flush(callback) {
          this.push(decoder.decode());
          callback();
        }
      });

      const saxStream = sax.createStream(true, { trim: true });
      let depth = 0;
      let recordCount = 0;

      saxStream.on('opentag', (node) => {
        const schema = schemas[entityName];
        if (schema && depth === 2) {
          schema.fields.add(node.name);
        }
        if (depth === 1) {
          recordCount++;
        }
        depth++;

        if (recordCount > 10) {
          readStream.unpipe(decodeStream);
          decodeStream.unpipe(saxStream);
          readStream.destroy();
          resolve();
        }
      });

      saxStream.on('closetag', () => {
        depth--;
      });

      saxStream.on('end', () => {
        const schema = schemas[entityName];
        if (schema) {
          schema.sampleCount++;
        }
        resolve();
      });

      saxStream.on('error', (e) => {
        resolve();
      });

      readStream.pipe(decodeStream).pipe(saxStream);
    });
  });
}

yauzl.open(bulkZipPath, { lazyEntries: true }, (err, zipFile) => {
  if (err || !zipFile) {
    console.error(err);
    process.exit(1);
  }

  zipFile.readEntry();
  zipFile.on('entry', async (entry) => {
    if (entry.fileName.endsWith('.xml')) {
      const entityName = getEntityName(entry.fileName);
      if (!schemas[entityName] || schemas[entityName].sampleCount < 1) {
        console.log(`Processing sample for ${entityName} (${entry.fileName})...`);
        try {
          await processFile(zipFile, entry);
        } catch (e) {
          console.error(`Failed to process ${entry.fileName}:`, e);
        }
      }
    }
    zipFile.readEntry();
  });

  zipFile.on('end', () => {
    const finalSchema: Record<string, string[]> = {};
    for (const [name, schema] of Object.entries(schemas)) {
      finalSchema[name] = Array.from(schema.fields).sort();
    }

    fs.writeFileSync(outputPath, JSON.stringify(finalSchema, null, 2));
    console.log(`Schema written to ${outputPath}`);
  });
});

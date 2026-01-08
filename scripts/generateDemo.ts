/**
 * @fileoverview Generate deterministic demo data for testing
 * Includes: Storage, Solar, and Netzanschlusspunkte XMLs
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import archiver from 'archiver';

// Fixed seed for deterministic generation
const SEED = 42;

// Demo configuration
const STORAGE_COUNT = 100;
const SOLAR_COUNT = 200;
const LOCATION_COUNT = 150;  // Shared locations for colocation testing
const START_DATE = new Date('2025-12-01');
const END_DATE = new Date('2026-01-06');
const COLOCATION_RATE = 0.4; // 40% of storages are colocated with solar

// German Bundesland codes
const BUNDESLAND_CODES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16'];

// Sample PLZ for each Bundesland
const BUNDESLAND_PLZ: Record<string, string[]> = {
  '01': ['24103', '24105', '24106', '24107', '24109'],
  '02': ['20095', '20097', '20099', '20144', '20146'],
  '03': ['30159', '30161', '30163', '30165', '30167'],
  '04': ['28195', '28197', '28199', '28201', '28203'],
  '05': ['40210', '40212', '40213', '40215', '40217'],
  '06': ['60311', '60313', '60314', '60316', '60318'],
  '07': ['55116', '55118', '55120', '55122', '55124'],
  '08': ['70173', '70174', '70178', '70180', '70182'],
  '09': ['80331', '80333', '80335', '80336', '80337'],
  '10': ['66111', '66113', '66115', '66117', '66119'],
  '11': ['10115', '10117', '10119', '10178', '10179'],
  '12': ['14467', '14469', '14471', '14473', '14476'],
  '13': ['18055', '18057', '18059', '18069', '18106'],
  '14': ['01067', '01069', '01097', '01099', '01108'],
  '15': ['39104', '39106', '39108', '39110', '39112'],
  '16': ['99084', '99086', '99089', '99091', '99094'],
};

// DSO/Netzbetreiber IDs
const NETZBETREIBER_IDS = ['SNB000001', 'SNB000002', 'SNB000003', 'SNB000004', 'SNB000005'];

// Simple seeded random number generator
class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  pick<T>(array: T[]): T {
    return array[this.nextInt(0, array.length - 1)]!;
  }

  nextDate(start: Date, end: Date): Date {
    const startMs = start.getTime();
    const endMs = end.getTime();
    return new Date(this.nextInt(startMs, endMs));
  }
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]!;
}

// Generate location IDs that can be shared between solar and storage
function generateLocationIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `SEL${String(i + 1).padStart(8, '0')}`);
}

function generateStorageXml(rng: SeededRandom, locationIds: string[]): string {
  const records: string[] = [];

  for (let i = 1; i <= STORAGE_COUNT; i++) {
    const unitId = `SES${String(i).padStart(8, '0')}`;
    const bundesland = rng.pick(BUNDESLAND_CODES);
    const plzList = BUNDESLAND_PLZ[bundesland] ?? ['00000'];
    const plz = rng.pick(plzList);
    const ags = `${bundesland}${String(rng.nextInt(100, 999))}${String(rng.nextInt(100, 999))}`;
    const commissioningDate = formatDate(rng.nextDate(START_DATE, END_DATE));
    
    // Registration date is 1-30 days after commissioning
    const commDate = new Date(commissioningDate);
    const regOffset = rng.nextInt(1, 30);
    const registrationDate = new Date(commDate.getTime() + regOffset * 24 * 60 * 60 * 1000);
    
    const nettoKw = rng.nextFloat(5, 100).toFixed(2);
    const inverterKw = (parseFloat(nettoKw) * rng.nextFloat(1.0, 1.2)).toFixed(2);

    // Decide if colocated (uses a shared location)
    const isColocated = rng.next() < COLOCATION_RATE;
    const locationId = isColocated ? rng.pick(locationIds) : `SEL${String(1000000 + i).padStart(8, '0')}`;

    records.push(`  <EinheitStromSpeicher>
    <EinheitMastrNummer>${unitId}</EinheitMastrNummer>
    <LokationMaStRNummer>${locationId}</LokationMaStRNummer>
    <Inbetriebnahmedatum>${commissioningDate}</Inbetriebnahmedatum>
    <Registrierungsdatum>${formatDate(registrationDate)}</Registrierungsdatum>
    <Nettonennleistung>${nettoKw}</Nettonennleistung>
    <ZugeordnenteWirkleistungWechselrichter>${inverterKw}</ZugeordnenteWirkleistungWechselrichter>
    <Postleitzahl>${plz}</Postleitzahl>
    <Gemeindeschluessel>${ags}</Gemeindeschluessel>
  </EinheitStromSpeicher>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenStromSpeicher>
${records.join('\n')}
</EinheitenStromSpeicher>`;
}

function generateSolarXml(rng: SeededRandom, locationIds: string[]): string {
  const records: string[] = [];

  for (let i = 1; i <= SOLAR_COUNT; i++) {
    const unitId = `SEE${String(i).padStart(8, '0')}`;
    const bundesland = rng.pick(BUNDESLAND_CODES);
    const plzList = BUNDESLAND_PLZ[bundesland] ?? ['00000'];
    const plz = rng.pick(plzList);
    const ags = `${bundesland}${String(rng.nextInt(100, 999))}${String(rng.nextInt(100, 999))}`;
    const commissioningDate = formatDate(rng.nextDate(START_DATE, END_DATE));
    
    // Registration date is 1-30 days after commissioning
    const commDate = new Date(commissioningDate);
    const regOffset = rng.nextInt(1, 30);
    const registrationDate = new Date(commDate.getTime() + regOffset * 24 * 60 * 60 * 1000);
    
    const nettoKw = rng.nextFloat(5, 500).toFixed(2);

    // First N solar units use shared locations (for colocation)
    const locationId = i <= locationIds.length 
      ? locationIds[i - 1]! 
      : `SEL${String(2000000 + i).padStart(8, '0')}`;

    records.push(`  <EinheitSolar>
    <EinheitMastrNummer>${unitId}</EinheitMastrNummer>
    <LokationMaStRNummer>${locationId}</LokationMaStRNummer>
    <Inbetriebnahmedatum>${commissioningDate}</Inbetriebnahmedatum>
    <Registrierungsdatum>${formatDate(registrationDate)}</Registrierungsdatum>
    <Nettonennleistung>${nettoKw}</Nettonennleistung>
    <Postleitzahl>${plz}</Postleitzahl>
    <Gemeindeschluessel>${ags}</Gemeindeschluessel>
  </EinheitSolar>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
${records.join('\n')}
</EinheitenSolar>`;
}

function generateNetzanschlusspunkteXml(rng: SeededRandom, locationIds: string[]): string {
  const records: string[] = [];
  let napIndex = 1;

  // Create connection points for shared locations
  for (const locationId of locationIds) {
    const napId = `NAP${String(napIndex++).padStart(8, '0')}`;
    const netzbetreiber = rng.pick(NETZBETREIBER_IDS);
    const nochInPlanung = rng.next() < 0.1 ? '1' : '0';
    const lastChange = formatDate(rng.nextDate(START_DATE, END_DATE));

    records.push(`  <Netzanschlusspunkt>
    <NetzanschlusspunktMaStRNummer>${napId}</NetzanschlusspunktMaStRNummer>
    <LokationMaStRNummer>${locationId}</LokationMaStRNummer>
    <NetzbetreiberMaStRNummer>${netzbetreiber}</NetzbetreiberMaStRNummer>
    <NochInPlanung>${nochInPlanung}</NochInPlanung>
    <LetzteAenderung>${lastChange}</LetzteAenderung>
  </Netzanschlusspunkt>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Netzanschlusspunkte>
${records.join('\n')}
</Netzanschlusspunkte>`;
}

async function main(): Promise<void> {
  console.log('Generating demo data...\n');

  const rng = new SeededRandom(SEED);
  const outputPath = resolve(process.cwd(), 'demo-data', 'bulk.zip');

  // Ensure directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  // Generate shared location IDs
  const locationIds = generateLocationIds(LOCATION_COUNT);

  // Generate XML content
  const storageXml = generateStorageXml(rng, locationIds);
  const solarXml = generateSolarXml(rng, locationIds);
  const napXml = generateNetzanschlusspunkteXml(rng, locationIds);

  // Create ZIP archive
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
  });

  archive.pipe(output);

  // Add XML files to archive
  archive.append(storageXml, { name: 'EinheitenStromSpeicher.xml' });
  archive.append(solarXml, { name: 'EinheitenSolar.xml' });
  archive.append(napXml, { name: 'Netzanschlusspunkte.xml' });

  await archive.finalize();
  await finished;

  const bytes = archive.pointer();
  console.log(`✓ Generated ${outputPath}`);
  console.log(`  Size: ${(bytes / 1024).toFixed(2)} KB`);
  console.log(`  Storage units: ${STORAGE_COUNT}`);
  console.log(`  Solar units: ${SOLAR_COUNT}`);
  console.log(`  Shared locations: ${LOCATION_COUNT}`);
  console.log(`  Colocation rate: ${(COLOCATION_RATE * 100).toFixed(0)}%`);
  console.log(`  Date range: ${formatDate(START_DATE)} to ${formatDate(END_DATE)}`);
}

main().catch((err) => {
  console.error('Failed to generate demo data:', err);
  process.exit(1);
});

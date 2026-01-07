/**
 * @fileoverview Generate deterministic demo data for testing
 */

import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import archiver from 'archiver';

// Fixed seed for deterministic generation
const SEED = 42;

// Demo configuration
const SOLAR_COUNT = 200;
const WIND_COUNT = 50;
const START_DATE = new Date('2025-12-01');
const END_DATE = new Date('2026-01-06');
const DECOMMISSION_RATE = 0.05; // 5% decommissioned

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

function generateSolarXml(rng: SeededRandom): string {
  const records: string[] = [];

  for (let i = 1; i <= SOLAR_COUNT; i++) {
    const unitId = `SEE${String(i).padStart(4, '0')}`;
    const bundesland = rng.pick(BUNDESLAND_CODES);
    const plzList = BUNDESLAND_PLZ[bundesland] ?? ['00000'];
    const plz = rng.pick(plzList);
    const ags = `${bundesland}${String(rng.nextInt(100, 999))}${String(rng.nextInt(100, 999))}`;
    const commissioningDate = formatDate(rng.nextDate(START_DATE, END_DATE));
    const bruttoKw = rng.nextFloat(5, 500).toFixed(2);
    const nettoKw = (parseFloat(bruttoKw) * rng.nextFloat(0.9, 0.98)).toFixed(2);

    // Decide if decommissioned
    const isDecommissioned = rng.next() < DECOMMISSION_RATE;
    const decommissioningDate = isDecommissioned
      ? formatDate(rng.nextDate(new Date(commissioningDate), END_DATE))
      : '';

    records.push(`  <EinheitSolar>
    <EinheitMastrNummer>${unitId}</EinheitMastrNummer>
    <Inbetriebnahmedatum>${commissioningDate}</Inbetriebnahmedatum>
    <Bruttoleistung>${bruttoKw}</Bruttoleistung>
    <Nettonennleistung>${nettoKw}</Nettonennleistung>
    <Bundesland>${bundesland}</Bundesland>
    <Postleitzahl>${plz}</Postleitzahl>
    <Gemeindeschluessel>${ags}</Gemeindeschluessel>
    <DatumEndgueltigeStilllegung>${decommissioningDate}</DatumEndgueltigeStilllegung>
  </EinheitSolar>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
${records.join('\n')}
</EinheitenSolar>`;
}

function generateWindXml(rng: SeededRandom): string {
  const records: string[] = [];

  for (let i = 1; i <= WIND_COUNT; i++) {
    const unitId = `SEE${String(SOLAR_COUNT + i).padStart(4, '0')}`;
    const bundesland = rng.pick(BUNDESLAND_CODES);
    const plzList = BUNDESLAND_PLZ[bundesland] ?? ['00000'];
    const plz = rng.pick(plzList);
    const ags = `${bundesland}${String(rng.nextInt(100, 999))}${String(rng.nextInt(100, 999))}`;
    const commissioningDate = formatDate(rng.nextDate(START_DATE, END_DATE));
    const bruttoKw = rng.nextFloat(1000, 5000).toFixed(2);
    const nettoKw = (parseFloat(bruttoKw) * rng.nextFloat(0.9, 0.98)).toFixed(2);

    // Decide if decommissioned
    const isDecommissioned = rng.next() < DECOMMISSION_RATE;
    const decommissioningDate = isDecommissioned
      ? formatDate(rng.nextDate(new Date(commissioningDate), END_DATE))
      : '';

    records.push(`  <EinheitWind>
    <EinheitMastrNummer>${unitId}</EinheitMastrNummer>
    <Inbetriebnahmedatum>${commissioningDate}</Inbetriebnahmedatum>
    <Bruttoleistung>${bruttoKw}</Bruttoleistung>
    <Nettonennleistung>${nettoKw}</Nettonennleistung>
    <Bundesland>${bundesland}</Bundesland>
    <Postleitzahl>${plz}</Postleitzahl>
    <Gemeindeschluessel>${ags}</Gemeindeschluessel>
    <DatumEndgueltigeStilllegung>${decommissioningDate}</DatumEndgueltigeStilllegung>
  </EinheitWind>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenWind>
${records.join('\n')}
</EinheitenWind>`;
}

async function main(): Promise<void> {
  console.log('Generating demo data...\n');

  const rng = new SeededRandom(SEED);
  const outputPath = resolve(process.cwd(), 'demo-data', 'bulk.zip');

  // Ensure directory exists
  await mkdir(dirname(outputPath), { recursive: true });

  // Generate XML content
  const solarXml = generateSolarXml(rng);
  const windXml = generateWindXml(rng);

  // Create ZIP archive
  const output = createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  const finished = new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
  });

  archive.pipe(output);

  // Add XML files to archive
  archive.append(solarXml, { name: 'EinheitenSolar.xml' });
  archive.append(windXml, { name: 'EinheitenWind.xml' });

  await archive.finalize();
  await finished;

  const bytes = archive.pointer();
  console.log(`✓ Generated ${outputPath}`);
  console.log(`  Size: ${(bytes / 1024).toFixed(2)} KB`);
  console.log(`  Solar units: ${SOLAR_COUNT}`);
  console.log(`  Wind units: ${WIND_COUNT}`);
  console.log(`  Date range: ${formatDate(START_DATE)} to ${formatDate(END_DATE)}`);
  console.log(`  Decommission rate: ${(DECOMMISSION_RATE * 100).toFixed(0)}%`);
}

main().catch((err) => {
  console.error('Failed to generate demo data:', err);
  process.exit(1);
});

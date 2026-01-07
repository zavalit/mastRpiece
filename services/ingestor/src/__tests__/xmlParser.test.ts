/**
 * @fileoverview Unit tests for XML parser
 */

import { describe, it, expect } from 'vitest';
import { parseXmlString } from '../adapters/xmlParser.js';

describe('XML Parser', () => {
  describe('parseXmlString', () => {
    it('should parse valid solar XML records', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0001</EinheitMastrNummer>
    <Inbetriebnahmedatum>2026-01-06</Inbetriebnahmedatum>
    <Bruttoleistung>12.5</Bruttoleistung>
    <Nettonennleistung>12.0</Nettonennleistung>
    <Bundesland>08</Bundesland>
    <Postleitzahl>70173</Postleitzahl>
    <Gemeindeschluessel>08111000</Gemeindeschluessel>
    <DatumEndgueltigeStilllegung></DatumEndgueltigeStilllegung>
  </EinheitSolar>
</EinheitenSolar>`;

      const result = parseXmlString(xml, 'solar');

      expect(result.records).toHaveLength(1);
      expect(result.skipped).toBe(0);
      
      const record = result.records[0];
      expect(record).toBeDefined();
      expect(record!.unit_id).toBe('SEE0001');
      expect(record!.tech).toBe('solar');
      expect(record!.commissioning_date).toBe('2026-01-06');
      expect(record!.brutto_kw).toBe(12.5);
      expect(record!.netto_kw).toBe(12.0);
      expect(record!.bundesland_code).toBe('08');
      expect(record!.plz).toBe('70173');
      expect(record!.ags).toBe('08111000');
      expect(record!.decommissioning_date).toBeNull();
    });

    it('should parse valid wind XML records', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenWind>
  <EinheitWind>
    <EinheitMastrNummer>SEW0001</EinheitMastrNummer>
    <Inbetriebnahmedatum>2025-12-15</Inbetriebnahmedatum>
    <Bruttoleistung>3500.0</Bruttoleistung>
    <Nettonennleistung>3400.0</Nettonennleistung>
    <Bundesland>01</Bundesland>
    <Postleitzahl>24103</Postleitzahl>
    <Gemeindeschluessel>01002000</Gemeindeschluessel>
  </EinheitWind>
</EinheitenWind>`;

      const result = parseXmlString(xml, 'wind');

      expect(result.records).toHaveLength(1);
      expect(result.records[0]!.tech).toBe('wind');
      expect(result.records[0]!.brutto_kw).toBe(3500.0);
    });

    it('should handle missing optional fields as null', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0002</EinheitMastrNummer>
  </EinheitSolar>
</EinheitenSolar>`;

      const result = parseXmlString(xml, 'solar');

      expect(result.records).toHaveLength(1);
      const record = result.records[0]!;
      expect(record.unit_id).toBe('SEE0002');
      expect(record.commissioning_date).toBeNull();
      expect(record.brutto_kw).toBeNull();
      expect(record.netto_kw).toBeNull();
      expect(record.bundesland_code).toBeNull();
      expect(record.plz).toBeNull();
      expect(record.ags).toBeNull();
    });

    it('should handle empty strings as null', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0003</EinheitMastrNummer>
    <Inbetriebnahmedatum></Inbetriebnahmedatum>
    <Bruttoleistung></Bruttoleistung>
    <Bundesland></Bundesland>
  </EinheitSolar>
</EinheitenSolar>`;

      const result = parseXmlString(xml, 'solar');

      expect(result.records).toHaveLength(1);
      const record = result.records[0]!;
      expect(record.commissioning_date).toBeNull();
      expect(record.brutto_kw).toBeNull();
      expect(record.bundesland_code).toBeNull();
    });

    it('should skip records without EinheitMastrNummer', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
  <EinheitSolar>
    <Inbetriebnahmedatum>2026-01-06</Inbetriebnahmedatum>
    <Bruttoleistung>12.5</Bruttoleistung>
  </EinheitSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0004</EinheitMastrNummer>
    <Bruttoleistung>10.0</Bruttoleistung>
  </EinheitSolar>
</EinheitenSolar>`;

      const result = parseXmlString(xml, 'solar');

      expect(result.records).toHaveLength(1);
      expect(result.skipped).toBe(1);
      expect(result.records[0]!.unit_id).toBe('SEE0004');
    });

    it('should parse multiple records', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0005</EinheitMastrNummer>
    <Bruttoleistung>10.0</Bruttoleistung>
  </EinheitSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0006</EinheitMastrNummer>
    <Bruttoleistung>20.0</Bruttoleistung>
  </EinheitSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0007</EinheitMastrNummer>
    <Bruttoleistung>30.0</Bruttoleistung>
  </EinheitSolar>
</EinheitenSolar>`;

      const result = parseXmlString(xml, 'solar');

      expect(result.records).toHaveLength(3);
      expect(result.records.map(r => r.unit_id)).toEqual(['SEE0005', 'SEE0006', 'SEE0007']);
    });

    it('should handle decommissioned units', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EinheitenSolar>
  <EinheitSolar>
    <EinheitMastrNummer>SEE0008</EinheitMastrNummer>
    <Inbetriebnahmedatum>2024-01-01</Inbetriebnahmedatum>
    <DatumEndgueltigeStilllegung>2025-12-31</DatumEndgueltigeStilllegung>
  </EinheitSolar>
</EinheitenSolar>`;

      const result = parseXmlString(xml, 'solar');

      expect(result.records).toHaveLength(1);
      expect(result.records[0]!.decommissioning_date).toBe('2025-12-31');
    });
  });
});

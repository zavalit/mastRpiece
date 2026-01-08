/**
 * @fileoverview Unit tests for portal HTML parser
 */

import { describe, it, expect } from 'vitest';
import { parsePortalHtml, parseGermanDateTime } from '../adapters/portalParser.js';

describe('Portal HTML Parser', () => {
  describe('parsePortalHtml', () => {
    it('should extract download URL from link with Gesamtdatenexport text', () => {
      const html = `
        <html>
          <body>
            <a href="https://download.example.com/Gesamtdatenexport_2026.zip">
              Gesamtdatenexport herunterladen
            </a>
          </body>
        </html>
      `;

      const result = parsePortalHtml(html);

      expect(result.downloadUrl).toBe('https://download.example.com/Gesamtdatenexport_2026.zip');
    });

    it('should extract download URL from .zip href', () => {
      const html = `
        <html>
          <body>
            <a href="https://download.example.com/bulk-export.zip">Download</a>
          </body>
        </html>
      `;

      const result = parsePortalHtml(html);

      expect(result.downloadUrl).toBe('https://download.example.com/bulk-export.zip');
    });

    it('should handle relative URLs', () => {
      const html = `
        <html>
          <body>
            <a href="/downloads/Gesamtdatenexport.zip">Download</a>
          </body>
        </html>
      `;

      const result = parsePortalHtml(html);

      expect(result.downloadUrl).toBe(
        'https://www.marktstammdatenregister.de/downloads/Gesamtdatenexport.zip'
      );
    });

    it('should extract last updated timestamp with Stand label', () => {
      const html = `
        <html>
          <body>
            <a href="/test.zip">Download</a>
            <p>Stand: 07.01.2026 05:00</p>
          </body>
        </html>
      `;

      const result = parsePortalHtml(html);

      expect(result.lastUpdatedLabel).toBe('07.01.2026 05:00');
      expect(result.lastUpdatedAt).toBeInstanceOf(Date);
      expect(result.lastUpdatedAt?.getFullYear()).toBe(2026);
      expect(result.lastUpdatedAt?.getMonth()).toBe(0); // January
      expect(result.lastUpdatedAt?.getDate()).toBe(7);
    });

    it('should throw if no download URL found', () => {
      const html = `<html><body><p>No links here</p></body></html>`;

      expect(() => parsePortalHtml(html)).toThrow('Could not find bulk download URL');
    });
  });

  describe('parseGermanDateTime', () => {
    it('should parse DD.MM.YYYY HH:MM format', () => {
      const result = parseGermanDateTime('07.01.2026 05:00');

      expect(result).toBeInstanceOf(Date);
      expect(result?.getFullYear()).toBe(2026);
      expect(result?.getMonth()).toBe(0); // January
      expect(result?.getDate()).toBe(7);
      expect(result?.getHours()).toBe(5);
      expect(result?.getMinutes()).toBe(0);
    });

    it('should return null for invalid format', () => {
      expect(parseGermanDateTime('invalid')).toBeNull();
      expect(parseGermanDateTime('2026-01-07')).toBeNull();
      expect(parseGermanDateTime('01/07/2026 05:00')).toBeNull();
    });
  });
});

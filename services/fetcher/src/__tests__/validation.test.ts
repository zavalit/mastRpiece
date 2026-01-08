/**
 * @fileoverview Unit tests for ZIP validation
 */

import { describe, it, expect } from 'vitest';
import { isHtmlResponse } from '../domain/validation.js';

describe('ZIP Validation', () => {
  describe('isHtmlResponse', () => {
    it('should detect text/html content type', () => {
      expect(isHtmlResponse('text/html')).toBe(true);
      expect(isHtmlResponse('text/html; charset=utf-8')).toBe(true);
      expect(isHtmlResponse('TEXT/HTML')).toBe(true);
    });

    it('should not detect non-HTML content types', () => {
      expect(isHtmlResponse('application/zip')).toBe(false);
      expect(isHtmlResponse('application/octet-stream')).toBe(false);
      expect(isHtmlResponse(null)).toBe(false);
    });

    it('should detect HTML in first bytes', () => {
      const htmlBytes = Buffer.from('<!doctype html><html>');
      expect(isHtmlResponse(null, htmlBytes)).toBe(true);

      const zipBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      expect(isHtmlResponse(null, zipBytes)).toBe(false);
    });
  });
});

/**
 * @fileoverview Unit tests for the downloader adapter
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { downloadFile, isHtmlContentType } from '../adapters/downloader.js';
import * as fs from 'node:fs';
import { Readable, Writable } from 'node:stream';

vi.mock('node:fs', () => ({
  createWriteStream: vi.fn().mockImplementation(() => {
    return new Writable({
      write(chunk, encoding, callback) {
        callback();
      },
    });
  }),
}));

describe('Downloader', () => {
  const mockUrl = 'https://example.com/test.zip';
  const mockDest = '/tmp/test.zip';
  const mockUserAgent = 'test-agent';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('downloadFile', () => {
    it('should successfully download a file and compute sha256', async () => {
      const mockContent = 'test-content';
      const mockBody = new Readable();
      mockBody.push(mockContent);
      mockBody.push(null);

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: {
          get: (name: string) => {
            const h: Record<string, string> = {
              'content-type': 'application/zip',
              'content-length': String(mockContent.length),
              'etag': 'w-123',
            };
            return h[name.toLowerCase()] || null;
          },
        },
        body: Readable.toWeb(mockBody),
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const result = await downloadFile(mockUrl, mockDest, mockUserAgent);

      expect(result.httpStatus).toBe(200);
      expect(result.contentType).toBe('application/zip');
      expect(result.bytes).toBe(mockContent.length);
      expect(result.sha256).toBeDefined();
      expect(result.sha256).toBe('0a3666a0710c08aa6d0de92ce72beeb5b93124cce1bf3701c9d6cdeb543cb73e'); // sha256 of 'test-content'
      
      expect(fs.createWriteStream).toHaveBeenCalledWith(mockDest);
    });

    it('should throw error if response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
        statusText: 'Not Found',
        headers: {
            get: () => null
        }
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(downloadFile(mockUrl, mockDest, mockUserAgent)).rejects.toThrow(
        'Download failed: 404 Not Found'
      );
    });

    it('should throw error if response has no body', async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        body: null,
        headers: {
            get: () => null
        }
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      await expect(downloadFile(mockUrl, mockDest, mockUserAgent)).rejects.toThrow(
        'Response has no body'
      );
    });
  });

  describe('isHtmlContentType', () => {
    it('should return true for HTML content types', () => {
      expect(isHtmlContentType('text/html')).toBe(true);
      expect(isHtmlContentType('text/html; charset=UTF-8')).toBe(true);
      expect(isHtmlContentType('TEXT/HTML')).toBe(true);
    });

    it('should return false for non-HTML content types', () => {
      expect(isHtmlContentType('application/zip')).toBe(false);
      expect(isHtmlContentType('application/octet-stream')).toBe(false);
      expect(isHtmlContentType(null)).toBe(false);
      expect(isHtmlContentType('')).toBe(false);
    });
  });
});

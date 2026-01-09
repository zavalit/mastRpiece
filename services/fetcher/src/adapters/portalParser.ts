/**
 * @fileoverview Portal HTML parser using cheerio
 */

import * as cheerio from 'cheerio';

/**
 * Parsed portal information
 */
export interface PortalInfo {
  downloadUrl: string;
  lastUpdatedLabel: string;
  lastUpdatedAt: Date | null;
}

/**
 * Parse the MaStR Datendownload portal page
 * Extracts the bulk download URL and last updated timestamp
 */
export function parsePortalHtml(html: string): PortalInfo {
  const $ = cheerio.load(html);

  // Find the container for "Gesamtdatenauszug vom Vortag"
  // This is more robust than global searching as it targets the specific section shown in the UI.
  const sectionHeading = $('h4').filter((_, el) => $(el).text().includes('Gesamtdatenauszug vom Vortag'));
  const section = sectionHeading.closest('div');

  let downloadUrl = '';
  
  if (section.length > 0) {
    // Look for the primary download button within this section
    const downloadBtn = section.find('a.btn-primary[title="Download"]');
    if (downloadBtn.length > 0) {
      downloadUrl = downloadBtn.attr('href') || '';
    }
  }

  // Fallback to legacy global search if section-based search fails
  if (!downloadUrl) {
    $('a').each((_: number, element): boolean | void => {
      const href = $(element).attr('href');
      const text = $(element).text();
      
      if (href && (
        text.toLowerCase().includes('gesamtdatenexport') ||
        href.toLowerCase().includes('gesamtdatenexport') ||
        href.toLowerCase().includes('.zip')
      )) {
        downloadUrl = href;
        return false;
      }
      return undefined;
    });
  }

  if (!downloadUrl) {
    throw new Error('Could not find bulk download URL in portal page');
  }

  // Normalize the download URL
  if (!downloadUrl.startsWith('http')) {
    // Handle relative URLs
    downloadUrl = new URL(downloadUrl, 'https://www.marktstammdatenregister.de').href;
  }

  // Find the last updated timestamp
  let lastUpdatedLabel = '';
  let lastUpdatedAt: Date | null = null;

  // 1. Try to find the date within the same section container
  if (section.length > 0) {
    const sectionText = section.text();
    // Pattern: "Letzte Aktualisierung: DD.MM.YYYY HH:MM:SS" or "DD.MM.YYYY HH:MM"
    const updatePattern = /Letzte\s+Aktualisierung[:\s]+(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i;
    const updateMatch = sectionText.match(updatePattern);
    
    if (updateMatch?.[1]) {
      lastUpdatedLabel = updateMatch[1];
      lastUpdatedAt = parseGermanDateTime(lastUpdatedLabel);
    }
  }

  // 2. Fallback to global patterns if section search failed
  if (!lastUpdatedLabel) {
    const pageText = $('body').text();
    
    // Pattern: "Stand: DD.MM.YYYY HH:MM" or similar
    const standPattern = /Stand[:\s]+(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/i;
    const standMatch = pageText.match(standPattern);
    
    if (standMatch?.[1]) {
      lastUpdatedLabel = standMatch[1];
      lastUpdatedAt = parseGermanDateTime(lastUpdatedLabel);
    } else {
      // Last resort: any date-looking pattern
      const datePattern = /(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}(?::\d{2})?)/;
      const dateMatch = pageText.match(datePattern);
      if (dateMatch?.[1]) {
        lastUpdatedLabel = dateMatch[1];
        lastUpdatedAt = parseGermanDateTime(lastUpdatedLabel);
      }
    }
  }

  return {
    downloadUrl,
    lastUpdatedLabel,
    lastUpdatedAt,
  };
}

/**
 * Parse German date/time format (DD.MM.YYYY HH:MM) to Date
 */
export function parseGermanDateTime(dateStr: string): Date | null {
  // Pattern: DD.MM.YYYY HH:MM[:SS]
  const pattern = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/;
  const match = dateStr.match(pattern);
  
  if (!match) {
    return null;
  }

  const [, day, month, year, hour, minute, second = '00'] = match;
  
  // Create date in local timezone (Germany is UTC+1/UTC+2)
  // We'll assume UTC+1 for simplicity
  const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}+01:00`;
  
  try {
    return new Date(isoString);
  } catch {
    return null;
  }
}

/**
 * Fetch the portal page HTML
 */
export async function fetchPortalPage(
  portalUrl: string,
  userAgent: string
): Promise<string> {
  const response = await fetch(portalUrl, {
    headers: {
      'User-Agent': userAgent,
      Accept: 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch portal page: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

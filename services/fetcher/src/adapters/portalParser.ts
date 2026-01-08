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

  // Find the download link for Gesamtdatenexport
  // The page typically has a link with text containing "Gesamtdatenexport"
  let downloadUrl = '';
  
  $('a').each((_: number, element): boolean | void => {
    const href = $(element).attr('href');
    const text = $(element).text();
    
    // Look for links containing Gesamtdatenexport or bulk download patterns
    if (href && (
      text.toLowerCase().includes('gesamtdatenexport') ||
      href.toLowerCase().includes('gesamtdatenexport') ||
      href.toLowerCase().includes('.zip')
    )) {
      downloadUrl = href;
      return false; // Break the loop
    }
    return undefined;
  });

  // If still not found, look for any .zip download link
  if (!downloadUrl) {
    $('a[href$=".zip"]').each((_: number, element): boolean | void => {
      const href = $(element).attr('href');
      if (href) {
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
  // Look for text like "Stand: 07.01.2026 05:00" or similar
  let lastUpdatedLabel = '';
  let lastUpdatedAt: Date | null = null;

  // Search for timestamp patterns in the page
  const pageText = $('body').text();
  
  // Pattern: "Stand: DD.MM.YYYY HH:MM" or similar
  const standPattern = /Stand[:\s]+(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/i;
  const standMatch = pageText.match(standPattern);
  
  if (standMatch?.[1]) {
    lastUpdatedLabel = standMatch[1];
    lastUpdatedAt = parseGermanDateTime(lastUpdatedLabel);
  } else {
    // Alternative pattern: look for date in specific elements
    const datePattern = /(\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2})/;
    const dateMatch = pageText.match(datePattern);
    if (dateMatch?.[1]) {
      lastUpdatedLabel = dateMatch[1];
      lastUpdatedAt = parseGermanDateTime(lastUpdatedLabel);
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
  // Pattern: DD.MM.YYYY HH:MM
  const pattern = /(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/;
  const match = dateStr.match(pattern);
  
  if (!match) {
    return null;
  }

  const [, day, month, year, hour, minute] = match;
  
  // Create date in local timezone (Germany is UTC+1/UTC+2)
  // We'll assume UTC+1 for simplicity
  const isoString = `${year}-${month}-${day}T${hour}:${minute}:00+01:00`;
  
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

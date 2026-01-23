/**
 * OGS Loader - Download and parse SGF files from Online-Go.com URLs
 */

import { parse } from '@kaya/sgf';

/**
 * Extract game name from SGF content for use as filename.
 * Uses GN (game name) property if present, otherwise returns 'untitled'.
 */
export function extractGameNameFromSGF(sgfContent: string): string {
  try {
    const roots = parse(sgfContent);
    if (roots.length > 0) {
      const gameName = roots[0].data.GN?.[0];
      if (gameName?.trim()) {
        // Sanitize the game name for use as filename
        return gameName.trim().replace(/[/\\?%*:|"<>]/g, '-');
      }
    }
  } catch {
    // Parsing failed, return default
  }
  return 'untitled';
}

/**
 * Generate a filename for SGF content based on its source.
 * - For OGS URLs: uses ogs-{gameId}.sgf
 * - For SGF content: extracts game name, or falls back to 'untitled.sgf'
 */
export function getFilenameForSGF(result: {
  sgf: string;
  source: 'direct' | 'ogs';
  gameId?: string;
}): string {
  if (result.source === 'ogs' && result.gameId) {
    return `ogs-${result.gameId}.sgf`;
  }
  const gameName = extractGameNameFromSGF(result.sgf);
  return `${gameName}.sgf`;
}

/**
 * Extract game ID from an OGS URL
 * Supports formats:
 * - https://online-go.com/game/81344851
 * - https://online-go.com/game/81344851/something
 * - http://online-go.com/game/81344851
 */
export function extractOGSGameId(url: string): string | null {
  try {
    const match = url.match(/online-go\.com\/game\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Check if a string is an OGS game URL
 */
export function isOGSUrl(text: string): boolean {
  return extractOGSGameId(text) !== null;
}

/**
 * Download SGF content from OGS API
 * @param gameId - The OGS game ID
 * @returns SGF content as string
 */
export async function downloadOGSSGF(gameId: string): Promise<string> {
  const apiUrl = `https://online-go.com/api/v1/games/${gameId}/sgf`;

  const response = await fetch(apiUrl, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Failed to download OGS game ${gameId}: ${response.statusText}`);
  }

  const sgfContent = await response.text();

  if (!sgfContent || sgfContent.trim().length === 0) {
    throw new Error(`Empty SGF content received from OGS game ${gameId}`);
  }

  return sgfContent;
}

/**
 * Try to load content as SGF or OGS URL
 * @param content - Either SGF content or OGS URL
 * @returns SGF content string
 */
export async function loadContentOrOGSUrl(content: string): Promise<{
  sgf: string;
  source: 'direct' | 'ogs';
  gameId?: string;
}> {
  const trimmed = content.trim();

  // If it looks like an SGF file (starts with '('), treat it as direct content
  // This prevents SGF files containing OGS URLs in comments from being treated as URLs
  if (trimmed.startsWith('(')) {
    return { sgf: trimmed, source: 'direct' };
  }

  // First, check if it's an OGS URL
  const gameId = extractOGSGameId(trimmed);

  if (gameId) {
    // It's an OGS URL, download the SGF
    const sgf = await downloadOGSSGF(gameId);
    return { sgf, source: 'ogs', gameId };
  }

  // It's not an OGS URL, assume it's direct SGF content
  return { sgf: trimmed, source: 'direct' };
}

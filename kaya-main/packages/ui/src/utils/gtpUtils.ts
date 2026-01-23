/**
 * GTP (Go Text Protocol) utilities
 * Utilities for parsing and working with GTP format coordinates
 */

export type Vertex = [number, number];

/**
 * Parse a GTP coordinate string into board coordinates
 *
 * GTP format uses letters A-T (excluding I) for columns and numbers 1-19 for rows.
 * Example: "D4" means column D (index 3), row 4 from bottom
 *
 * @param gtpMove - GTP format move string (e.g., "D4", "Q16", "PASS")
 * @param boardSize - Size of the board (typically 9, 13, or 19)
 * @returns Vertex coordinates [x, y] or null for pass/invalid moves
 *
 * @example
 * parseGTPCoordinate("D4", 19) // returns [3, 15]
 * parseGTPCoordinate("PASS", 19) // returns null
 * parseGTPCoordinate("Q16", 19) // returns [15, 3]
 */
export function parseGTPCoordinate(gtpMove: string, boardSize: number): Vertex | null {
  if (!gtpMove || typeof gtpMove !== 'string') {
    return null;
  }

  const normalized = gtpMove.trim().toUpperCase();

  // Handle pass moves
  if (normalized === 'PASS') {
    return null;
  }

  // GTP uses A-T excluding I (19 letters for 19x19 board)
  const letters = 'ABCDEFGHJKLMNOPQRST';

  if (normalized.length < 2) {
    return null;
  }

  const columnLetter = normalized[0];
  const rowString = normalized.slice(1);

  // Parse column (x coordinate)
  const x = letters.indexOf(columnLetter);
  if (x === -1) {
    return null;
  }

  // Parse row (y coordinate)
  // GTP rows are numbered from bottom (1) to top (boardSize)
  // We need to convert to 0-indexed from top
  const gtpRow = parseInt(rowString, 10);
  if (isNaN(gtpRow) || gtpRow < 1 || gtpRow > boardSize) {
    return null;
  }

  const y = boardSize - gtpRow;

  // Validate coordinates are within board bounds
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
    return null;
  }

  return [x, y];
}

/**
 * Convert board coordinates to GTP format
 *
 * @param vertex - Board coordinates [x, y]
 * @param boardSize - Size of the board
 * @returns GTP format string (e.g., "D4") or "PASS" for null/invalid coordinates
 *
 * @example
 * vertexToGTP([3, 15], 19) // returns "D4"
 * vertexToGTP([15, 3], 19) // returns "Q16"
 * vertexToGTP(null, 19) // returns "PASS"
 */
export function vertexToGTP(vertex: Vertex | null, boardSize: number): string {
  if (!vertex) {
    return 'PASS';
  }

  const [x, y] = vertex;

  // Validate coordinates
  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
    return 'PASS';
  }

  const letters = 'ABCDEFGHJKLMNOPQRST';
  const column = letters[x];
  const row = boardSize - y;

  return `${column}${row}`;
}

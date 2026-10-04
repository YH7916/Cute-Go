import type { BoardState } from '../../types';
import { getDefaultKomi } from './config';
import { cleanBoardWithTerritory } from './scoring';

// A live estimate for the app's territory + prisoners rules, not an official
// KataGo scoreLead or a final score. Unsettled empty points retain fractional
// ownership instead of flood-filling an open board from its current boundary.
export function estimateLiveLead(
  board: BoardState,
  ownership: Float32Array | null,
  komi = getDefaultKomi(board.length),
  captures: { black: number; white: number } = { black: 0, white: 0 },
): number | undefined {
  if (!ownership || ownership.length !== board.length * board.length ||
      ownership.some(value => !Number.isFinite(value) || Math.abs(value) > 1)) return undefined;
  const cleaned = cleanBoardWithTerritory(board, ownership);
  let lead = captures.black - captures.white - komi;
  for (let y = 0; y < board.length; y++) for (let x = 0; x < board.length; x++) {
    if (cleaned[y][x]) continue; // Living stones do not count under territory scoring.
    lead += ownership[y * board.length + x];
    const removed = board[y][x];
    // A unanimously predicted dead chain leaves territory and also yields prisoners.
    if (removed) lead += removed.color === 'white' ? 1 : -1;
  }
  return Number.isFinite(lead) ? lead : undefined;
}

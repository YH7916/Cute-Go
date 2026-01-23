/**
 * Utility functions for processing AI analysis results
 */

export interface ProcessedAnalysis {
  currentTurn: 'B' | 'W';
  blackWinRate: number; // 0-1
  whiteWinRate: number; // 0-1
  blackScoreLead: number; // positive = Black ahead
  whiteScoreLead: number; // positive = White ahead
  leadingPlayer: 'B' | 'W';
  leadAmount: number;
}

/**
 * Calculate whose turn it is based on move number
 * @param moveNumber - The move number (0 = start, 1 = after first move, etc.)
 * @param explicitTurn - Explicit turn from SGF PL property (if available)
 * @returns 'B' for Black's turn, 'W' for White's turn
 */
export function calculateCurrentTurn(
  moveNumber: number,
  explicitTurn?: 'B' | 'W' | null
): 'B' | 'W' {
  if (explicitTurn) {
    return explicitTurn;
  }

  // Black plays first (move 0 = start, Black to play)
  // After move 1 (Black played), it's White's turn (odd)
  // After move 2 (White played), it's Black's turn (even)
  return moveNumber % 2 === 0 ? 'B' : 'W';
}

/**
 * Process raw analysis results to get consistent win rates and score leads
 *
 * KataGo convention:
 * - scoreLead is ALWAYS from Black's perspective (positive = Black ahead, negative = White ahead)
 * - winRate from the engine is from the current player's perspective
 *
 * This function recalculates everything from the scoreLead (which is always reliable)
 * to ensure consistency between win rates and score leads.
 *
 * @param scoreLead - Score lead from Black's perspective (from neural network)
 * @param currentTurn - Whose turn it is
 * @returns Processed analysis with consistent win rates and score leads
 */
export function processAnalysis(scoreLead: number, currentTurn: 'B' | 'W'): ProcessedAnalysis {
  // Score lead is always from Black's perspective
  const blackScoreLead = scoreLead;
  const whiteScoreLead = -scoreLead;

  // Calculate Black's win rate from score lead using tanh approximation
  // This matches KataGo's internal calculation
  const blackWinRate = 0.5 + Math.tanh(blackScoreLead / 20) / 2;
  const whiteWinRate = 1 - blackWinRate;

  // Determine who is leading
  const leadingPlayer = blackScoreLead > 0 ? 'B' : 'W';
  const leadAmount = Math.abs(blackScoreLead);

  return {
    currentTurn,
    blackWinRate,
    whiteWinRate,
    blackScoreLead,
    whiteScoreLead,
    leadingPlayer,
    leadAmount,
  };
}

/**
 * Format win rate as percentage string
 */
export function formatWinRate(winRate: number): string {
  return `${(winRate * 100).toFixed(1)}%`;
}

/**
 * Format score lead with sign
 */
export function formatScoreLead(scoreLead: number): string {
  return `${scoreLead > 0 ? '+' : ''}${scoreLead.toFixed(1)}`;
}

/**
 * Get player name with emoji
 */
export function getPlayerName(player: 'B' | 'W'): string {
  return player === 'B' ? 'Black ⚫' : 'White ⚪';
}

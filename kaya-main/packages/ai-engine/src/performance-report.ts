/**
 * Performance Report Generation
 *
 * Functions for computing game performance metrics from AI analysis data.
 *
 * For single-pass inference (no MCTS), move quality is evaluated using
 * move rank and relative probability (compared to top move).
 */

import type { AnalysisResult } from './types';
import {
  type MoveCategory,
  type GamePhase,
  type MoveStats,
  type MoveDistribution,
  type PhaseStats,
  type PlayerStats,
  type MistakeInfo,
  type TurningPoint,
  type GamePerformanceReport,
  type PerformanceReportOptions,
  type MoveClassificationThresholds,
  type PointsLostThresholds,
  DEFAULT_CLASSIFICATION_THRESHOLDS,
  DEFAULT_POINTS_LOST_THRESHOLDS,
  DEFAULT_PHASE_THRESHOLDS,
} from './performance-types';

/**
 * Classify a move based on rank and relative probability.
 * Uses the better of rank-based or probability-based classification.
 *
 * @param rank - Move rank (1 = best, 0 = not in suggestions)
 * @param relativeProb - Move probability / top move probability
 * @param thresholds - Classification thresholds
 */
export function classifyMoveByRankAndProb(
  rank: number,
  relativeProb: number,
  thresholds: MoveClassificationThresholds = DEFAULT_CLASSIFICATION_THRESHOLDS
): MoveCategory {
  // Rank 1 is always AI move
  if (rank === 1) return 'aiMove';

  // For other moves, use the BETTER of rank-based or probability-based classification
  // This ensures we don't penalize moves that are good alternatives but ranked lower

  // Determine category by rank (0 means not in suggestions)
  let rankCategory: MoveCategory;
  if (rank === 0) {
    rankCategory = 'blunder';
  } else if (rank <= thresholds.goodMaxRank) {
    rankCategory = 'good';
  } else if (rank <= thresholds.inaccuracyMaxRank) {
    rankCategory = 'inaccuracy';
  } else if (rank <= thresholds.mistakeMaxRank) {
    rankCategory = 'mistake';
  } else {
    rankCategory = 'blunder';
  }

  // Determine category by relative probability
  let probCategory: MoveCategory;
  if (relativeProb >= 1.0) {
    probCategory = 'aiMove'; // Same or better than top move (rare but possible with rounding)
  } else if (relativeProb >= thresholds.goodMinRelativeProb) {
    probCategory = 'good';
  } else if (relativeProb >= thresholds.inaccuracyMinRelativeProb) {
    probCategory = 'inaccuracy';
  } else if (relativeProb >= thresholds.mistakeMinRelativeProb) {
    probCategory = 'mistake';
  } else {
    probCategory = 'blunder';
  }

  // Return the better (less severe) category
  const categoryOrder: MoveCategory[] = ['aiMove', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const rankIndex = categoryOrder.indexOf(rankCategory);
  const probIndex = categoryOrder.indexOf(probCategory);

  return categoryOrder[Math.min(rankIndex, probIndex)];
}

/**
 * @deprecated Use classifyMoveByRankAndProb for single-pass inference.
 */
export function classifyMoveByPolicy(
  probability: number,
  thresholds = { aiMove: 0.5, good: 0.2, inaccuracy: 0.05, mistake: 0.01 }
): MoveCategory {
  if (probability >= thresholds.aiMove) return 'aiMove';
  if (probability >= thresholds.good) return 'good';
  if (probability >= thresholds.inaccuracy) return 'inaccuracy';
  if (probability >= thresholds.mistake) return 'mistake';
  return 'blunder';
}

/**
 * @deprecated Use classifyMoveByRankAndProb for single-pass inference.
 */
export function classifyMove(
  pointsLost: number,
  thresholds: PointsLostThresholds = DEFAULT_POINTS_LOST_THRESHOLDS
): MoveCategory {
  if (pointsLost <= thresholds.aiMove) return 'aiMove';
  if (pointsLost <= thresholds.good) return 'good';
  if (pointsLost <= thresholds.inaccuracy) return 'inaccuracy';
  if (pointsLost <= thresholds.mistake) return 'mistake';
  return 'blunder';
}

/**
 * Get game phase for a move number
 */
export function getGamePhase(moveNumber: number, boardSize: number = 19): GamePhase {
  const thresholds = DEFAULT_PHASE_THRESHOLDS[boardSize] ?? DEFAULT_PHASE_THRESHOLDS[19];

  if (moveNumber <= thresholds.openingEnd) return 'opening';
  if (moveNumber <= thresholds.middleGameEnd) return 'middleGame';
  return 'endGame';
}

/**
 * Calculate points lost for a move
 *
 * @param prevScoreLead Score lead before the move (Black's perspective)
 * @param currScoreLead Score lead after the move (Black's perspective)
 * @param player Who played the move
 * @returns Points lost (always >= 0)
 */
export function calculatePointsLost(
  prevScoreLead: number,
  currScoreLead: number,
  player: 'B' | 'W'
): number {
  if (player === 'B') {
    // Black wants score to increase (or stay same)
    return Math.max(0, prevScoreLead - currScoreLead);
  } else {
    // White wants score to decrease (or stay same)
    return Math.max(0, currScoreLead - prevScoreLead);
  }
}

/**
 * Calculate points gained for a move (opponent's mistake recovery)
 */
export function calculatePointsGained(
  prevScoreLead: number,
  currScoreLead: number,
  player: 'B' | 'W'
): number {
  if (player === 'B') {
    // Black gains when score increases
    return Math.max(0, currScoreLead - prevScoreLead);
  } else {
    // White gains when score decreases
    return Math.max(0, prevScoreLead - currScoreLead);
  }
}

/**
 * Calculate win rate from score lead using tanh approximation
 * This matches KataGo's internal calculation
 */
export function scoreLeadToWinRate(scoreLead: number): number {
  return 0.5 + Math.tanh(scoreLead / 20) / 2;
}

/**
 * Find where a move ranks in the AI suggestions
 *
 * @returns Rank (1 = top move, 2 = second, etc.), or 0 if not in suggestions
 */
export function findMoveRank(move: string, suggestions: Array<{ move: string }>): number {
  const index = suggestions.findIndex(s => s.move.toUpperCase() === move.toUpperCase());
  return index >= 0 ? index + 1 : 0;
}

/**
 * Find the probability of a move in the AI suggestions
 */
export function findMoveProbability(
  move: string,
  suggestions: Array<{ move: string; probability: number }>
): number {
  const suggestion = suggestions.find(s => s.move.toUpperCase() === move.toUpperCase());
  return suggestion?.probability ?? 0;
}

/**
 * Create an empty move distribution
 */
export function createEmptyDistribution(): MoveDistribution {
  return {
    aiMove: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
    total: 0,
  };
}

/**
 * Add a move category to a distribution
 */
export function addToDistribution(distribution: MoveDistribution, category: MoveCategory): void {
  distribution[category]++;
  distribution.total++;
}

/**
 * Calculate weighted accuracy from move stats
 */
export function calculateAccuracy(moves: MoveStats[]): number {
  if (moves.length === 0) return 0;

  let earnedWeight = 0;

  for (const move of moves) {
    switch (move.category) {
      case 'aiMove':
        earnedWeight += 1.0;
        break;
      case 'good':
        earnedWeight += 0.8;
        break;
      case 'inaccuracy':
        earnedWeight += 0.5;
        break;
      case 'mistake':
        earnedWeight += 0.2;
        break;
      case 'blunder':
        earnedWeight += 0.0;
        break;
    }
  }

  return (earnedWeight / moves.length) * 100;
}

/**
 * Input data for a single position in the game
 */
export interface PositionData {
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  move: string; // GTP coordinate of the move played
  analysisBeforeMove: AnalysisResult | null; // Analysis of position before move
  analysisAfterMove: AnalysisResult | null; // Analysis of position after move (optional, for score display)
}

/**
 * Generate move statistics from position data.
 * Uses rank and relative probability for classification (suitable for single-pass inference).
 */
export function generateMoveStats(
  position: PositionData,
  boardSize: number,
  classificationThresholds: MoveClassificationThresholds = DEFAULT_CLASSIFICATION_THRESHOLDS
): MoveStats | null {
  const { moveNumber, nodeId, player, move, analysisBeforeMove, analysisAfterMove } = position;

  // Need analysis before move to get policy
  if (!analysisBeforeMove) {
    return null;
  }

  // Get score leads (for display, not classification)
  const scoreLeadBefore = analysisBeforeMove.scoreLead;
  const scoreLeadAfter = analysisAfterMove?.scoreLead ?? scoreLeadBefore;

  // Calculate points lost/gained (for display only - not reliable for single-pass)
  const pointsLost = calculatePointsLost(scoreLeadBefore, scoreLeadAfter, player);
  const pointsGained = calculatePointsGained(scoreLeadBefore, scoreLeadAfter, player);

  // Win rates (for display)
  const winRateBefore = scoreLeadToWinRate(scoreLeadBefore);
  const winRateAfter = scoreLeadToWinRate(scoreLeadAfter);

  // Win rate swing from this player's perspective
  let winRateSwing: number;
  if (player === 'B') {
    winRateSwing = winRateAfter - winRateBefore;
  } else {
    winRateSwing = winRateBefore - winRateAfter;
  }

  // Policy metrics - these are what we use for classification
  const suggestions = analysisBeforeMove.moveSuggestions ?? [];
  const moveRank = findMoveRank(move, suggestions);
  const moveProbability = findMoveProbability(move, suggestions);
  const topMove = suggestions[0]?.move ?? '';
  const topMoveProbability = suggestions[0]?.probability ?? 0;
  const wasTopMove = moveRank === 1;

  // Calculate relative probability (move prob / top move prob)
  const relativeProb = topMoveProbability > 0 ? moveProbability / topMoveProbability : 0;

  // Classification using rank and relative probability
  const category = classifyMoveByRankAndProb(moveRank, relativeProb, classificationThresholds);
  const phase = getGamePhase(moveNumber, boardSize);

  return {
    moveNumber,
    nodeId,
    player,
    move,
    scoreLeadBefore,
    scoreLeadAfter,
    pointsLost,
    pointsGained,
    winRateBefore,
    winRateAfter,
    winRateSwing,
    moveRank,
    moveProbability,
    topMove,
    topMoveProbability,
    wasTopMove,
    category,
    phase,
  };
}

/**
 * Calculate phase statistics from moves
 */
export function calculatePhaseStats(
  moves: MoveStats[],
  phase: GamePhase,
  boardSize: number
): PhaseStats | null {
  const phaseMoves = moves.filter(m => m.phase === phase);

  if (phaseMoves.length === 0) return null;

  const moveNumbers = phaseMoves.map(m => m.moveNumber);
  const moveRange: [number, number] = [Math.min(...moveNumbers), Math.max(...moveNumbers)];

  const distribution = createEmptyDistribution();
  let totalPointsLost = 0;
  let totalPointsChange = 0;
  let topMoveCount = 0;
  let top5Count = 0;

  for (const move of phaseMoves) {
    addToDistribution(distribution, move.category);
    totalPointsLost += move.pointsLost;
    totalPointsChange += move.pointsGained - move.pointsLost;
    if (move.wasTopMove) topMoveCount++;
    if (move.moveRank >= 1 && move.moveRank <= 5) top5Count++;
  }

  return {
    phase,
    moveRange,
    moveCount: phaseMoves.length,
    accuracy: calculateAccuracy(phaseMoves),
    avgPointsPerMove: totalPointsChange / phaseMoves.length,
    meanLoss: totalPointsLost / phaseMoves.length,
    bestMovePercentage: phaseMoves.length > 0 ? (topMoveCount / phaseMoves.length) * 100 : 0,
    top5Percentage: phaseMoves.length > 0 ? (top5Count / phaseMoves.length) * 100 : 0,
    distribution,
  };
}

/**
 * Calculate player statistics from moves
 */
export function calculatePlayerStats(
  moves: MoveStats[],
  player: 'B' | 'W',
  playerName: string,
  boardSize: number
): PlayerStats {
  const playerMoves = moves.filter(m => m.player === player);

  const distribution = createEmptyDistribution();
  let totalPointsLost = 0;
  let totalPointsChange = 0;
  let topMoveCount = 0;
  let top5Count = 0;

  for (const move of playerMoves) {
    addToDistribution(distribution, move.category);
    totalPointsLost += move.pointsLost;
    totalPointsChange += move.pointsGained - move.pointsLost;

    if (move.wasTopMove) topMoveCount++;
    if (move.moveRank >= 1 && move.moveRank <= 5) top5Count++;
  }

  const totalMoves = playerMoves.length;

  return {
    player,
    playerName,
    totalMoves,
    accuracy: calculateAccuracy(playerMoves),
    bestMovePercentage: totalMoves > 0 ? (topMoveCount / totalMoves) * 100 : 0,
    top5Percentage: totalMoves > 0 ? (top5Count / totalMoves) * 100 : 0,
    avgPointsPerMove: totalMoves > 0 ? totalPointsChange / totalMoves : 0,
    meanLoss: totalMoves > 0 ? totalPointsLost / totalMoves : 0,
    totalPointsLost,
    distribution,
    byPhase: {
      opening: calculatePhaseStats(playerMoves, 'opening', boardSize),
      middleGame: calculatePhaseStats(playerMoves, 'middleGame', boardSize),
      endGame: calculatePhaseStats(playerMoves, 'endGame', boardSize),
    },
  };
}

/**
 * Find key mistakes in the game.
 * Sorts by category severity (blunders first), then by move rank (lower probability = worse).
 */
export function findKeyMistakes(moves: MoveStats[], maxCount: number = 10): MistakeInfo[] {
  // Category severity order (higher = worse)
  const categorySeverity: Record<MoveCategory, number> = {
    aiMove: 0,
    good: 1,
    inaccuracy: 2,
    mistake: 3,
    blunder: 4,
  };

  // Filter to only mistakes and blunders, sort by severity then by low probability
  const mistakes = moves
    .filter(m => m.category === 'mistake' || m.category === 'blunder')
    .sort((a, b) => {
      // First by category severity (blunders first)
      const severityDiff = categorySeverity[b.category] - categorySeverity[a.category];
      if (severityDiff !== 0) return severityDiff;
      // Then by lower probability (worse moves first)
      return a.moveProbability - b.moveProbability;
    })
    .slice(0, maxCount);

  return mistakes.map(m => ({
    moveNumber: m.moveNumber,
    nodeId: m.nodeId,
    player: m.player,
    playedMove: m.move,
    bestMove: m.topMove,
    moveRank: m.moveRank,
    moveProbability: m.moveProbability,
    topMoveProbability: m.topMoveProbability,
    category: m.category,
    pointsLost: m.pointsLost, // Deprecated, kept for compatibility
    winRateSwing: m.winRateSwing, // Deprecated, kept for compatibility
  }));
}

/**
 * Find turning points where advantage shifted significantly
 */
export function findTurningPoints(moves: MoveStats[], threshold: number = 5.0): TurningPoint[] {
  const turningPoints: TurningPoint[] = [];

  for (const move of moves) {
    const scoreSwing = Math.abs(move.scoreLeadAfter - move.scoreLeadBefore);

    if (scoreSwing >= threshold) {
      // Determine what happened
      let description: string;
      const wasLeadingBefore =
        (move.player === 'B' && move.scoreLeadBefore > 0) ||
        (move.player === 'W' && move.scoreLeadBefore < 0);
      const isLeadingAfter =
        (move.player === 'B' && move.scoreLeadAfter > 0) ||
        (move.player === 'W' && move.scoreLeadAfter < 0);

      if (!wasLeadingBefore && isLeadingAfter) {
        description = `${move.player === 'B' ? 'Black' : 'White'} takes the lead`;
      } else if (wasLeadingBefore && !isLeadingAfter) {
        description = `${move.player === 'B' ? 'Black' : 'White'} loses the lead`;
      } else if (move.pointsLost > 0) {
        description = `${move.player === 'B' ? 'Black' : 'White'} loses ${move.pointsLost.toFixed(1)} points`;
      } else {
        description = `${move.player === 'B' ? 'Black' : 'White'} gains ${move.pointsGained.toFixed(1)} points`;
      }

      turningPoints.push({
        moveNumber: move.moveNumber,
        nodeId: move.nodeId,
        player: move.player,
        description,
        scoreBefore: move.scoreLeadBefore,
        scoreAfter: move.scoreLeadAfter,
        scoreSwing,
      });
    }
  }

  // Sort by swing magnitude
  return turningPoints.sort((a, b) => b.scoreSwing - a.scoreSwing);
}

/**
 * Check if the game reached endgame phase
 */
export function checkReachedEndGame(totalMoves: number, boardSize: number): boolean {
  const thresholds = DEFAULT_PHASE_THRESHOLDS[boardSize] ?? DEFAULT_PHASE_THRESHOLDS[19];
  return totalMoves > thresholds.middleGameEnd;
}

/**
 * Game information for report generation
 */
export interface GameInfo {
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  komi: number;
  result: string;
}

/**
 * Generate a complete performance report.
 * Uses rank and relative probability for move classification (suitable for single-pass inference).
 */
export function generatePerformanceReport(
  positions: PositionData[],
  gameInfo: GameInfo,
  options: PerformanceReportOptions = {}
): GamePerformanceReport {
  const {
    classificationThresholds: customThresholds,
    maxKeyMistakes = 10,
    turningPointThreshold = 5.0,
  } = options;

  const classificationThresholds: MoveClassificationThresholds = {
    ...DEFAULT_CLASSIFICATION_THRESHOLDS,
    ...customThresholds,
  };

  const { blackPlayer, whitePlayer, boardSize, komi, result } = gameInfo;

  // Generate move stats for all positions
  const moves: MoveStats[] = [];
  let analyzedCount = 0;

  for (const position of positions) {
    const stats = generateMoveStats(position, boardSize, classificationThresholds);
    if (stats) {
      moves.push(stats);
      analyzedCount++;
    }
  }

  const totalMoves = positions.length;

  // Calculate player stats
  const black = calculatePlayerStats(moves, 'B', blackPlayer, boardSize);
  const white = calculatePlayerStats(moves, 'W', whitePlayer, boardSize);

  // Find key moments
  const keyMistakes = findKeyMistakes(moves, maxKeyMistakes);
  const turningPoints = findTurningPoints(moves, turningPointThreshold);

  return {
    generatedAt: new Date().toISOString(),
    blackPlayer,
    whitePlayer,
    boardSize,
    komi,
    result,
    totalMoves,
    analyzedMoves: analyzedCount,
    analysisComplete: analyzedCount === totalMoves,
    reachedEndGame: checkReachedEndGame(totalMoves, boardSize),
    black,
    white,
    keyMistakes,
    turningPoints,
    moves,
    classificationThresholds,
  };
}

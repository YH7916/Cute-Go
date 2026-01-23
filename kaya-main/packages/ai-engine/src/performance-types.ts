/**
 * Performance Report Types
 *
 * Types for analyzing game performance based on AI analysis data.
 *
 * For single-pass inference (no MCTS), we classify moves based on
 * move rank and relative probability (compared to top move).
 */

/**
 * Move classification categories
 */
export type MoveCategory = 'aiMove' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/**
 * Game phase based on move number
 */
export type GamePhase = 'opening' | 'middleGame' | 'endGame';

/**
 * Thresholds for classifying moves using rank and relative probability.
 *
 * Classification uses BOTH rank thresholds AND relative probability
 * (move probability / top move probability). A move qualifies for a
 * category if it meets EITHER the rank OR relative probability threshold.
 */
export interface MoveClassificationThresholds {
  // Rank thresholds (1 = best move)
  aiMoveMaxRank: number; // Rank <= this = AI move (default: 1)
  goodMaxRank: number; // Rank <= this = good (default: 3)
  inaccuracyMaxRank: number; // Rank <= this = inaccuracy (default: 10)
  mistakeMaxRank: number; // Rank <= this = mistake (default: 20)
  // Rank > mistakeMaxRank OR not in suggestions = blunder

  // Relative probability thresholds (move prob / top move prob)
  goodMinRelativeProb: number; // >= this relative prob = good (default: 0.50)
  inaccuracyMinRelativeProb: number; // >= this = inaccuracy (default: 0.10)
  mistakeMinRelativeProb: number; // >= this = mistake (default: 0.02)
  // < mistakeMinRelativeProb = blunder
}

/**
 * Default thresholds for move classification
 */
export const DEFAULT_CLASSIFICATION_THRESHOLDS: MoveClassificationThresholds = {
  aiMoveMaxRank: 1, // Only rank 1 = AI move
  goodMaxRank: 3, // Ranks 2-3 = good
  inaccuracyMaxRank: 10, // Ranks 4-10 = inaccuracy
  mistakeMaxRank: 20, // Ranks 11-20 = mistake

  goodMinRelativeProb: 0.5, // >= 50% of top move's prob = good
  inaccuracyMinRelativeProb: 0.1, // >= 10% of top = inaccuracy
  mistakeMinRelativeProb: 0.02, // >= 2% of top = mistake
};

/**
 * @deprecated Use MoveClassificationThresholds instead.
 */
export interface PolicyThresholds {
  aiMove: number;
  good: number;
  inaccuracy: number;
  mistake: number;
}

/**
 * @deprecated Use DEFAULT_CLASSIFICATION_THRESHOLDS instead.
 */
export const DEFAULT_POLICY_THRESHOLDS: PolicyThresholds = {
  aiMove: 0.5,
  good: 0.2,
  inaccuracy: 0.05,
  mistake: 0.01,
};

/**
 * @deprecated Use MoveClassificationThresholds instead.
 */
export interface PointsLostThresholds {
  aiMove: number;
  good: number;
  inaccuracy: number;
  mistake: number;
}

/**
 * @deprecated Use DEFAULT_CLASSIFICATION_THRESHOLDS instead.
 */
export const DEFAULT_POINTS_LOST_THRESHOLDS: PointsLostThresholds = {
  aiMove: 0.2,
  good: 1.0,
  inaccuracy: 2.0,
  mistake: 5.0,
};

/**
 * Phase thresholds by board size (move numbers)
 */
export interface PhaseThresholds {
  openingEnd: number;
  middleGameEnd: number;
}

/**
 * Default phase thresholds by board size
 */
export const DEFAULT_PHASE_THRESHOLDS: Record<number, PhaseThresholds> = {
  19: { openingEnd: 50, middleGameEnd: 150 },
  13: { openingEnd: 30, middleGameEnd: 80 },
  9: { openingEnd: 15, middleGameEnd: 40 },
};

/**
 * Statistics for a single move
 */
export interface MoveStats {
  // Identification
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  move: string; // GTP coordinate (e.g., "Q16")

  // Score metrics
  scoreLeadBefore: number; // Position before this move (Black's perspective)
  scoreLeadAfter: number; // Position after this move (Black's perspective)
  pointsLost: number; // Max(0, loss for this player)
  pointsGained: number; // Max(0, gain for this player)

  // Win rate metrics
  winRateBefore: number; // Black's win rate before
  winRateAfter: number; // Black's win rate after
  winRateSwing: number; // Change from this player's perspective

  // Policy metrics
  moveRank: number; // 1 = AI's top choice, 0 = not in top moves
  moveProbability: number; // Policy probability of played move
  topMove: string; // AI's recommended move
  topMoveProbability: number;
  wasTopMove: boolean; // Did player play AI's #1 choice?

  // Classification
  category: MoveCategory;
  phase: GamePhase;
}

/**
 * Move category distribution counts
 */
export interface MoveDistribution {
  aiMove: number;
  good: number;
  inaccuracy: number;
  mistake: number;
  blunder: number;
  total: number;
}

/**
 * Statistics for a game phase
 */
export interface PhaseStats {
  phase: GamePhase;
  moveRange: [number, number]; // [start, end] move numbers (inclusive)
  moveCount: number;
  accuracy: number;
  avgPointsPerMove: number;
  meanLoss: number;
  bestMovePercentage: number; // % of AI top moves in this phase
  top5Percentage: number; // % of moves in top 5 suggestions
  distribution: MoveDistribution;
}

/**
 * Per-player aggregate statistics
 */
export interface PlayerStats {
  player: 'B' | 'W';
  playerName: string;
  totalMoves: number;

  // Accuracy metrics
  accuracy: number; // 0-100%
  bestMovePercentage: number; // % of AI top moves
  top5Percentage: number; // % in top 5

  // Points metrics
  avgPointsPerMove: number; // Can be + or -
  meanLoss: number; // Average of pointsLost (always >= 0)
  totalPointsLost: number;

  // Move distribution
  distribution: MoveDistribution;

  // Phase breakdown
  byPhase: {
    opening: PhaseStats | null;
    middleGame: PhaseStats | null;
    endGame: PhaseStats | null;
  };
}

/**
 * Information about a significant mistake
 */
export interface MistakeInfo {
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  playedMove: string;
  bestMove: string;
  /** Move rank in policy (1 = best, 0 = not in suggestions) */
  moveRank: number;
  /** Policy probability of the played move */
  moveProbability: number;
  /** Policy probability of the best move */
  topMoveProbability: number;
  category: MoveCategory;
  /** @deprecated Use moveRank/moveProbability instead */
  pointsLost: number;
  /** @deprecated Not reliable for single-pass inference */
  winRateSwing: number;
}

/**
 * Information about a turning point in the game
 */
export interface TurningPoint {
  moveNumber: number;
  nodeId: string | number;
  player: 'B' | 'W';
  description: string; // e.g., "Advantage shifted to Black"
  scoreBefore: number;
  scoreAfter: number;
  scoreSwing: number;
}

/**
 * Complete game performance report
 */
export interface GamePerformanceReport {
  // Metadata
  generatedAt: string; // ISO timestamp

  // Game info
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  komi: number;
  result: string; // e.g., "B+R", "W+2.5"
  totalMoves: number;
  analyzedMoves: number;
  analysisComplete: boolean;

  // Game end info
  reachedEndGame: boolean;

  // Per-player stats
  black: PlayerStats;
  white: PlayerStats;

  // Key moments (sorted by impact)
  keyMistakes: MistakeInfo[]; // Top N biggest mistakes
  turningPoints: TurningPoint[]; // Where advantage shifted significantly

  // Full move breakdown
  moves: MoveStats[];

  // Configuration used
  classificationThresholds: MoveClassificationThresholds;
}

/**
 * Options for generating a performance report
 */
export interface PerformanceReportOptions {
  /** Custom thresholds for move classification (rank + relative probability) */
  classificationThresholds?: Partial<MoveClassificationThresholds>;
  /** Maximum number of key mistakes to include */
  maxKeyMistakes?: number;
  /** Minimum score swing to be considered a turning point */
  turningPointThreshold?: number;
}

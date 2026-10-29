import { calculateModelScore, calculateScore } from '../../core/go/scoring';
import { isSamePosition, type PositionSnapshot } from './positionSnapshot';

export interface ScoringRequest extends PositionSnapshot {
  komi: number;
  captures: { black: number; white: number };
}

export function takeScoringRequest(
  pending: { current: ScoringRequest | null },
  current: PositionSnapshot,
): ScoringRequest | null {
  const request = pending.current;
  pending.current = null;
  return request && isSamePosition(request, current) ? request : null;
}

export function evaluateScoring(request: ScoringRequest, ownership?: Float32Array | null) {
  const score = ownership
    ? calculateModelScore(request.board, ownership, request.komi, request.captures)
    : calculateScore(request.board, undefined, request.komi, request.captures);
  return { score, lead: score.black - score.white };
}

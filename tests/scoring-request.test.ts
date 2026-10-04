import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoard } from '../core/board';
import { calculateScore } from '../core/go/scoring';
import { evaluateScoring, takeScoringRequest, type ScoringRequest } from '../domains/game/scoringResult';

function request(): ScoringRequest {
  return { board: createBoard(9), history: [], player: 'black', komi: 5.5, captures: { black: 3, white: 1 } };
}

test('endgame analysis cannot finish a reset game or a changed move history', () => {
  const pending = request();
  for (const current of [
    { ...pending, board: createBoard(9) },
    { ...pending, history: [] },
    { ...pending, player: 'white' as const },
  ]) {
    const ref = { current: pending as ScoringRequest | null };
    assert.equal(takeScoringRequest(ref, current), null);
    assert.equal(ref.current, null);
  }
});

test('endgame analysis consumes the original scoring snapshot exactly once', () => {
  const pending = request();
  pending.board[2][2] = { color: 'black', x: 2, y: 2, id: 'b' };
  pending.board[6][6] = { color: 'white', x: 6, y: 6, id: 'w' };
  const ref = { current: pending as ScoringRequest | null };
  const accepted = takeScoringRequest(ref, pending);
  assert.equal(accepted, pending);
  assert.equal(takeScoringRequest(ref, pending), null);
  assert.deepEqual(evaluateScoring(accepted!).score, calculateScore(pending.board, undefined, 5.5, { black: 3, white: 1 }));
});

test('cancelled endgame analysis never scores and ownership cleanup leaves the input untouched', () => {
  const pending = request();
  assert.equal(takeScoringRequest({ current: null }, pending), null);
  pending.board[4][4] = { color: 'black', x: 4, y: 4, id: 'b' };
  const before = structuredClone(pending.board);
  const result = evaluateScoring(pending, new Float32Array(81).fill(-1));
  assert.deepEqual(pending.board, before);
  assert.notEqual(result.board, pending.board);
  assert.ok(Number.isFinite(result.lead));
});

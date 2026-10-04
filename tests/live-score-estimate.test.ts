import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoard } from '../core/board';
import { estimateLiveLead } from '../core/go/liveEstimate';
import { calculateModelScore, cleanBoardWithTerritory } from '../core/go/scoring';
import { normalizeOwnership } from '../core/inference/outputs';

test('settled territory and dead prisoners agree with existing final scoring without counting living stones', () => {
  const board = createBoard(3);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    board[y][x] = { id: `${x},${y}`, x, y, color: x === 1 && y === 1 ? 'white' : 'black' };
  }
  const before = structuredClone(board);
  const ownership = new Float32Array(9).fill(1);
  const captures = { black: 2, white: 1 };
  const score = calculateModelScore(board, ownership, 3.5, captures);
  assert.equal(estimateLiveLead(board, ownership, 3.5, captures), score.black - score.white);
  assert.equal(estimateLiveLead(board, ownership, 3.5, captures), -0.5);
  assert.deepEqual(board, before);
});

test('live estimates are antisymmetric under a full color swap and subtract komi exactly once', () => {
  const board = createBoard(3);
  board[0][0] = { id: 'black', x: 0, y: 0, color: 'black' };
  board[2][2] = { id: 'white', x: 2, y: 2, color: 'white' };
  const ownership = new Float32Array([1, 0.5, 0.5, 0.5, 0, -0.25, -0.25, -0.25, -1]);
  const swapped = board.map(row => row.map(stone => stone && ({
    ...stone, color: stone.color === 'black' ? 'white' as const : 'black' as const,
  })));
  const original = estimateLiveLead(board, ownership, 0, { black: 4, white: 1 });
  const mirrored = estimateLiveLead(swapped, ownership.map(value => -value), 0, { black: 1, white: 4 });
  assert.equal(original, 3.75);
  assert.equal(mirrored, -original!);
  assert.equal(estimateLiveLead(board, ownership, 6.5, { black: 4, white: 1 }), original! - 6.5);
});

test('whole-chain death decisions use normalized ownership rather than raw logits', () => {
  const board = createBoard(3);
  board[0][0] = { id: 'b0', x: 0, y: 0, color: 'black' };
  board[0][1] = { id: 'b1', x: 1, y: 0, color: 'black' };
  const raw = new Float32Array(9);
  raw[0] = -2;
  raw[1] = -1; // tanh(-1) does not cross the normalized -0.9 death threshold.
  const uncertain = normalizeOwnership(raw, 1)!;
  assert.deepEqual(cleanBoardWithTerritory(board, uncertain), board);
  assert.equal(estimateLiveLead(board, uncertain, 0), 0);
  raw[1] = -2;
  const confident = normalizeOwnership(raw, 1)!;
  const cleaned = cleanBoardWithTerritory(board, confident);
  assert.equal(cleaned[0][0], null);
  assert.equal(cleaned[0][1], null);
  assert.equal(estimateLiveLead(board, confident, 0), 2 * Math.fround(Math.tanh(-2)) - 2);
  assert.equal(board[0][0]?.color, 'black');
});

test('missing or malformed ownership produces no numerical estimate', () => {
  const board = createBoard(3);
  for (const invalid of [null, new Float32Array(8), new Float32Array(9).fill(NaN),
    new Float32Array(9).fill(Infinity), new Float32Array(9).fill(1.01)]) {
    assert.equal(estimateLiveLead(board, invalid), undefined);
  }
});

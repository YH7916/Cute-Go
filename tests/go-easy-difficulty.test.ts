import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoard, getBoardHash } from '../core/board';
import { getBeginnerAIMove } from '../core/go/ai';
import { attemptMove, isSimpleEye } from '../core/go/rules';
import { selectMoveByDifficulty } from '../core/inference/selection';
import type { BoardState, Player, Point } from '../types';

type PolicyPoint = Point & { prior: number };

function put(board: BoardState, color: Player, x: number, y: number) {
  board[y][x] = { x, y, color, id: `${color}-${x}-${y}` };
}

function withRandom<T>(random: () => number, run: () => T) {
  const original = Math.random;
  Math.random = random;
  try { return run(); } finally { Math.random = original; }
}

function ranked(policy: ReadonlyArray<PolicyPoint>) {
  return policy.map(point => ({ ...point, u: 0, winrate: 50, scoreMean: 0, scoreStdev: 0, lead: 0, vists: 0 }));
}

function localBoard() {
  const board = createBoard(9);
  put(board, 'black', 2, 2);
  return board;
}

// Captured from the pre-change beginner implementation with all score rolls at
// 0.5: the final draw is call 36 and these are the three distinct legal choices.
const localPool = [{ x: 2, y: 1 }, { x: 1, y: 2 }, { x: 3, y: 2 }];
function drawLocal(roll: number, run: () => Point | null | undefined) {
  let calls = 0;
  return withRandom(() => ++calls === 36 ? roll : 0.5, run);
}

for (const size of [9, 19]) {
  for (const color of ['black', 'white'] as const) {
    for (const seed of [1, 42]) {
      test(`Fun retains its pre-change seeded move and RNG consumption: ${size}/${color}/${seed}`, () => {
        const board = createBoard(size);
        const center = Math.floor(size / 2);
        put(board, 'black', center, center);
        put(board, 'white', center + 1, center + 1);
        put(board, 'black', center - 1, center);
        let state = seed;
        let calls = 0;
        const selected = withRandom(() => {
          calls++;
          state = (Math.imul(1664525, state) + 1013904223) >>> 0;
          return state / 4294967296;
        }, () => getBeginnerAIMove(board, color, null));
        const offset = seed === 1
          ? { x: color === 'black' ? 2 : 4, y: 2 }
          : { x: color === 'black' ? -1 : 3, y: -1 };
        assert.deepEqual(selected, { x: center + offset.x, y: center + offset.y });
        assert.equal(calls, seed === 1 ? 89 : 86);
      });
    }
  }
}

test('Easy cannot jump from the beginner local pool to a distant high-prior model move', () => {
  const board = localBoard();
  const remotePolicy = ranked([{ x: 8, y: 8, prior: 1 }]);
  const move = drawLocal(0.5, () => selectMoveByDifficulty(remotePolicy, board, 'black', null, 'Easy'));
  assert.deepEqual(move, localPool[1]);
});

test('Easy preserves an empty-board center opening even when the model prefers a corner or pass', () => {
  for (const size of [9, 13, 19]) for (const color of ['black', 'white'] as const) {
    const policy = ranked([{ x: 0, y: 0, prior: 1 }, { x: -1, y: -1, prior: 0.5 }]);
    const move = withRandom(() => 0.5, () => selectMoveByDifficulty(policy, createBoard(size), color, null, 'Easy'));
    assert.deepEqual(move, { x: Math.floor(size / 2), y: Math.floor(size / 2) });
  }
});

test('Easy passes on a full board instead of returning an occupied center point', () => {
  const board = createBoard(9);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) put(board, 'black', x, y);
  const before = structuredClone(board);
  assert.equal(selectMoveByDifficulty([], board, 'white', null, 'Easy'), null);
  assert.deepEqual(board, before);
});

test('model guidance prefers one local choice without excluding the other two', () => {
  const board = localBoard();
  const policy = [{ ...localPool[2], prior: 1e200 }, { x: 8, y: 8, prior: Number.MAX_VALUE }];
  // The local weights are 1, 1, 3. The globally strongest point is outside
  // the permitted local pool and must not affect its normalized probabilities.
  for (const [roll, expected] of [[0.1, 0], [0.3, 1], [0.5, 2], [0.9, 2]] as const) {
    assert.deepEqual(drawLocal(roll, () => getBeginnerAIMove(board, 'black', null, policy)), localPool[expected]);
    assert.deepEqual(drawLocal(roll, () => selectMoveByDifficulty(ranked(policy), board, 'black', null, 'Easy')), localPool[expected]);
  }
});

test('bounded prior weighting is scale invariant and does not overflow for finite extreme priors', () => {
  const board = localBoard();
  for (const scale of [1, 1e200, Number.MAX_VALUE / 4]) {
    const policy = localPool.map((point, i) => ({ ...point, prior: [1, 2, 4][i] * scale }));
    // Independent weight calculation: 1.5, 2, 3, cumulative 1.5 / 3.5 / 6.5.
    for (const [roll, expected] of [[0.22, 0], [0.25, 1], [0.6, 2]] as const) {
      assert.deepEqual(drawLocal(roll, () => getBeginnerAIMove(board, 'black', null, policy)), localPool[expected]);
    }
  }
});

test('missing, zero, negative and non-finite local priors fall back to the original uniform local draw', () => {
  const board = localBoard();
  const invalid = localPool.map((point, i) => ({ ...point, prior: [NaN, Infinity, -1][i] }));
  const zero = localPool.map(point => ({ ...point, prior: 0 }));
  for (const policy of [[], invalid, zero]) for (const [roll, expected] of [[0.1, 0], [0.5, 1], [0.9, 2]] as const) {
    assert.deepEqual(drawLocal(roll, () => getBeginnerAIMove(board, 'black', null, policy)), localPool[expected]);
    assert.deepEqual(drawLocal(roll, () => selectMoveByDifficulty(ranked(policy), board, 'black', null, 'Easy')), localPool[expected]);
  }
});

function freezeBoard(board: BoardState) {
  for (const row of board) {
    for (const stone of row) if (stone) Object.freeze(stone);
    Object.freeze(row);
  }
  Object.freeze(board);
}

for (const color of ['black', 'white'] as const) {
  test(`Easy rejects occupied, suicide, simple-eye and ko points and preserves its input (${color})`, () => {
    const opponent = color === 'black' ? 'white' : 'black';
    const occupied = createBoard(9);
    put(occupied, color, 1, 1);
    const suicide = createBoard(9);
    const eye = createBoard(9);
    for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) {
      put(suicide, opponent, x, y);
      put(eye, color, x, y);
    }
    for (const [x, y] of [[0, 0], [2, 0], [0, 2], [2, 2]]) put(eye, color, x, y);
    assert.equal(isSimpleEye(eye, 1, 1, color), true);
    const predecessor = createBoard(9);
    for (const [x, y] of [[0, 1], [1, 0], [1, 2]]) put(predecessor, opponent, x, y);
    for (const [x, y] of [[1, 1], [2, 0], [3, 1], [2, 2]]) put(predecessor, color, x, y);
    const capture = attemptMove(predecessor, 2, 1, opponent);
    assert.ok(capture);
    const fixtures = [
      { board: occupied, hash: null }, { board: suicide, hash: null },
      { board: eye, hash: null }, { board: capture.newBoard, hash: getBoardHash(predecessor) },
    ];
    for (const { board, hash } of fixtures) {
      const before = structuredClone(board);
      freezeBoard(board);
      const policy = Object.freeze([{ x: 1, y: 1, prior: 1 }, { x: -1, y: -1, prior: 0.5 }, { x: 8, y: 8, prior: 0.001 }]);
      const policyBefore = structuredClone(policy);
      for (const guided of [false, true]) {
        const move = withRandom(() => 0.5, () => guided
          ? selectMoveByDifficulty(ranked(policy), board, color, hash, 'Easy')
          : getBeginnerAIMove(board, color, hash, policy));
        assert.ok(move);
        assert.notDeepEqual(move, { x: 1, y: 1 });
        assert.ok(attemptMove(board, move.x, move.y, color, 'Go', hash));
        assert.equal(isSimpleEye(board, move.x, move.y, color), false);
      }
      assert.deepEqual(board, before);
      assert.deepEqual(policy, policyBefore);
    }
  });
}

test('Medium and Hard keep their global policy and pass behavior', () => {
  const board = localBoard();
  const policy = ranked([{ x: -1, y: -1, prior: 1 }, { x: 8, y: 8, prior: 0.1 }]);
  assert.deepEqual(withRandom(() => 0, () => selectMoveByDifficulty(policy, board, 'black', null, 'Medium')), { x: 8, y: 8 });
  assert.equal(withRandom(() => 0, () => selectMoveByDifficulty(policy, board, 'black', null, 'Hard')), null);
});

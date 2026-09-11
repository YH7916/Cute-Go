import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoard, getGroup } from '../core/board/index';
import { calculateScore, calculateModelScore, cleanBoardWithTerritory } from '../core/go/scoring';
import { getDefaultKomi } from '../core/go/config';
import { generateSGF, parseSGF } from '../core/go/sgf';
import { MicroBoard } from '../utils/micro-board';
import { canPass, extractPolicyMoves } from '../core/inference/policy';
import { selectMoveByDifficulty } from '../core/inference/selection';
import { runOwnershipSearch } from '../core/inference/search';

test('komi is consistent across board sizes, scoring and exported records', () => {
  for (const size of [9, 13, 19]) {
    const komi = size === 9 ? 3.5 : 7.5;
    assert.equal(getDefaultKomi(size), komi);
    assert.deepEqual(calculateScore(createBoard(size)), { black: 0, white: komi });
    assert.equal(parseSGF(generateSGF([], size))?.komi, komi);
    assert.match(generateSGF([], size), /RU\[CuteGo Territory\]/);
  }
});

test('both rules engines count distinct liberties as integers, equally for both colors', () => {
  for (const color of ['black', 'white'] as const) {
    const board = createBoard(9);
    const micro = new MicroBoard(9);
    for (const [x, y] of [[3, 3], [4, 3], [3, 4]]) {
      board[y][x] = { id: `${x},${y}`, x, y, color };
      micro.set(x, y, color === 'black' ? 1 : -1);
    }
    assert.equal(getGroup(board, { x: 3, y: 3 })?.liberties, 7);
    assert.equal(micro.getLiberties(3, 3), 7);
  }
});

test('territory counts empty points and prisoners, never living stones', () => {
  const board = createBoard(3);
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
    if (x !== 1 || y !== 1) board[y][x] = { id: `${x},${y}`, x, y, color: 'black' };
  }
  assert.deepEqual(calculateScore(board, null, 3.5, { black: 2, white: 1 }), { black: 3, white: 4.5 });
  board[1][1] = { id: "1,1", x: 1, y: 1, color: 'white' };
  const ownership = new Float32Array(9).fill(1);
  assert.deepEqual(calculateModelScore(board, ownership, 3.5, { black: 2, white: 1 }), { black: 4, white: 4.5 });
  assert.equal(board[1][1]?.color, 'white', 'scoring must not mutate the original board');
});

test('shared empty regions are neutral even when model predicts ownership', () => {
  const board = createBoard(3);
  board[0][0] = { id: "0,0", x: 0, y: 0, color: 'black' };
  board[2][2] = { id: "2,2", x: 2, y: 2, color: 'white' };
  const ownership = new Float32Array(9).fill(0.8);
  assert.deepEqual(calculateModelScore(board, ownership, 0), { black: 0, white: 0 });
});

test('dead-stone prediction cannot remove only part of a connected chain', () => {
  const board = createBoard(3);
  board[0][0] = { id: "0,0", x: 0, y: 0, color: 'black' };
  board[0][1] = { id: "1,0", x: 1, y: 0, color: 'black' };
  const ownership = new Float32Array(9);
  ownership[0] = -1;
  assert.deepEqual(cleanBoardWithTerritory(board, ownership), board);
  assert.deepEqual(cleanBoardWithTerritory(board, new Float32Array(1)), board);
});

test('pass logit has finite sampling weight and never hides legal alternatives', () => {
  const policy = new Float32Array(82).fill(-20);
  policy[81] = 10;
  const moves = extractPolicyMoves(policy, 9, new MicroBoard(9), 1, 2.1);
  assert.equal(moves.length, 82);
  assert.equal(moves[0].x, -1);
  assert.ok(moves.every(m => Number.isFinite(m.weight)));
  assert.equal(canPass(9, 4, false), false);
  assert.equal(canPass(9, 4, true), true);
  assert.equal(canPass(9, 60, false), true);
});

test('easy sampling can select weaker candidates instead of always taking argmax', () => {
  const policy = Float32Array.from({ length: 82 }, (_, i) => -i * 0.01);
  const moves = extractPolicyMoves(policy, 9, new MicroBoard(9), 1, 2.1).filter(m => m.x >= 0);
  const originalRandom = Math.random;
  try {
    Math.random = () => 0.5;
    const selected = selectMoveByDifficulty(moves, createBoard(9), 'black', null, 'Easy');
    assert.ok(selected);
    assert.notDeepEqual(selected, { x: moves[0].x, y: moves[0].y });
  } finally {
    Math.random = originalRandom;
  }
});

test('hard search spends its visit budget and backs up values from the opponent perspective', async () => {
  let calls = 0;
  const engine = {
    async analyze(board: MicroBoard, color: 1 | 0 | -1) {
      calls++;
      const policy = new Float32Array(82).fill(-100);
      policy[0] = 1;
      policy[1] = 0.9;
      const rootWinning = board.get(1, 0) === 1;
      return {
        rootInfo: { winrate: color === 1 ? (rootWinning ? 99 : 1) : (rootWinning ? 1 : 99), lead: 0, scoreStdev: 0, ownership: null },
        moves: extractPolicyMoves(policy, 9, board, color, 0)
      };
    }
  };
  const result = await runOwnershipSearch(engine, new MicroBoard(9), 1, [], 9, 3.5, 'Hard', 0, 25);
  assert.equal(calls, 25);
  assert.equal(result.visits, 25);
  assert.deepEqual(result.move, { x: 1, y: 0 });
});

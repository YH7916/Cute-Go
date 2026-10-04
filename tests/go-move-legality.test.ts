import assert from 'node:assert/strict';
import test from 'node:test';
import { createBoard, getBoardHash, getGroup } from '../core/board';
import * as rules from '../core/go/rules';
import type { BoardState, Player } from '../types';

function put(board: BoardState, color: Player, x: number, y: number) {
  board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
}

function freezeBoard(board: BoardState) {
  for (const row of board) {
    for (const stone of row) if (stone) Object.freeze(stone);
    Object.freeze(row);
  }
  Object.freeze(board);
  return board;
}

test('move inspection gives precise occupied and invalid-coordinate reasons without mutating the board', () => {
  const board = createBoard(5);
  put(board, 'white', 1, 1);
  const original = structuredClone(board);
  freezeBoard(board);
  assert.deepEqual(rules.inspectMove(board, 1, 1, 'black'), { legal: false, reason: 'occupied' });
  for (const [x, y] of [[-1, 0], [0, -1], [5, 0], [0, 5], [1.5, 1], [1, 1.5], [NaN, 0], [0, Infinity]]) {
    assert.deepEqual(rules.inspectMove(board, x, y, 'black'), { legal: false, reason: 'out-of-bounds' });
    assert.equal(rules.attemptMove(board, x, y, 'black'), null);
  }
  assert.deepEqual(rules.inspectMove([], 0, 0, 'black'), { legal: false, reason: 'out-of-bounds' });
  assert.deepEqual(board, original);
});

for (const color of ['black', 'white'] as const) {
  test(`${color}: suicide uses the resulting connected group's liberties`, () => {
    const board = createBoard(5);
    const opponent = color === 'black' ? 'white' : 'black';
    for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) put(board, opponent, x, y);
    const original = structuredClone(board);
    freezeBoard(board);
    assert.deepEqual(rules.inspectMove(board, 1, 1, color), { legal: false, reason: 'suicide' });
    assert.equal(rules.attemptMove(board, 1, 1, color), null);
    assert.deepEqual(board, original);
  });

  test(`${color}: removing captured stones before checking suicide makes a surrounded placement legal`, () => {
    const board = createBoard(5);
    const opponent = color === 'black' ? 'white' : 'black';
    for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(board, color, x, y);
    for (const [x, y] of [[1, 1], [0, 2], [2, 2], [1, 3]]) put(board, opponent, x, y);
    const original = structuredClone(board);
    freezeBoard(board);
    const inspected = rules.inspectMove(board, 1, 2, color);
    assert.equal(inspected.legal, true);
    if (!inspected.legal) throw new Error('capture must create a liberty');
    assert.equal(inspected.result.captured, 1);
    assert.equal(inspected.result.newBoard[1][1], null);
    assert.equal(inspected.result.newBoard[2][1]?.color, color);
    assert.equal(getGroup(inspected.result.newBoard, { x: 1, y: 2 })?.liberties, 1);
    assert.deepEqual(board, original);
    const gomoku = rules.inspectMove(board, 1, 2, color, 'Gomoku');
    if (!gomoku.legal) throw new Error('same empty point must be playable in Gomoku');
    assert.equal(gomoku.result.captured, 0);
    assert.equal(gomoku.result.newBoard[1][1]?.color, opponent, 'Gomoku never removes surrounded enemy stones');
  });
}

test('a stone with no direct empty neighbors may use the liberties of its connected friendly group', () => {
  const board = createBoard(5);
  for (const [x, y] of [[1, 0], [1, 1]]) put(board, 'black', x, y);
  for (const [x, y] of [[0, 1], [2, 1], [0, 2], [2, 2], [1, 3]]) put(board, 'white', x, y);
  const original = structuredClone(board);
  freezeBoard(board);
  const inspection = rules.inspectMove(board, 1, 2, 'black');
  if (!inspection.legal) throw new Error('connected stones share their group liberties');
  assert.equal(inspection.result.captured, 0);
  assert.equal(getGroup(inspection.result.newBoard, { x: 1, y: 2 })?.liberties, 2);
  assert.deepEqual(board, original);
});

test('simple ko is rejected only against the supplied predecessor and never mutates either position', () => {
  const board = createBoard(5);
  for (const [x, y] of [[0, 1], [1, 0], [1, 2]]) put(board, 'black', x, y);
  for (const [x, y] of [[1, 1], [2, 0], [3, 1], [2, 2]]) put(board, 'white', x, y);
  const original = structuredClone(board);
  freezeBoard(board);
  const capture = rules.inspectMove(board, 2, 1, 'black');
  assert.equal(capture.legal, true);
  if (!capture.legal) throw new Error('ko capture fixture must be legal');
  const capturedPosition = structuredClone(capture.result.newBoard);
  freezeBoard(capture.result.newBoard);
  const predecessor = getBoardHash(board);
  assert.deepEqual(rules.inspectMove(capture.result.newBoard, 1, 1, 'white', 'Go', predecessor), { legal: false, reason: 'ko' });
  assert.equal(rules.attemptMove(capture.result.newBoard, 1, 1, 'white', 'Go', predecessor), null);
  const withoutKo = rules.inspectMove(capture.result.newBoard, 1, 1, 'white');
  assert.equal(withoutKo.legal, true);
  if (!withoutKo.legal) throw new Error('recapture without its predecessor must be legal');
  assert.equal(getBoardHash(withoutKo.result.newBoard), predecessor);
  assert.equal(rules.inspectMove(capture.result.newBoard, 1, 1, 'white', 'Go', getBoardHash(createBoard(5))).legal, true);
  assert.equal(rules.inspectMove(capture.result.newBoard, 4, 4, 'white', 'Go', predecessor).legal, true, 'a different move is not ko');
  assert.deepEqual(board, original);
  assert.deepEqual(capture.result.newBoard, capturedPosition);
});

test('attemptMove preserves its original result shape and Gomoku bypasses Go capture, suicide and ko', t => {
  t.mock.method(Date, 'now', () => 123456);
  const board = createBoard(5);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) put(board, 'white', x, y);
  const original = structuredClone(board);
  const open = rules.inspectMove(board, 4, 4, 'black');
  assert.equal(open.legal, true);
  if (!open.legal) throw new Error('open point must be legal');
  assert.deepEqual(rules.attemptMove(board, 4, 4, 'black'), open.result);
  assert.deepEqual(Object.keys(open.result).sort(), ['captured', 'newBoard']);
  const gomoku = rules.inspectMove(board, 1, 1, 'black', 'Gomoku');
  assert.equal(gomoku.legal, true);
  if (!gomoku.legal) throw new Error('Gomoku does not use suicide');
  assert.equal(gomoku.result.captured, 0);
  assert.equal(gomoku.result.newBoard[1][0]?.color, 'white');
  assert.equal(gomoku.result.newBoard[1][2]?.color, 'white');
  const sameBoardHash = getBoardHash(gomoku.result.newBoard);
  assert.deepEqual(rules.attemptMove(board, 1, 1, 'black', 'Gomoku', sameBoardHash), gomoku.result);
  assert.deepEqual(rules.inspectMove(board, 0, 1, 'black', 'Gomoku'), { legal: false, reason: 'occupied' });
  assert.deepEqual(board, original);
});

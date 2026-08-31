import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoard } from '../core/board/index.ts';
import { attemptMove } from '../core/go/rules.ts';
import { generateSGF, parseSGF } from '../core/go/sgf.ts';
import { replayHistoryForInference } from '../core/inference/history.ts';
import { parseNativeMatchMessage } from '../services/platform/nativeMatchMessages.ts';
import type { HistoryItem } from '../types.ts';

test('attemptMove rejects invalid coordinates without throwing', () => {
  const board = createBoard(9);

  assert.equal(attemptMove(board, -1, 0, 'black'), null);
  assert.equal(attemptMove(board, 0, -1, 'black'), null);
  assert.equal(attemptMove(board, 9, 0, 'black'), null);
  assert.equal(attemptMove(board, 0, 9, 'black'), null);
  assert.equal(attemptMove(board, 1.5, 1, 'black'), null);
});

test('SGF history stores pre-action snapshots and preserves moves and passes', () => {
  const parsed = parseSGF('(;GM[1]FF[4]SZ[9];B[aa];W[];B[bb])');
  assert.ok(parsed);
  assert.equal(parsed.history.length, 3);

  const [firstMove, pass, lastMove] = parsed.history;
  assert.equal(firstMove.board[0][0], null);
  assert.equal(firstMove.currentPlayer, 'black');
  assert.equal(firstMove.lastMove, null);
  assert.deepEqual(firstMove.move, { x: 0, y: 0 });

  assert.equal(pass.board[0][0]?.color, 'black');
  assert.equal(pass.currentPlayer, 'white');
  assert.deepEqual(pass.lastMove, { x: 0, y: 0 });
  assert.equal(pass.move, null);

  assert.equal(lastMove.board[1][1], null);
  assert.equal(lastMove.currentPlayer, 'black');
  assert.equal(lastMove.lastMove, null);
  assert.equal(lastMove.consecutivePasses, 1);
  assert.deepEqual(lastMove.move, { x: 1, y: 1 });

  assert.equal(parsed.board[1][1]?.color, 'black');
  assert.deepEqual(parsed.lastMove, { x: 1, y: 1 });

  const exported = generateSGF(parsed.history, 9);
  assert.match(exported, /;B\[aa\];W\[\];B\[bb\]/);
});

test('AI history replay uses move actions instead of previous-move markers', () => {
  const initialBoard = createBoard(9);
  const blackResult = attemptMove(initialBoard, 4, 4, 'black');
  assert.ok(blackResult);
  const whiteResult = attemptMove(blackResult.newBoard, 3, 3, 'white');
  assert.ok(whiteResult);

  const history: HistoryItem[] = [
    {
      board: initialBoard,
      currentPlayer: 'black',
      blackCaptures: 0,
      whiteCaptures: 0,
      lastMove: null,
      move: { x: 4, y: 4 },
      consecutivePasses: 0,
    },
    {
      board: blackResult.newBoard,
      currentPlayer: 'white',
      blackCaptures: 0,
      whiteCaptures: 0,
      lastMove: { x: 4, y: 4 },
      move: { x: 3, y: 3 },
      consecutivePasses: 0,
    },
  ];

  const replayed = replayHistoryForInference(history, 9);

  assert.deepEqual(replayed.historyMoves, [
    { color: 1, x: 4, y: 4 },
    { color: -1, x: 3, y: 3 },
  ]);
  assert.deepEqual(replayed.failures, []);
  assert.equal(replayed.board.get(4, 4), 1);
  assert.equal(replayed.board.get(3, 3), -1);
});

test('AI history replay treats only an explicit null move as a pass', () => {
  const board = createBoard(9);
  const history: HistoryItem[] = [
    {
      board,
      currentPlayer: 'black',
      blackCaptures: 0,
      whiteCaptures: 0,
      lastMove: { x: 8, y: 8 },
      move: { x: 4, y: 4 },
      consecutivePasses: 0,
    },
    {
      board,
      currentPlayer: 'white',
      blackCaptures: 0,
      whiteCaptures: 0,
      lastMove: { x: 4, y: 4 },
      move: null,
      consecutivePasses: 0,
    },
  ];

  const replayed = replayHistoryForInference(history, 9);

  assert.deepEqual(replayed.historyMoves, [
    { color: 1, x: 4, y: 4 },
    { color: -1, x: -1, y: -1 },
  ]);
  assert.deepEqual(replayed.failures, []);
});

test('TapTap room message parser rejects malformed and out-of-bounds payloads', () => {
  assert.deepEqual(parseNativeMatchMessage({ type: 'MOVE', x: 3, y: 4 }, 9), {
    type: 'MOVE',
    x: 3,
    y: 4,
  });
  assert.equal(parseNativeMatchMessage({ type: 'MOVE', x: 9, y: 4 }, 9), null);
  assert.equal(parseNativeMatchMessage({ type: 'MOVE', x: 3.5, y: 4 }, 9), null);
  assert.equal(
    parseNativeMatchMessage(
      { type: 'SYNC', boardSize: 100, gameType: 'Go', startColor: 'black' },
      9
    ),
    null
  );
  assert.equal(parseNativeMatchMessage({ type: 'SYNC_REPLY', opponentInfo: { id: '' } }, 9), null);
  assert.equal(parseNativeMatchMessage({ type: 'UNKNOWN' }, 9), null);
});

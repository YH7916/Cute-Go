import assert from 'node:assert/strict';
import test from 'node:test';

import { createBoard } from '../core/board/index.ts';
import { attemptMove } from '../core/go/rules.ts';
import { generateSGF, parseSGF } from '../core/go/sgf.ts';
import { parseNativeMatchMessage } from '../services/platform/nativeMatchMessages.ts';

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

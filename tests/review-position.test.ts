import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, recordMove, recordPass } from '../domains/game/positionState';
import { selectReviewPosition } from '../domains/game/reviewPosition';

function game() {
  const initial = createInitialPosition(9);
  const board = initial.board.map(row => [...row]);
  board[2][3] = { x: 3, y: 2, color: 'black', id: 'first' };
  const moved = recordMove(initial, board, { x: 3, y: 2 }, 0, false);
  return { initial, moved, passed: recordPass(moved) };
}

test('review index zero analyzes the initial board with its original turn and no future moves', () => {
  const { initial, passed } = game();
  const selected = selectReviewPosition(passed, 0);
  assert.equal(selected.board, initial.board);
  assert.equal(selected.currentPlayer, 'black');
  assert.deepEqual(selected.history, []);
  assert.equal(selected.lastMove, null);
});

test('review intermediate snapshot and history describe exactly the same completed moves', () => {
  const { moved, passed } = game();
  const selected = selectReviewPosition(passed, 1);
  assert.equal(selected.board, moved.board);
  assert.equal(selected.currentPlayer, 'white');
  assert.deepEqual(selected.lastMove, { x: 3, y: 2 });
  assert.deepEqual(selected.history.map(item => item.move), [{ x: 3, y: 2 }]);
  assert.equal(selected.consecutivePasses, 0);
});

test('review end includes the final pass and clamps out-of-range indices', () => {
  const { passed } = game();
  assert.equal(selectReviewPosition(passed, passed.history.length), passed);
  assert.equal(selectReviewPosition(passed, 500), passed);
  assert.equal(selectReviewPosition(passed, -1).currentPlayer, 'black');
  assert.equal(selectReviewPosition(passed, Number.NaN).history.length, 0);
  assert.equal(passed.consecutivePasses, 1);
});

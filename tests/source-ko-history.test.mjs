import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { source, curriculumExercises, inspectMove, getBoardHash, recordMove, undoPosition } = await loadTestModule({ contents: `
  export * as source from './domains/coach/sourcePosition';
  export { curriculumExercises } from './domains/coach/curriculum';
  export { inspectMove } from './core/go/rules';
  export { getBoardHash } from './core/board';
  export { recordMove, undoPosition } from './domains/game/positionState';
` });
const catalog = JSON.parse(await readFile(new URL('../domains/coach/sourceData/ogs.json', import.meta.url), 'utf8'));
const page = catalog.sections.flatMap((section) => section.lessons.flatMap((lesson) => lesson.pages))
  .find((item) => item.id === 'ogs-ko-page05');
const lastMove = { x: 0, y: 10 };
const capturedPoint = { x: 0, y: 9 };
function setup() {
  return source.sourcePosition(page.position.width, page.position.initialPlayer, [
    ...page.position.black.map((point) => ({ ...point, color: 'black' })),
    ...page.position.white.map((point) => ({ ...point, color: 'white' })),
  ]);
}
function inspect(position, point) {
  const previous = position.history.at(-1);
  return inspectMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previous ? getBoardHash(previous.board) : null);
}

test('the published ko lesson includes the source capture history, not just its setup stones', () => {
  const exercise = curriculumExercises.find(item => item.id === page.id);
  assert.deepEqual(inspect(exercise.position, capturedPoint), { legal: false, reason: 'ko' });
  assert.equal(exercise.position.whiteCaptures, 1);
  assert.deepEqual(exercise.position.lastMove, lastMove);
});

test('OGS ko threat starts after White captured: an immediate a4 recapture is illegal', () => {
  const initial = setup();
  assert.equal(inspect(initial, capturedPoint).legal, true, 'the setup alone reproduces the missing-history bug');
  const position = source.restoreSourceCapture(initial, lastMove, capturedPoint);
  assert.deepEqual(inspect(position, capturedPoint), { legal: false, reason: 'ko' });
  assert.equal(position.history.length, 1);
  assert.equal(position.whiteCaptures, 1);
  assert.equal(position.blackCaptures, 0);
  assert.equal(position.currentPlayer, 'black');
  assert.deepEqual(position.lastMove, lastMove);
});

test('restoring the explicit capture preserves the setup and has a real reversible preceding move', () => {
  const initial = setup();
  const snapshot = JSON.stringify(initial);
  const position = source.restoreSourceCapture(initial, lastMove, capturedPoint);
  assert.equal(getBoardHash(position.board), getBoardHash(initial.board));
  assert.equal(JSON.stringify(initial), snapshot);
  const before = undoPosition(position, 1);
  assert.equal(before.currentPlayer, 'white');
  assert.equal(before.board[lastMove.y][lastMove.x], null);
  assert.equal(before.board[capturedPoint.y][capturedPoint.x].color, 'black');
  const move = inspect(before, lastMove);
  assert.equal(move.legal, true);
  assert.equal(move.result.captured, 1);
  assert.equal(getBoardHash(move.result.newBoard), getBoardHash(initial.board));
});

test('the recorded ko-threat solution stays legal after the real capture history is restored', () => {
  for (const line of page.answer.correct) {
    let position = source.restoreSourceCapture(setup(), lastMove, capturedPoint);
    for (const point of line) {
      const move = inspect(position, point);
      assert.equal(move.legal, true, `recorded move ${JSON.stringify(point)}`);
      position = recordMove(position, move.result.newBoard, point, move.result.captured, false);
    }
  }
});

test('unverified capture claims cannot manufacture source history', () => {
  assert.throws(() => source.restoreSourceCapture(setup(), { x: 3, y: 3 }, capturedPoint), /does not match/);
  assert.throws(() => source.restoreSourceCapture(setup(), lastMove, { x: 5, y: 5 }), /cannot be verified/);
  assert.throws(() => source.restoreSourceCapture(setup(), lastMove, { x: -1, y: 9 }), /outside/);
  const restored = source.restoreSourceCapture(setup(), lastMove, capturedPoint);
  assert.throws(() => source.restoreSourceCapture(restored, lastMove, capturedPoint), /existing history/);
});

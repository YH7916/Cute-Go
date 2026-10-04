import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { gradeExercise, exercisePosition, createExerciseDemonstration } = await loadTestModule({ contents: `
  export { gradeExercise, exercisePosition } from './domains/coach/exercise';
  export { createExerciseDemonstration } from './domains/coach/exerciseInteraction';
` });
const base = { id: 'sourced', familyId: 'sourced', skillId: 'test', contentRevision: '1',
  prompt: '黑先。', hints: ['看看白棋的气。', '试试圈出的点。'], explanation: '完成了这段变化。',
  position: exercisePosition(['.X...', 'XOX..', '.....', '.....', '.....']) };
const line = { ...base, kind: 'variation', solution: [
  { point: { x: 1, y: 2 }, color: 'black', children: [
    { point: { x: 4, y: 4 }, color: 'white', text: '白在角上应手。', children: [
      { point: { x: 3, y: 3 }, color: 'black', correct: true, children: [] },
      { point: { x: 0, y: 4 }, color: 'black', children: [
        { point: { x: 1, y: 4 }, color: 'white', wrong: true, text: '这一条变化没有完成目标。', children: [] },
      ] },
    ] },
  ] },
] };

test('source trees preserve player/opponent steps and only explicit correct nodes finish an exercise', () => {
  const first = gradeExercise(line, { kind: 'variation', points: [{ x: 1, y: 2 }] });
  assert.equal(first.outcome, 'continue');
  assert.equal(first.nextPosition.blackCaptures, 1);
  assert.equal(first.nextPosition.currentPlayer, 'black');
  assert.equal(first.nextPosition.board[4][4].color, 'white');
  assert.equal(first.nextPosition.history.length, 2);
  const done = gradeExercise(line, { kind: 'variation', points: [{ x: 1, y: 2 }, { x: 3, y: 3 }] });
  assert.equal(done.outcome, 'success');
  assert.equal(done.nextPosition.history.length, 3);
});

test('authored refutations are replayed; unknown legal moves do not become official failures', () => {
  const wrong = gradeExercise(line, { kind: 'variation', points: [{ x: 1, y: 2 }, { x: 0, y: 4 }] });
  assert.equal(wrong.outcome, 'failure');
  assert.equal(wrong.nextPosition.board[4][1].color, 'white');
  assert.match(wrong.explanation, /没有完成目标/);
  const unknown = gradeExercise(line, { kind: 'variation', points: [{ x: 4, y: 0 }] });
  assert.equal(unknown.outcome, 'unverified');
  assert.equal(unknown.nextPosition.board[0][4].color, 'black');
});

test('correct nodes may have explanatory children, and all demonstration frames retain the original position', () => {
  const withContinuation = { ...line, solution: [{ point: { x: 1, y: 2 }, color: 'black', correct: true,
    children: [{ point: { x: 4, y: 4 }, color: 'white', children: [] }] }] };
  assert.equal(gradeExercise(withContinuation, { kind: 'variation', points: [{ x: 1, y: 2 }] }).outcome, 'success');
  assert.equal(createExerciseDemonstration(withContinuation).length, 3, 'optional demonstration retains source explanations after a correct move');
  const frames = createExerciseDemonstration(line);
  assert.equal(frames[0].position, line.position);
  assert.equal(frames.length, 4);
  assert.equal(frames[1].position.board[4][4], null);
  assert.equal(frames[2].position.board[4][4].color, 'white');
  assert.equal(line.position.history.length, 0);
});

test('pass and dead-stone selection follow source actions without writing to the source board', () => {
  const pass = { ...base, kind: 'action', action: 'pass' };
  const passed = gradeExercise(pass, { kind: 'action', action: 'pass', points: [] });
  assert.equal(passed.outcome, 'success');
  assert.equal(passed.nextPosition.consecutivePasses, 1);
  assert.equal(passed.nextPosition.currentPlayer, 'white');
  const removal = { ...base, kind: 'action', action: 'remove', expectedPoints: [{ x: 1, y: 1 }] };
  assert.equal(gradeExercise(removal, { kind: 'action', action: 'remove', points: [] }).outcome, 'failure');
  const removed = gradeExercise(removal, { kind: 'action', action: 'remove', points: [{ x: 1, y: 1 }] });
  assert.equal(removed.outcome, 'success');
  assert.equal(removed.nextPosition.board[1][1], null);
  assert.equal(removed.nextPosition.blackCaptures, 1);
  assert.equal(base.position.board[1][1].color, 'white');
});

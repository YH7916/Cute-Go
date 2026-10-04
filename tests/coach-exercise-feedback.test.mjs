import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { exercisePosition, gradeExercise } = await loadTestModule({ contents: `
  export { exercisePosition, gradeExercise } from './domains/coach/exercise';
` });

const capture = {
  id: 'capture-feedback', familyId: 'capture-feedback', skillId: 'go.rules.capture', contentRevision: 'test.1',
  kind: 'point', position: exercisePosition(['.X...', 'XOX..', '.....', '.....', '.....']),
  rubric: { kind: 'capture', minimum: 1 }, prompt: '黑先，提走白子。',
  hints: ['找一找白棋剩下的气。', '白棋下方是最后一气。'],
  explanation: '白棋最后一气被填住，白子从棋盘拿走。',
};

test('a legal failed capture reports the actual result without claiming the target was removed', () => {
  const grade = gradeExercise(capture, { kind: 'point', point: { x: 4, y: 4 } });
  assert.equal(grade.outcome, 'failure');
  assert.equal(grade.nextPosition.board[1][1]?.color, 'white');
  assert.match(grade.explanation, /提掉 0 子/);
  assert.ok(grade.explanation.includes(capture.hints[0]));
  assert.ok(!grade.explanation.includes(capture.explanation));
  assert.doesNotMatch(grade.explanation, /白子从棋盘拿走/);
});

test('an occupied move explains its rule and offers a retry without giving success feedback', () => {
  const grade = gradeExercise(capture, { kind: 'point', point: { x: 1, y: 1 } });
  assert.equal(grade.outcome, 'failure');
  assert.equal(grade.nextPosition, undefined);
  assert.match(grade.explanation, /已有棋子/);
  assert.match(grade.explanation, /重试|再试/);
  assert.ok(!grade.explanation.includes(capture.explanation));
});

test('a successful capture retains its explanation and actual capture count', () => {
  const grade = gradeExercise(capture, { kind: 'point', point: { x: 1, y: 2 } });
  assert.equal(grade.outcome, 'success');
  assert.equal(grade.nextPosition.board[1][1], null);
  assert.match(grade.explanation, /提掉 1 子/);
  assert.ok(grade.explanation.includes(capture.explanation));
});

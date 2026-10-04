import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, sequence, exercisePosition, setup } from './helpers/learningCenter.mjs';

const number = { ...capture, id: 'personal-number', familyId: 'number-fixture', kind: 'number',
  position: exercisePosition(['.....', '.....', '.XX..', '.....', '.....']),
  rubric: { kind: 'liberties', anchor: { x: 1, y: 2 } }, prompt: '这块黑棋有几气？',
  hints: ['数相邻的空点。', '同一个空点不能重复数。'] };

test('a failed number answer can be cleared and corrected in place without rewriting the original attempt', t => {
  const host = setup(t, [number]);
  host.render().openExercise(number.id);
  host.render().view.active.onNumber('5');
  host.render().view.active.onSubmit();
  const original = { ...host.record.attempts[0] };
  let active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'failure');
  active.onNumber('');
  active = host.render().view.active;
  assert.equal(active.canSubmit, false);
  assert.equal(active.numberAnswer, '');
  active.onNumber('6');
  active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.equal(active.board, number.position.board);
  assert.equal(active.independent, false);
  active.onSubmit();
  active = host.render().view.active;
  assert.equal(active.result.outcome, 'success');
  assert.deepEqual(host.record.attempts[0], original);
  assert.equal(host.record.attempts[1].retryOf, original.attemptId);
  assert.equal(host.render().view.stats.independent, 0);
});

test('the visible hint action after a wrong number answer starts an assisted correction on the same board', t => {
  const host = setup(t, [number]);
  host.render().openExercise(number.id);
  host.render().view.active.onNumber('5');
  host.render().view.active.onSubmit();
  const original = { ...host.record.attempts[0] };
  host.render().view.active.onHint();
  const active = host.render().view.active;
  assert.equal(active.phase, 'practice', 'the displayed Hint control must leave feedback and show the requested guidance');
  assert.equal(active.hintLevel, 1);
  assert.equal(active.hint, number.hints[0]);
  assert.equal(active.board, number.position.board);
  assert.equal(active.independent, false);
  active.onNumber('6');
  host.render().view.active.onSubmit();
  assert.deepEqual(host.record.attempts[0], original);
  assert.equal(host.record.attempts[1].retryOf, original.attemptId);
  assert.ok(host.record.attempts[1].hintLevel > 0);
});

test('leaving halfway through a demonstration records the suspended attempt as assisted abandonment exactly once', t => {
  const host = setup(t);
  host.render().openExercise(sequence.id);
  host.render().view.active.onPoint(1, 2);
  host.render().view.active.onDemonstrate();
  host.render().view.active.onContinue();
  const state = host.render();
  state.close(); state.close();
  assert.equal(host.render().view.active, null);
  assert.equal(host.record.attempts.length, 1);
  assert.equal(host.record.attempts[0].outcome, 'abandoned');
  assert.equal(host.record.attempts[0].hintLevel, 3);
  assert.equal(host.render().view.stats.independent, 0);
});

test('old demonstration, inspection and undo callbacks cannot touch a replacement exercise', t => {
  const host = setup(t);
  host.render().openExercise(sequence.id);
  host.render().view.active.onPoint(1, 2);
  const oldPractice = host.render().view.active;
  oldPractice.onDemonstrate();
  host.render().view.active.onContinue();
  const oldDemo = host.render().view.active;
  host.render().openExercise(capture.id);
  const original = host.render().view.active;
  const events = [...host.events];
  for (const action of [oldPractice.onUndo, () => oldPractice.onInspect(1, 1), oldPractice.onDemonstrate,
    oldDemo.onContinue, oldDemo.onUndo, oldDemo.onReturnFromDemo, () => oldDemo.onInspect(1, 1)]) {
    action();
    const active = host.render().view.active;
    assert.equal(active.phase, 'practice');
    assert.equal(active.board, original.board);
    assert.equal(active.instruction, original.instruction);
    assert.equal(active.independent, true);
    assert.deepEqual(host.events, events);
  }
});

for (const assistance of ['hint', 'demonstration', 'inspection']) test(`undo retains ${assistance} exposure and cannot restore an independent answer`, t => {
  const host = setup(t);
  host.render().openExercise(sequence.id);
  host.render().view.active.onPoint(1, 2);
  if (assistance === 'hint') host.render().view.active.onHint();
  if (assistance === 'inspection') host.render().view.active.onInspect(3, 1);
  if (assistance === 'demonstration') {
    host.render().view.active.onDemonstrate();
    host.render().view.active.onReturnFromDemo();
  }
  host.render().view.active.onUndo();
  let active = host.render().view.active;
  assert.equal(active.board, sequence.position.board);
  assert.equal(active.independent, false);
  active.onPoint(1, 2);
  host.render().view.active.onPoint(3, 2);
  active = host.render().view.active;
  assert.equal(active.result.outcome, 'success');
  assert.equal(host.record.attempts.length, 1);
  assert.ok(host.record.attempts[0].hintLevel >= (assistance === 'demonstration' ? 3 : 1));
  assert.equal(host.render().view.stats.independent, 0);
});

test('unassisted answers to two exercises from the same family still provide only one independent success', t => {
  const sibling = { ...capture, id: 'same-family-capture' };
  const host = setup(t, [capture, sibling]);
  host.render().openExercise(capture.id);
  host.render().view.active.onPoint(1, 2);
  assert.equal(host.render().view.stats.independent, 1);
  host.render().openExercise(sibling.id);
  assert.equal(host.render().view.active.independent, false);
  host.render().view.active.onPoint(1, 2);
  assert.equal(host.record.attempts.length, 2);
  assert.equal(host.render().view.stats.independent, 1);
});

test('demo return restores the pending numeric answer and a sequence reply keeps captures in its preview', t => {
  const host = setup(t, [number, sequence]);
  host.render().openExercise(number.id);
  host.render().view.active.onNumber('6');
  host.render().view.active.onDemonstrate();
  host.render().view.active.onContinue();
  host.render().view.active.onReturnFromDemo();
  let active = host.render().view.active;
  assert.equal(active.numberAnswer, '6');
  assert.equal(active.canSubmit, true);
  assert.equal(active.board, number.position.board);
  host.render().openExercise(sequence.id);
  host.render().view.active.onPoint(1, 2);
  active = host.render().view.active;
  const before = active.board;
  assert.equal(active.replyPreview.blackCaptures, 1);
  assert.equal(active.replyPreview.currentPlayer, 'white');
  assert.equal(active.replyPreview.history.length, 1);
  assert.equal(active.replyPreview.board[4][4], null);
  active.onDemonstrate();
  host.render().view.active.onContinue();
  host.render().view.active.onReturnFromDemo();
  active = host.render().view.active;
  assert.equal(active.board, before);
  assert.equal(active.currentPlayer, 'black');
  active.onPoint(3, 2);
  assert.equal(host.render().view.active.result.nextPosition.blackCaptures, 2);
});

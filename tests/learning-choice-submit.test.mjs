import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, curriculumLessons, exercisePosition, projectLearning, setup } from './helpers/learningCenter.mjs';

const choice = curriculumLessons[0].exercises[0];
const wrongChoiceId = choice.choices.find(item => item.id !== choice.correctChoiceId).id;

test('one choice click records the unaided answer before showing feedback and exposing the answer', t => {
  const host = setup(t);
  host.render().openExercise(choice.id);
  const before = host.render().view.active;
  before.onChoice(choice.correctChoiceId);
  const feedback = host.render().view.active;
  assert.equal(feedback.phase, 'feedback');
  assert.equal(feedback.result.outcome, 'success');
  assert.equal(feedback.selectedChoice, choice.correctChoiceId);
  assert.equal(feedback.instruction, feedback.result.explanation);
  assert.equal(feedback.board, before.board);
  assert.deepEqual(host.events, ['attempt', 'exposure']);
  assert.equal(host.record.attempts[0].outcome, 'success');
  assert.equal(host.record.attempts[0].hintLevel, 0);
  assert.equal(host.record.attempts[0].retryOf, undefined);
  assert.equal(host.record.exposures[0].attemptId, host.record.attempts[0].attemptId);
  assert.equal(projectLearning(host.record).progress[choice.skillId].independentSuccesses, 1);
  before.onChoice(wrongChoiceId);
  before.onSubmit();
  feedback.onSubmit();
  feedback.onChoice(wrongChoiceId);
  assert.equal(host.render().view.active.result.outcome, 'success');
  assert.deepEqual(host.events, ['attempt', 'exposure'], 'duplicate callbacks cannot record or replace the completed answer');
});

test('a wrong choice immediately explains the mistake and a new choice is an assisted retry', t => {
  const host = setup(t);
  host.render().openExercise(choice.id);
  host.render().view.active.onChoice(wrongChoiceId);
  let active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'failure');
  assert.equal(active.selectedChoice, wrongChoiceId);
  assert.equal(active.instruction, active.result.explanation);
  assert.notEqual(active.instruction, choice.prompt, 'the selected answer must produce visible feedback immediately');
  const original = structuredClone(host.record.attempts[0]);
  active.onChoice(choice.correctChoiceId);
  active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'success');
  assert.equal(active.selectedChoice, choice.correctChoiceId);
  assert.equal(active.independent, false);
  assert.deepEqual(host.record.attempts[0], original);
  assert.equal(host.record.attempts.length, 2);
  assert.notEqual(host.record.attempts[1].attemptId, original.attemptId);
  assert.equal(host.record.attempts[1].retryOf, original.attemptId);
  assert.ok(host.record.attempts[1].hintLevel > 0);
  assert.deepEqual(host.events, ['attempt', 'exposure', 'attempt', 'exposure']);
  assert.equal(projectLearning(host.record).progress[choice.skillId].independentSuccesses, 0);
});

test('automatic progression is indicated only for an unpaused successful course answer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = setup(t);
  host.render().openExercise(choice.id, 'course');
  assert.equal(host.render().view.active.autoAdvance, false);
  host.render().view.active.onChoice(choice.correctChoiceId);
  assert.equal(host.render().view.active.autoAdvance, true);
  host.render().view.active.onExplanation();
  assert.equal(host.render().view.active.autoAdvance, false);
  host.render().view.active.onExplanation();
  assert.equal(host.render().view.active.autoAdvance, true);
  const y = choice.position.board.findIndex(row => row.some(Boolean));
  const x = choice.position.board[y].findIndex(Boolean);
  host.render().view.active.onInspect(x, y);
  assert.equal(host.render().view.active.autoAdvance, false);
  host.render().openExercise(choice.id);
  host.render().view.active.onChoice(choice.correctChoiceId);
  assert.equal(host.render().view.active.autoAdvance, false);
});

for (const replacement of ['next', 'close', 'owner']) test(`old choice and submit callbacks cannot affect ${replacement} state`, t => {
  const host = setup(t);
  host.render().openExercise(choice.id, 'course');
  const oldPractice = host.render().view.active;
  oldPractice.onChoice(wrongChoiceId);
  const oldFeedback = host.render().view.active;
  if (replacement === 'next') oldFeedback.onNext();
  if (replacement === 'close') host.render().close();
  if (replacement === 'owner') { host.setLoaded(false); host.render(); }
  const current = host.render().view.active;
  const record = structuredClone(host.record);
  oldPractice.onChoice(choice.correctChoiceId);
  oldPractice.onSubmit();
  oldFeedback.onChoice(choice.correctChoiceId);
  oldFeedback.onSubmit();
  assert.equal(host.render().view.active?.prompt, current?.prompt);
  assert.equal(host.render().view.active?.result, current?.result);
  assert.deepEqual(host.record, record);
});

test('numeric entry still waits for confirmation before grading', t => {
  const number = { ...capture, id: 'number-confirm', familyId: 'number-confirm', kind: 'number',
    position: exercisePosition(['.....', '.....', '.XX..', '.....', '.....']),
    rubric: { kind: 'liberties', anchor: { x: 1, y: 2 } } };
  const host = setup(t, [number]);
  host.render().openExercise(number.id);
  host.render().view.active.onNumber('6');
  let active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.equal(active.result, null);
  assert.deepEqual(host.events, []);
  active.onSubmit();
  active = host.render().view.active;
  assert.equal(active.result.outcome, 'success');
  assert.deepEqual(host.events, ['attempt', 'exposure']);
});

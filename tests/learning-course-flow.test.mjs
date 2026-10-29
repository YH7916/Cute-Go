import assert from 'node:assert/strict';
import test from 'node:test';
import { curriculumLessons, setup } from './helpers/learningCenter.mjs';

const firstLesson = () => curriculumLessons[0];
function start(host) {
  host.render().open();
  return host.render().view.active;
}
function answer(host, correct = true) {
  const exercise = firstLesson().exercises[0];
  const choice = correct ? exercise.correctChoiceId : exercise.choices.find(item => item.id !== exercise.correctChoiceId).id;
  host.render().view.active.onChoice(choice);
  host.render().view.active.onSubmit();
  return host.render().view.active;
}

test('familiar concepts go straight to practice, while a new concept appears only at the start of its lesson', t => {
  const host = setup(t);
  assert.equal(start(host).instruction, firstLesson().exercises[0].prompt);
  const eyes = curriculumLessons.find(lesson => lesson.id === 'ogs-real-false-eye');
  host.render().view.onLesson(eyes.id);
  let active = host.render().view.active;
  assert.equal(active.instruction, `- ${eyes.introduction}\n- ${eyes.exercises[0].prompt}`);
  assert.deepEqual(host.record.exposures, [], 'the concept must not reveal this question’s answer');
  host.render().openExercise(eyes.exercises[1].id, 'course');
  active = host.render().view.active;
  assert.equal(active.instruction, eyes.exercises[1].prompt);
});

test('a correct course answer stays readable, then advances once without a continue click', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = setup(t);
  start(host);
  const feedback = answer(host);
  assert.equal(feedback.result.outcome, 'success');
  t.mock.timers.tick(1000);
  assert.equal(host.render().view.active.result.outcome, 'success');
  t.mock.timers.tick(6000);
  assert.equal(host.render().view.active.prompt, firstLesson().exercises[1].prompt);
  assert.equal(host.record.attempts.length, 1);
  t.mock.timers.tick(6000);
  assert.equal(host.render().view.active.prompt, firstLesson().exercises[1].prompt, 'an unanswered question must never auto-advance');
});

test('a wrong answer stays on its feedback until the learner chooses again', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = setup(t);
  start(host);
  const feedback = answer(host, false);
  t.mock.timers.tick(10000);
  assert.equal(host.render().view.active.result.outcome, 'failure');
  assert.equal(host.render().view.active.instruction, feedback.instruction);
  assert.equal(host.record.attempts.length, 1);
});

test('opening explanation pauses automatic progression and closing it resumes the reading interval', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = setup(t);
  start(host); answer(host);
  host.render().view.active.onExplanation();
  host.render();
  t.mock.timers.tick(10000);
  assert.equal(host.render().view.active.explanationVisible, true);
  host.render().view.active.onExplanation();
  host.render();
  t.mock.timers.tick(6000);
  assert.equal(host.render().view.active.prompt, firstLesson().exercises[1].prompt);
});

test('the explanation action retains the thinking cue without revealing the answer after a wrong choice', t => {
  const host = setup(t);
  start(host);
  const feedback = answer(host, false);
  assert.equal(feedback.instruction, firstLesson().exercises[0].wrongAnswerExplanation);
  assert.ok(feedback.instruction.length > 0);
  assert.doesNotMatch(feedback.instruction, /正确答案|你选了|[0-9]/);
  feedback.onExplanation();
  assert.equal(host.render().view.active.instruction, feedback.instruction);
});

test('replaying a completed course visits every question before entering the next lesson', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const host = setup(t);
  for (const [index, exercise] of curriculumLessons.flatMap(lesson => lesson.exercises).entries()) {
    host.record.attempts.push({ attemptId: `old-${index}`, sequence: index + 1,
      exerciseId: exercise.id, familyId: exercise.familyId, skillId: exercise.skillId,
      contentRevision: exercise.contentRevision, outcome: 'success', hintLevel: 0,
      occurredAt: Date.now() - 1000, source: 'course' });
  }
  host.render().open();
  assert.equal(host.render().view.startCourseLabel, '从头练习');
  host.render().view.onStartCourse();
  for (const exercise of firstLesson().exercises) {
    assert.equal(host.render().view.active.prompt, exercise.prompt);
    host.render().view.active.onChoice(exercise.correctChoiceId);
    host.render().view.active.onSubmit();
    host.render();
    t.mock.timers.tick(6000);
  }
  assert.equal(host.render().view.active.prompt, curriculumLessons[1].exercises[0].prompt);
});

for (const action of ['close', 'replace', 'manual-next', 'owner', 'unmount']) {
  test(`${action} cancels the old correct-answer timer`, t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const host = setup(t);
    start(host); answer(host);
    if (action === 'close') host.render().close();
    if (action === 'replace') host.render().view.onLesson('ogs-real-false-eye');
    if (action === 'manual-next') host.render().view.active.onContinue();
    if (action === 'owner') { host.setLoaded(false); host.render(); }
    if (action === 'unmount') host.unmount();
    const state = action === 'unmount' ? null : host.render();
    const events = [...host.events];
    t.mock.timers.tick(10000);
    if (state) {
      assert.equal(host.render().isOpen, state.isOpen);
      assert.equal(host.render().view.active?.prompt, state.view.active?.prompt);
    }
    assert.deepEqual(host.events, events, 'the old timer cannot touch the new course or record');
  });
}

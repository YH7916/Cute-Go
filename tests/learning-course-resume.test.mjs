import assert from 'node:assert/strict';
import test from 'node:test';
import { curriculumExercises, curriculumLessons, setup } from './helpers/learningCenter.mjs';

test('opening the classroom goes straight to a question without recording an answer or assistance', t => {
  const host = setup(t);
  host.render().open();
  assert.equal(host.render().view.active?.prompt, curriculumExercises[0].prompt);
  assert.equal(host.record.courseCursor.exerciseId, curriculumExercises[0].id);
  assert.equal(host.record.courseCursor.completed, false);
  assert.deepEqual(host.events, []);
});

test('an unanswered later lesson resumes after closing and after a fresh mount', t => {
  const host = setup(t);
  const lesson = curriculumLessons[8];
  host.render().view.onLesson(lesson.id);
  const question = host.render().view.active.prompt;
  host.render().close();
  host.render().open();
  assert.equal(host.render().view.active?.prompt, question);
  const restored = setup(t, [], host.record);
  restored.render().open();
  assert.equal(restored.render().view.active?.prompt, question);
  assert.equal(restored.record.attempts.length, host.record.attempts.length);
});

test('a skipped unanswered question resumes at its successor even after a fresh mount', t => {
  const host = setup(t);
  host.render().open();
  host.render().view.active.onNext();
  const restored = setup(t, [], host.record);
  restored.render().open();
  assert.equal(restored.render().view.active?.prompt, curriculumExercises[1].prompt);
  assert.equal(restored.record.attempts[0].outcome, 'abandoned');
});

for (const success of [true, false]) {
  test(`a ${success ? 'successful' : 'failed'} answer resumes ${success ? 'the next' : 'the same'} question before its timer fires`, t => {
    const host = setup(t);
    const question = curriculumExercises[0];
    host.render().open();
    host.render().view.active.onChoice(success ? question.correctChoiceId : question.choices.find(item => item.id !== question.correctChoiceId).id);
    const restored = setup(t, [], host.record);
    restored.render().open();
    assert.equal(restored.render().view.active?.prompt, curriculumExercises[success ? 1 : 0].prompt);
    assert.equal(restored.record.attempts.length, 1);
  });
}

test('legacy course attempts resume the latest course position rather than the first unfinished lesson', t => {
  const question = curriculumExercises[30];
  const record = { version: 1, attempts: [{ attemptId: 'legacy', sequence: 1, exerciseId: question.id,
    contentRevision: question.contentRevision, familyId: question.familyId, skillId: question.skillId,
    outcome: 'success', source: 'course', occurredAt: 10, hintLevel: 0 }], exposures: [], savedPositions: [] };
  const host = setup(t, [], record);
  host.render().open();
  assert.equal(host.render().view.active?.prompt, curriculumExercises[31].prompt);
  assert.equal(host.record.attempts.length, 1);
});

for (const cursor of [
  { exerciseId: 'ogs-count_chains-page01', contentRevision: 'old', completed: true, updatedAt: 10 },
  { exerciseId: curriculumExercises[5].id, contentRevision: 'stale', completed: false, updatedAt: 10 },
]) {
  test(`a removed or revised cursor falls back safely (${cursor.exerciseId})`, t => {
    const host = setup(t, [], { version: 1, attempts: [], exposures: [], savedPositions: [], courseCursor: cursor });
    host.render().open();
    assert.equal(host.render().view.active?.prompt, curriculumExercises[0].prompt);
    assert.deepEqual(host.record.attempts, []);
  });
}

test('a completed final question reopens the course completion state', t => {
  const last = curriculumExercises.at(-1);
  const host = setup(t, [], { version: 1, attempts: [], exposures: [], savedPositions: [], courseCursor: {
    exerciseId: last.id, contentRevision: last.contentRevision, completed: true, updatedAt: 10,
  } });
  host.render().open();
  assert.equal(host.render().isOpen, true);
  assert.equal(host.render().view.active, null);
  assert.match(host.render().view.notice, /完成/);
  assert.equal(host.record.courseCursor.exerciseId, last.id);
});

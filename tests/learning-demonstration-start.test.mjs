import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, sequence, curriculumExercises, setup } from './helpers/learningCenter.mjs';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { createExerciseDemonstration } = await loadTestModule({
  contents: `export { createExerciseDemonstration } from './domains/coach/exerciseInteraction';`,
});
const colors = board => board.map(row => row.map(stone => stone?.color ?? null));

test('one demonstration click shows the first worked step for every supported course and personal exercise', t => {
  const exercises = [...curriculumExercises, capture, sequence].filter(exercise => createExerciseDemonstration(exercise).length > 1);
  const host = setup(t, exercises);
  for (const exercise of exercises) {
    host.render().openExercise(exercise.id);
    const practice = host.render().view.active;
    const frames = createExerciseDemonstration(exercise);
    practice.onDemonstrate();
    let active = host.render().view.active;
    assert.equal(active.phase, 'demonstration', exercise.id);
    assert.deepEqual(colors(active.board), colors(frames[1].position.board), exercise.id);
    assert.equal(active.instruction, frames[1].text, exercise.id);
    assert.deepEqual(active.markers, frames[1].points ?? [], exercise.id);
    assert.equal(active.currentPlayer, frames[1].position.currentPlayer, exercise.id);
    assert.equal(active.blackCaptures, frames[1].position.blackCaptures, exercise.id);
    assert.equal(active.whiteCaptures, frames[1].position.whiteCaptures, exercise.id);
    assert.equal(active.canUndo, true, 'the original diagram remains available as the previous step');
    active.onUndo();
    active = host.render().view.active;
    assert.deepEqual(active.board, frames[0].position.board, exercise.id);
    assert.equal(active.instruction, frames[0].text, exercise.id);
    assert.equal(active.canUndo, false);
    active.onReturnFromDemo();
    active = host.render().view.active;
    assert.equal(active.board, practice.board);
    assert.equal(active.instruction, practice.instruction);
    assert.equal(active.independent, false);
  }
  assert.ok(host.record.attempts.every(attempt => attempt.outcome === 'abandoned'), 'viewing a demonstration never grades a success');
});

test('starting a sequence shows the learner move immediately and keeps the opponent reply as its own step', t => {
  const host = setup(t, [sequence]);
  host.render().openExercise(sequence.id);
  host.render().view.active.onDemonstrate();
  let active = host.render().view.active;
  assert.equal(active.board[2][1]?.color, 'black');
  assert.equal(active.board[1][1], null, 'the captured stone is removed in the first displayed move');
  assert.equal(active.blackCaptures, 1);
  assert.equal(active.board[4][4], null);
  active.onContinue();
  active = host.render().view.active;
  assert.equal(active.board[4][4]?.color, 'white');
  assert.equal(active.currentPlayer, 'black');
  active.onReturnFromDemo();
  assert.equal(host.render().view.active.board, sequence.position.board);
  assert.equal(host.record.attempts.length, 0);
});

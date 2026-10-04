import assert from 'node:assert/strict';
import test from 'node:test';
import { exercisePosition, gradeExercise } from '../domains/coach/exercise';
import { collectReviewMoments, createReviewExercise } from '../domains/coach/reviewTeaching';
import { recordMove, recordPass } from '../domains/game/positionState';
import { attemptMove } from '../core/go/rules';
import { curriculumLessons } from '../domains/coach/curriculum';
import { beginnerSourceLessonIds } from '../domains/coach/beginnerTutorial';

test('personal training only grades immediate rule-checkable objectives', () => {
  const capture = exercisePosition(['.XO..', 'XO.O.', '.XO..', '.....', '.....']);
  const exercise = createReviewExercise(capture, 'saved-capture');
  assert.ok(exercise);
  assert.equal(exercise.kind, 'point');
  assert.equal(gradeExercise(exercise, { kind: 'point', point: { x: 2, y: 1 } }).outcome, 'success');
  assert.equal(gradeExercise(exercise, { kind: 'point', point: { x: 4, y: 4 } }).outcome, 'failure');
  assert.equal(capture.board[1][2], null, 'grading preserves the original snapshot');
  assert.equal(createReviewExercise(exercisePosition(['.....', '.....', '..X..', '.....', '.....']), 'quiet'), null);
  assert.equal(createReviewExercise(recordPass(recordPass(capture)), 'ended'), null);
});

test('saved escape exercises check the original group after the move', () => {
  const position = exercisePosition(['.O...', 'OX...', '.O...', '.....', '.....']);
  const exercise = createReviewExercise(position, 'saved-escape');
  assert.ok(exercise);
  assert.equal(exercise.skillId, 'go.tactics.escape-atari');
  assert.ok(beginnerSourceLessonIds.includes(exercise.skillId)
    || curriculumLessons.some(lesson => lesson.skillId === exercise.skillId), 'saved exercises retain a topic in the unified teaching catalog');
  assert.equal(gradeExercise(exercise, { kind: 'point', point: { x: 2, y: 1 } }).outcome, 'success');
  assert.equal(gradeExercise(exercise, { kind: 'point', point: { x: 4, y: 4 } }).outcome, 'failure');
  assert.match(exercise.explanation, /不代表/);
});

test('ordinary pressure with several remaining liberties is not called atari', () => {
  const before = exercisePosition(['.....', '.....', '..O..', '.....', '.....']);
  const move = attemptMove(before.board, 1, 2, 'black', 'Go', null);
  assert.ok(move);
  const game = recordMove(before, move.newBoard, { x: 1, y: 2 }, move.captured, false);
  assert.deepEqual(collectReviewMoments(game), []);
});

test('review capture moments point to the before-action snapshot without labeling best moves', () => {
  const before = exercisePosition(['.X...', 'XO...', '.X...', '.....', '.....']);
  const move = attemptMove(before.board, 2, 1, 'black', 'Go', null);
  assert.ok(move);
  const game = recordMove(before, move.newBoard, { x: 2, y: 1 }, move.captured, false);
  const moments = collectReviewMoments(game);
  const capture = moments.find(moment => moment.title.includes('提子'));
  assert.ok(capture);
  assert.equal(capture.cursor, 0);
  assert.doesNotMatch(capture.detail, /最佳|恶手/);
  assert.deepEqual(collectReviewMoments(recordPass(recordPass(exercisePosition(['...', '...', '...'])))), []);
});

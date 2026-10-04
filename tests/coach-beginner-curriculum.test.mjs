import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { curriculumLessons, curriculumExercises, gradeExercise, getGroup, inspectMove, getBoardHash,
  calculateScore, calculateTerritory } = await loadTestModule({ contents: `
  export { curriculumLessons, curriculumExercises } from './domains/coach/curriculumDrafts';
  export { gradeExercise } from './domains/coach/exercise';
  export { getGroup, getBoardHash } from './core/board';
  export { inspectMove } from './core/go/rules';
  export { calculateScore, calculateTerritory } from './core/go/scoring';
` });
const find = id => curriculumExercises.find(item => item.id === `go.${id}`);
const point = (exercise, x, y) => gradeExercise(exercise, { kind: 'point', point: { x, y } });
const sequence = (exercise, ...points) => gradeExercise(exercise, { kind: 'sequence', points: points.map(([x, y]) => ({ x, y })) });

test('each foundation has two distinct board situations, short guidance and no automatic teacher certification', () => {
  for (const lesson of curriculumLessons.slice(0, 10)) {
    assert.equal(lesson.exercises.length, 2);
    const [first, second] = lesson.exercises;
    assert.notEqual(getBoardHash(first.position.board), getBoardHash(second.position.board), lesson.id);
    assert.ok(lesson.concept.length < 95, lesson.id);
    assert.ok(lesson.example.length < 90, lesson.id);
    assert.equal(lesson.reviewStatus, 'original-draft');
    for (const exercise of lesson.exercises) {
      assert.ok(exercise.prompt.length < 85, exercise.id);
      assert.equal(exercise.hints.length, 2);
    }
  }
});

test('fundamental point tasks have independently specified complete answer sets', () => {
  const expected = {
    'rules.capture.1': [[1, 2]], 'rules.capture.2': [[0, 0]],
    'basics.connect.1': [[2, 2]], 'basics.connect.2': [[2, 1], [1, 2]],
    'basics.atari.1': [[2, 1], [1, 2]], 'basics.atari.2': [[0, 0], [3, 0]],
    'basics.escape.1': [[1, 2]], 'basics.escape.2': [[0, 1]],
    'rules.suicide.2': [[1, 2]], 'life.two-eyes.1': [[3, 2]], 'life.two-eyes.2': [[2, 0]],
  };
  for (const [id, answers] of Object.entries(expected)) {
    const exercise = find(id), actual = [];
    for (let y = 0; y < exercise.position.board.length; y++) for (let x = 0; x < exercise.position.board.length; x++) {
      if (point(exercise, x, y).outcome === 'success') actual.push([x, y]);
    }
    assert.deepEqual(actual, answers, id);
  }
});

test('placing on an occupied point and entering a no-capture suicide keep the original board', () => {
  const placement = find('rules.place-turn.2');
  assert.equal(point(placement, 1, 1).outcome, 'failure');
  assert.equal(point(placement, 3, 3).outcome, 'failure');
  assert.equal(point(placement, 2, 2).outcome, 'success');
  const suicide = find('rules.suicide.1');
  const initial = getBoardHash(suicide.position.board);
  assert.equal(point(suicide, 2, 2).outcome, 'failure');
  assert.equal(point(suicide, 2, 2).nextPosition, undefined);
  assert.equal(getBoardHash(suicide.position.board), initial);
  const capture = point(find('rules.suicide.2'), 1, 2);
  assert.equal(capture.nextPosition.blackCaptures, 1);
  assert.equal(getGroup(capture.nextPosition.board, { x: 1, y: 2 }).liberties, 1);
});

test('liberty numbers distinguish a long chain from a shared corner liberty', () => {
  for (const [id, answer] of [['rules.groups-liberties.1', 6], ['rules.groups-liberties.2', 3]]) {
    const exercise = find(id);
    assert.equal(gradeExercise(exercise, { kind: 'number', value: answer }).outcome, 'success');
    assert.equal(gradeExercise(exercise, { kind: 'number', value: answer + 1 }).outcome, 'failure');
  }
});

test('both ko lessons preserve history and require an intervening pair before white can recapture', () => {
  assert.equal(find('rules.ko.1').familyId, find('rules.ko.2').familyId, 'translating the same ko shape is not independent transfer evidence');
  for (const [id, away, recapture] of [
    ['rules.ko.1', [4, 4], [1, 1]], ['rules.ko.2', [6, 6], [3, 2]],
  ]) {
    const exercise = find(id), before = JSON.stringify(exercise.position);
    assert.equal(exercise.position.currentPlayer, 'white');
    assert.equal(exercise.position.blackCaptures, 1);
    assert.equal(exercise.position.history.length, 1);
    const rejected = inspectMove(exercise.position.board, ...recapture, 'white', 'Go', getBoardHash(exercise.position.history[0].board));
    assert.deepEqual(rejected, { legal: false, reason: 'ko' });
    assert.equal(sequence(exercise, recapture).outcome, 'failure');
    const partial = sequence(exercise, away);
    assert.equal(partial.outcome, 'continue');
    assert.equal(partial.nextPosition.currentPlayer, 'white');
    assert.equal(partial.nextPosition.whiteCaptures, 0);
    const completed = sequence(exercise, away, recapture);
    assert.equal(completed.outcome, 'success');
    assert.equal(completed.nextPosition.whiteCaptures, 1);
    assert.equal(completed.nextPosition.history.length, 4);
    assert.equal(JSON.stringify(exercise.position), before);
  }
});

test('beginner two-eye answers leave two independently unplayable points for white', () => {
  for (const [id, move, eyes] of [
    ['life.two-eyes.1', [3, 2], [[2, 2], [4, 2]]],
    ['life.two-eyes.2', [2, 0], [[1, 0], [3, 0]]],
  ]) {
    const completed = point(find(id), ...move);
    assert.equal(completed.outcome, 'success');
    for (const eye of eyes) assert.deepEqual(inspectMove(completed.nextPosition.board, ...eye, 'white'), { legal: false, reason: 'suicide' });
  }
});

test('territory exercises exclude stones and shared spaces; total score adds captures and komi separately', () => {
  for (const [id, count] of [['rules.territory-dead.1', 2], ['rules.territory-dead.2', 10]]) {
    const exercise = find(id);
    assert.equal(gradeExercise(exercise, { kind: 'number', value: count }).outcome, 'success');
    assert.equal(gradeExercise(exercise, { kind: 'number', value: count + 1 }).outcome, 'failure');
    const territory = calculateTerritory(exercise.position.board);
    assert.equal(territory.black.some(item => item.y === 2), false);
    assert.equal(territory.white.some(item => item.y === 2), false);
  }
  const settled = find('rules.territory-dead.1').position.board;
  assert.deepEqual(calculateScore(settled, null, 6.5, { black: 3, white: 1 }), { black: 5, white: 9.5 });
  const lesson = curriculumLessons.find(item => item.id === 'go.rules.territory-dead');
  assert.match(lesson.concept, /连续停着/);
  assert.match(lesson.concept, /确认死子/);
});

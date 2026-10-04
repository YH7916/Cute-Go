import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { curriculumExercises, createExerciseDemonstration, playExerciseExploration, replyToExerciseDeviation, getExerciseGuidance,
  exercisePosition, gradeExercise, getBoardHash, inspectMove, recordMove, undoPosition } = await loadTestModule({ contents: `
  export { curriculumExercises } from './domains/coach/curriculumDrafts';
  export { createExerciseDemonstration, playExerciseExploration, replyToExerciseDeviation, getExerciseGuidance } from './domains/coach/exerciseInteraction';
  export { exercisePosition, gradeExercise } from './domains/coach/exercise';
  export { getBoardHash } from './core/board';
  export { inspectMove } from './core/go/rules';
  export { recordMove, undoPosition } from './domains/game/positionState';
` });
const find = id => curriculumExercises.find(exercise => exercise.id === `go.${id}`);
function play(position, point) {
  const previous = position.history.at(-1);
  const move = inspectMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previous ? getBoardHash(previous.board) : null);
  assert.equal(move.legal, true);
  return recordMove(position, move.result.newBoard, point, move.result.captured, false);
}

test('each course exercise demonstrates its own complete position with legal single-move frames', () => {
  for (const exercise of curriculumExercises) {
    const before = JSON.stringify(exercise.position);
    const frames = createExerciseDemonstration(exercise);
    assert.ok(frames.length >= 2, exercise.id);
    assert.equal(frames[0].position, exercise.position, exercise.id);
    assert.equal(frames[0].text, exercise.prompt);
    for (let i = 1; i < frames.length; i++) {
      const previous = frames[i - 1].position, current = frames[i].position;
      if (exercise.kind === 'number') {
        assert.equal(current, previous, 'counting explains the same complete position');
        continue;
      }
      assert.equal(current.history.length, previous.history.length + 1, exercise.id);
      const replayed = play(previous, current.lastMove);
      assert.equal(getBoardHash(replayed.board), getBoardHash(current.board));
      assert.equal(replayed.currentPlayer, current.currentPlayer);
      assert.equal(replayed.blackCaptures, current.blackCaptures);
      assert.equal(replayed.whiteCaptures, current.whiteCaptures);
      assert.ok(frames[i].text.length);
    }
    assert.equal(JSON.stringify(exercise.position), before, `${exercise.id}: demonstration must not mutate the root`);
  }
});

test('snapback keeps the learner color and eye repair demonstrates the exact first and second boards', () => {
  const snapback = createExerciseDemonstration(find('tactics.snapback.1'));
  assert.equal(snapback[0].position.currentPlayer, 'black');
  assert.equal(snapback[1].position.board[0][0].color, 'black');
  assert.equal(snapback[2].position.whiteCaptures, 1);
  assert.equal(snapback[3].position.blackCaptures, 3);
  for (const [id, expected] of [['life.make-two-eyes.1', { x: 5, y: 2 }], ['life.make-two-eyes.2', { x: 4, y: 0 }]]) {
    const exercise = find(id), frames = createExerciseDemonstration(exercise);
    assert.equal(frames[0].position.board, exercise.position.board);
    assert.deepEqual(frames.at(-1).position.lastMove, expected);
  }
});

test('a demonstration uses only a complete verified branch and declines unavailable answers', () => {
  const exercise = find('tactics.snapback.1');
  assert.deepEqual(createExerciseDemonstration({ ...exercise, solution: [] }), []);
  assert.deepEqual(createExerciseDemonstration({ ...exercise, minimumCaptures: 99 }), []);
  assert.deepEqual(createExerciseDemonstration({ ...exercise, solution: [{ point: { x: 1, y: 0 } }] }), []);
  assert.deepEqual(createExerciseDemonstration({ ...exercise, kind: 'choice', choices: [], correctChoiceId: '' }), []);
  const choices = [{ point: { x: 1, y: 0 } }, ...exercise.solution];
  assert.equal(createExerciseDemonstration({ ...exercise, solution: choices }).at(-1).position.blackCaptures, 3);
});

test('counting demonstrations mark real distinct liberties or territory without playing or changing turns', () => {
  const base = { ...find('tactics.escape-atari.1'), kind: 'number', prompt: '数一数。' };
  const liberties = { ...base, position: exercisePosition(['.....', '.....', '.XX..', '.....', '.....']),
    rubric: { kind: 'liberties', anchor: { x: 1, y: 2 } } };
  const libertyFrames = createExerciseDemonstration(liberties);
  assert.equal(libertyFrames.length, 2);
  assert.equal(libertyFrames[0].position, liberties.position);
  assert.equal(libertyFrames[1].position, liberties.position);
  assert.deepEqual(libertyFrames[0].points, [{ x: 1, y: 2 }]);
  assert.equal(libertyFrames[1].points.length, 6);
  assert.equal(new Set(libertyFrames[1].points.map(point => `${point.x},${point.y}`)).size, 6);
  assert.match(libertyFrames[1].text, /6 个不同/);
  const territory = { ...base, position: exercisePosition(['X.X.X', 'XXXXX', '.....', 'OOOOO', 'O.O.O']),
    rubric: { kind: 'territory', color: 'black' } };
  const territoryFrames = createExerciseDemonstration(territory);
  assert.equal(territoryFrames[1].position, territory.position);
  assert.deepEqual(territoryFrames[1].points, [{ x: 1, y: 0 }, { x: 3, y: 0 }]);
  assert.match(territoryFrames[1].text, /黑方围住 2/);
  assert.deepEqual(createExerciseDemonstration({ ...liberties, rubric: { kind: 'liberties', anchor: { x: 0, y: 0 } } }), []);
});

test('demonstration marks the explained target and each newly played move without leaking the answer in its first frame', () => {
  const exercise = find('life.make-two-eyes.1');
  const frames = createExerciseDemonstration(exercise);
  assert.deepEqual(frames[0].points, [exercise.rubric.anchor]);
  assert.deepEqual(frames[1].points, [{ x: 5, y: 2 }]);
  const sequence = createExerciseDemonstration(find('tactics.snapback.1'));
  assert.equal(sequence[0].points, undefined);
  for (const frame of sequence.slice(1)) assert.deepEqual(frame.points, [frame.position.lastMove]);
});

test('sequence guidance follows the played branch and second-step hints never mark the opening move', () => {
  const exercise = find('tactics.ladder.1');
  assert.deepEqual(getExerciseGuidance(exercise, [], exercise.position, 0).points, []);
  const first = [{ x: 3, y: 2 }];
  const firstPosition = gradeExercise(exercise, { kind: 'sequence', points: first }).nextPosition;
  const reminder = getExerciseGuidance(exercise, first, firstPosition, 1);
  assert.notEqual(reminder.hint, exercise.hints[0]);
  assert.match(reminder.hint, /应手|局面/);
  assert.deepEqual(reminder.points, []);
  const next = getExerciseGuidance(exercise, first, firstPosition, 2);
  assert.deepEqual(next.points, [{ x: 2, y: 0 }]);
  assert.deepEqual(next.focusPoint, { x: 2, y: 0 });
  const alternate = [...first, { x: 3, y: 1 }];
  const alternatePosition = gradeExercise(exercise, { kind: 'sequence', points: alternate }).nextPosition;
  const branchHint = getExerciseGuidance(exercise, alternate, alternatePosition, 2);
  assert.deepEqual(branchHint.points, [{ x: 1, y: 0 }], 'alternate branch must not use the demonstration main line at (4,1)');
});

test('guidance never marks original answers on unknown, completed or mismatched current positions', () => {
  const exercise = find('tactics.capture-direction.1');
  const moves = [{ x: 4, y: 4 }];
  const unknown = gradeExercise(exercise, { kind: 'sequence', points: moves });
  for (const hints of [0, 1, 2]) {
    const guidance = getExerciseGuidance(exercise, moves, unknown.nextPosition, hints);
    assert.deepEqual(guidance.points, []);
    assert.equal(guidance.focusPoint, undefined);
  }
  const first = [{ x: 2, y: 0 }];
  assert.deepEqual(getExerciseGuidance(exercise, first, exercise.position, 2).points, []);
  const completed = [...first, { x: 0, y: 1 }];
  const finalPosition = gradeExercise(exercise, { kind: 'sequence', points: completed }).nextPosition;
  assert.deepEqual(getExerciseGuidance(exercise, completed, finalPosition, 2).points, []);
  const pointExercise = find('life.make-two-eyes.1');
  const altered = play(pointExercise.position, { x: 4, y: 2 });
  assert.deepEqual(getExerciseGuidance(pointExercise, [], altered, 2).points, []);
});

test('point and number guidance keeps target markers separate from answer markers, including white learners', () => {
  const original = find('tactics.escape-atari.1');
  const white = { ...original, position: exercisePosition(['..O....', '.OX....', '.XOX...', '.X.X...', '.......', '.......', '.......'], 'white') };
  assert.deepEqual(getExerciseGuidance(white, [], white.position, 0).points, [{ x: 2, y: 2 }]);
  const answer = getExerciseGuidance(white, [], white.position, 2);
  assert.deepEqual(answer.points, [{ x: 3, y: 1 }]);
  assert.deepEqual(answer.focusPoint, { x: 3, y: 1 });
  const number = { ...original, kind: 'number', position: exercisePosition(['.....', '.....', '.XX..', '.....', '.....']),
    rubric: { kind: 'liberties', anchor: { x: 1, y: 2 } } };
  const before = JSON.stringify(number.position);
  assert.deepEqual(getExerciseGuidance(number, [], number.position, 0).points, [{ x: 1, y: 2 }]);
  assert.deepEqual(getExerciseGuidance(number, [], number.position, 1).points, [{ x: 1, y: 2 }]);
  assert.equal(getExerciseGuidance(number, [], number.position, 2).points.length, 6);
  assert.equal(JSON.stringify(number.position), before);
  const connect = { ...original, rubric: { kind: 'connect', anchors: [{ x: 2, y: 0 }, { x: 2, y: 2 }] } };
  assert.deepEqual(getExerciseGuidance(connect, [], connect.position, 0).points, connect.rubric.anchors);
});

test('an unrecorded legal move receives an opponent reply and permits another full trial round', () => {
  const exercise = find('tactics.capture-direction.1');
  const grade = gradeExercise(exercise, { kind: 'sequence', points: [{ x: 4, y: 4 }] });
  assert.equal(grade.outcome, 'unverified');
  assert.equal(grade.nextPosition.currentPlayer, 'white');
  const root = JSON.stringify(exercise.position);
  const reply = replyToExerciseDeviation(grade.nextPosition, 'black');
  assert.equal(reply.position.currentPlayer, 'black');
  assert.equal(reply.position.history.length, 2);
  assert.match(reply.explanation, /试下/);
  assert.equal('outcome' in reply, false, 'ordinary AI play must not claim a verified exercise result');
  const nextPoint = reply.position.board.flatMap((row, y) => row.map((_, x) => ({ x, y }))).find(point =>
    inspectMove(reply.position.board, point.x, point.y, 'black', 'Go', getBoardHash(reply.position.history.at(-1).board)).legal);
  const trial = playExerciseExploration(reply.position, nextPoint, 'black');
  assert.equal(trial.accepted, true);
  assert.equal(trial.position.currentPlayer, 'black');
  assert.equal(trial.position.history.length, 4);
  assert.equal('outcome' in trial, false);
  assert.deepEqual(undoPosition(trial.position, 2), reply.position);
  assert.equal(JSON.stringify(exercise.position), root);
});

test('an authored refutation is retained and never receives an extra AI move', () => {
  const exercise = find('tactics.escape-atari.1');
  const grade = gradeExercise(exercise, { kind: 'point', point: { x: 2, y: 3 } });
  assert.equal(grade.nextPosition.whiteCaptures, 2);
  assert.equal(grade.nextPosition.history.length, 2);
  const reply = replyToExerciseDeviation(grade.nextPosition, 'black');
  assert.equal(reply.position, grade.nextPosition);
});

test('trial input rejects occupied, suicide, out of bounds and wrong-turn moves without altering any position fields', () => {
  const position = exercisePosition(['.O...', 'O.O..', '.O...', '.....', '.....']);
  for (const point of [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: -1, y: 0 }]) {
    const result = playExerciseExploration(position, point, 'black');
    assert.equal(result.accepted, false);
    assert.equal(result.position, position);
    assert.ok(result.explanation.length);
  }
  const wrongTurn = playExerciseExploration(position, { x: 4, y: 4 }, 'white');
  assert.equal(wrongTurn.accepted, false);
  assert.equal(wrongTurn.position, position);
});

test('trial mode keeps ko history, captures and white learner perspective', () => {
  const beforeKo = exercisePosition(['.XO..', 'XO.O.', '.XO..', '.....', '.....']);
  const ko = play(beforeKo, { x: 2, y: 1 });
  const forbidden = playExerciseExploration(ko, { x: 1, y: 1 }, 'white');
  assert.equal(forbidden.accepted, false);
  assert.equal(forbidden.position, ko);
  assert.match(forbidden.explanation, /劫/);
  const position = exercisePosition(['.O...', 'OXO..', '.....', '.....', '.....'], 'white');
  position.blackCaptures = 4; position.whiteCaptures = 6;
  const result = playExerciseExploration(position, { x: 1, y: 2 }, 'white');
  assert.equal(result.accepted, true);
  assert.equal(result.position.currentPlayer, 'white');
  assert.ok(result.position.whiteCaptures >= 7);
  assert.ok(result.position.blackCaptures >= 4);
  assert.equal(result.position.history[0].whiteCaptures, 6);
});

test('a full board makes the opponent pass without accepting the AI occupied-center fallback', () => {
  const full = exercisePosition(['XXX', 'XXX', 'XXX'], 'white');
  const reply = replyToExerciseDeviation(full, 'black');
  assert.equal(reply.position.board, full.board);
  assert.equal(reply.position.currentPlayer, 'black');
  assert.equal(reply.position.consecutivePasses, 1);
  assert.equal(reply.position.history.length, 1);
  assert.equal(reply.position.history[0].move, null);
  assert.match(reply.explanation, /停一手/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { curriculumLessons, curriculumExercises, curriculumConcepts, gradeExercise, exercisePosition, applyExerciseGrade,
  inspectMove, getBoardHash, getAllGroups, getGroup, recordMove, recordPass } = await loadTestModule({ contents: `
  export { curriculumLessons, curriculumExercises, curriculumConcepts } from './domains/coach/curriculumDrafts';
  export { gradeExercise, exercisePosition, applyExerciseGrade } from './domains/coach/exercise';
  export { inspectMove } from './core/go/rules';
  export { getBoardHash, getAllGroups, getGroup } from './core/board';
  export { recordMove, recordPass } from './domains/game/positionState';
` });
const find = id => curriculumExercises.find(item => item.id === `go.${id}`);
const point = (exercise, x, y) => gradeExercise(exercise, { kind: 'point', point: { x, y } });
const sequence = (exercise, ...points) => gradeExercise(exercise, { kind: 'sequence', points: points.map(([x, y]) => ({ x, y })) });
const fixture = (rows, rubric) => ({ kind: 'point', position: exercisePosition(rows), rubric,
  explanation: '检查整块棋。', hints: ['先看相邻空点。', '再看提子后的棋盘。'] });
const capture = () => fixture(['.X...', 'XOX..', '.....', '.....', '.....'], { kind: 'capture', minimum: 1 });
function played(position, x, y) {
  const previous = position.history.at(-1);
  const move = inspectMove(position.board, x, y, position.currentPlayer, 'Go', previous ? getBoardHash(previous.board) : null);
  return move.legal ? recordMove(position, move.result.newBoard, { x, y }, move.result.captured, false) : null;
}

test('board-led course connects first moves, complete rules and local tactics in prerequisite order', () => {
  const required = ['rules.place-turn', 'rules.groups-liberties', 'rules.capture',
    'basics.connect', 'basics.atari', 'basics.escape', 'rules.suicide', 'rules.ko', 'life.two-eyes', 'rules.territory-dead',
    'tactics.escape-atari', 'tactics.capture-direction', 'tactics.double-atari',
    'tactics.ladder', 'tactics.snapback', 'life.make-two-eyes'].map(id => `go.${id}`);
  assert.deepEqual(curriculumLessons.map(item => item.id), required);
  const seen = new Set();
  for (const item of curriculumLessons) {
    assert.equal(item.reviewStatus, 'original-draft', 'rule checks cannot impersonate teacher review');
    assert.equal(item.validation, 'rules-checked');
    assert.ok(item.sources.length);
    for (const source of item.sources) assert.match(source.url, /^https:\/\/(www\.nihonkiin\.or\.jp|www\.weiqi-pandanet\.cn)\//);
    for (const prerequisite of item.prerequisites) assert.ok(seen.has(prerequisite), `${item.id} precedes ${prerequisite}`);
    assert.ok(item.demonstration.steps.length >= 2);
    assert.equal(item.demonstration.steps[0].point, undefined);
    assert.equal(item.exercises.length, 2);
    seen.add(item.id);
  }
  assert.equal(curriculumExercises.length, 32);
  assert.equal(curriculumExercises.filter(item => item.kind === 'sequence').length, 10);
  assert.equal(curriculumExercises.filter(item => item.kind === 'number').length, 4);
  assert.equal(curriculumExercises.some(item => item.kind === 'choice'), false);
  assert.equal(new Set(curriculumExercises.map(item => item.id)).size, curriculumExercises.length);
  assert.equal(find('tactics.snapback.1').familyId, 'go.tactics.snapback.board-1', 'retained shape keeps its previous exposure identity');
  assert.equal(find('tactics.snapback.1').familyId, find('tactics.snapback.2').familyId, 'same-shape expansion is not transfer evidence');
  assert.notEqual(find('tactics.escape-atari.1').familyId, 'go.tactics.escape-atari.situation-1', 'new countercapture problem is not the old straight-extension task');
  const sectionOrder = curriculumLessons.map(item => item.section);
  assert.deepEqual(sectionOrder, [...sectionOrder].sort(), 'course directory grouping and next-lesson order agree');
  const placement = curriculumConcepts.find(item => item.id === 'go.rules.place-turn');
  assert.match(placement.concept, /交叉点/);
  assert.deepEqual(Object.keys(placement).sort(), ['concept', 'id', 'misconception']);
  assert.equal(new Set(curriculumConcepts.map(item => item.id)).size, curriculumConcepts.length);
});

test('every optional demonstration replays through real rules without mutating its root', () => {
  for (const lesson of curriculumLessons) {
    let position = lesson.demonstration.position;
    const before = JSON.stringify(position);
    for (const step of lesson.demonstration.steps) {
      if (!step.point) continue;
      if (step.expectedRejection) {
        const previous = position.history.at(-1);
        const move = inspectMove(position.board, step.point.x, step.point.y, position.currentPlayer, 'Go', previous ? getBoardHash(previous.board) : null);
        assert.equal(move.legal, false, lesson.id);
        assert.equal(move.reason, step.expectedRejection, lesson.id);
        continue;
      }
      const next = played(position, step.point.x, step.point.y);
      assert.ok(next, `${lesson.id} ${JSON.stringify(step.point)}`);
      position = next;
    }
    assert.equal(JSON.stringify(lesson.demonstration.position), before);
  }
});

test('all authored boards start with live chains and every recorded continuation reaches the capture target', () => {
  for (const exercise of curriculumExercises) {
    const before = JSON.stringify(exercise.position);
    for (const group of getAllGroups(exercise.position.board)) assert.ok(group.liberties > 0, `${exercise.id}: zero-liberty starting chain`);
    if (exercise.kind === 'point') {
      let successes = 0;
      for (let y = 0; y < exercise.position.board.length; y++) for (let x = 0; x < exercise.position.board.length; x++) {
        if (point(exercise, x, y).outcome === 'success') successes++;
      }
      assert.ok(successes > 0, exercise.id);
      assert.equal(point(exercise, -1, 0).outcome, 'failure');
    } else if (exercise.kind === 'sequence') {
      const walk = (nodes, prefix = []) => {
        for (const node of nodes) {
          const points = [...prefix, [node.point.x, node.point.y]];
          const result = sequence(exercise, ...points);
          assert.equal(result.outcome, node.next?.length ? 'continue' : 'success', `${exercise.id} ${JSON.stringify(points)}`);
          if (node.next?.length) walk(node.next, points);
        }
      };
      walk(exercise.solution);
    } else if (exercise.kind === 'number') {
      const successes = [];
      for (let value = 0; value <= exercise.position.board.length ** 2; value++) {
        if (gradeExercise(exercise, { kind: 'number', value }).outcome === 'success') successes.push(value);
      }
      assert.equal(successes.length, 1, `${exercise.id}: one board-derived count`);
    }
    assert.equal(JSON.stringify(exercise.position), before);
  }
});

test('countercapture and wall repair have independently specified answers; adding support creates another correct escape', () => {
  const expected = { 'tactics.escape-atari.1': [[3, 1]], 'tactics.escape-atari.2': [[3, 1], [2, 3]],
    'life.make-two-eyes.1': [[5, 2]], 'life.make-two-eyes.2': [[4, 0]] };
  for (const [id, intersections] of Object.entries(expected)) {
    const exercise = find(id), actual = [];
    for (let y = 0; y < exercise.position.board.length; y++) for (let x = 0; x < exercise.position.board.length; x++) {
      if (point(exercise, x, y).outcome === 'success') actual.push([x, y]);
    }
    assert.deepEqual(actual, intersections, id);
  }
  const wrong = point(find('tactics.escape-atari.1'), 2, 3);
  assert.equal(wrong.outcome, 'failure');
  assert.equal(wrong.nextPosition.whiteCaptures, 2);
  assert.equal(wrong.nextPosition.board[2][2], null);
  assert.equal(point(find('tactics.escape-atari.2'), 2, 3).outcome, 'success');
});

test('all legal white replies to double atari leave an immediate capture; completion waits for the student to take it', () => {
  for (const id of ['tactics.double-atari.1', 'tactics.double-atari.2']) {
    const exercise = find(id);
    const attacked = played(exercise.position, 2, 1);
    assert.ok(attacked);
    const replies = [recordPass(attacked)];
    for (let y = 0; y < attacked.board.length; y++) for (let x = 0; x < attacked.board.length; x++) {
      const reply = played(attacked, x, y);
      if (reply) replies.push(reply);
    }
    for (const reply of replies) {
      let captureAvailable = false;
      for (let y = 0; y < reply.board.length; y++) for (let x = 0; x < reply.board.length; x++) {
        const next = played(reply, x, y);
        if (next && next.blackCaptures > reply.blackCaptures) captureAvailable = true;
      }
      assert.ok(captureAvailable, `${id}: reply ${JSON.stringify(reply.lastMove)} saved both targets`);
    }
    const first = sequence(exercise, [2, 1]);
    assert.equal(first.outcome, 'continue');
    assert.equal(first.nextPosition.blackCaptures, 0);
  }
  assert.equal(sequence(find('tactics.double-atari.1'), [2, 1], [3, 2]).outcome, 'success');
  assert.equal(sequence(find('tactics.double-atari.2'), [2, 1], [1, 2]).outcome, 'success');
});

test('chasing stays unfinished after several correct moves and accepts alternate recorded chasing directions', () => {
  const short = find('tactics.ladder.1');
  assert.equal(sequence(short, [3, 2], [2, 0], [4, 1]).outcome, 'continue');
  for (const path of [[[3, 2], [2, 0], [4, 1], [4, 0]], [[3, 2], [3, 1], [1, 0], [4, 0]], [[3, 2], [3, 1], [3, 0], [0, 0]]]) {
    const completed = sequence(short, ...path);
    assert.equal(completed.outcome, 'success');
    assert.equal(completed.nextPosition.blackCaptures, 4);
  }
  const long = find('tactics.ladder.2');
  const prefix = [[4, 3], [3, 1], [5, 2], [4, 0], [6, 1]];
  assert.equal(sequence(long, ...prefix).outcome, 'continue');
  assert.equal(sequence(long, ...prefix, [6, 0]).nextPosition.blackCaptures, 6);
  const wrong = sequence(short, [2, 1]);
  assert.equal(wrong.outcome, 'failure');
  assert.equal(getGroup(wrong.nextPosition.board, { x: 2, y: 2 }).liberties, 3);
  assert.equal(sequence(short, [4, 4]).outcome, 'unverified', 'unrecorded legal alternatives are not called bad moves');
});

test('cutting support precedes chasing, and the wrong direction really connects white to more liberties', () => {
  const exercise = find('tactics.capture-direction.1');
  const first = sequence(exercise, [2, 0]);
  assert.equal(first.outcome, 'continue');
  assert.equal(first.nextPosition.history.length, 2);
  assert.equal(first.nextPosition.currentPlayer, 'black');
  assert.equal(first.nextPosition.board[0][0].color, 'white');
  assert.equal(sequence(exercise, [2, 0], [0, 1]).nextPosition.blackCaptures, 2);
  const wrong = sequence(exercise, [0, 0]);
  assert.equal(wrong.outcome, 'failure');
  assert.equal(getGroup(wrong.nextPosition.board, { x: 1, y: 0 }).liberties, 3);
  assert.equal(sequence(exercise, [4, 4]).outcome, 'unverified');
});

test('eye repair preserves one eye and closes the other; filling inside allows white to enter the gap', () => {
  const exercise = find('life.make-two-eyes.1');
  assert.equal(point(exercise, 5, 2).outcome, 'success');
  const failure = point(exercise, 4, 2);
  assert.equal(failure.outcome, 'failure');
  assert.equal(failure.nextPosition.board[2][5].color, 'white');
  assert.equal(getGroup(failure.nextPosition.board, { x: 1, y: 1 }).liberties, 1);
  const joinedSpace = fixture(['OOOOOOO', 'OXXXXXO', 'OX...XO', 'OXXXXXO', 'OOOOOOO', '.......', '.......'], { kind: 'two-eyes', anchor: { x: 1, y: 1 } });
  assert.equal(point(joinedSpace, 2, 2).outcome, 'failure', 'two adjacent empty points remain one space');
  assert.equal(point(joinedSpace, 3, 2).outcome, 'success');
  const open = fixture(['.....', '..X..', '.X.X.', '..X..', '.....'], { kind: 'two-eyes', anchor: { x: 2, y: 1 } });
  assert.equal(point(open, 1, 1).outcome, 'failure', 'many liberties do not prove two eyes');
  const falseEye = fixture(['.O...', 'OXO..', 'X.X..', 'XXX..', '.....'], { kind: 'two-eyes', anchor: { x: 0, y: 2 } });
  assert.equal(point(falseEye, 4, 4).outcome, 'failure', 'a disconnected wall does not prove an eye');
});

test('snapback checks actual captures in both colors, excludes ko, and rejects too-large targets or extra answers', () => {
  const exercise = find('tactics.snapback.1');
  const first = sequence(exercise, [0, 0]);
  assert.equal(first.outcome, 'continue');
  assert.equal(first.nextPosition.whiteCaptures, 1);
  assert.equal(first.nextPosition.blackCaptures, 0);
  const completed = sequence(exercise, [0, 0], [0, 0]);
  assert.equal(completed.outcome, 'success');
  assert.equal(completed.nextPosition.blackCaptures, 3);
  assert.equal(completed.nextPosition.whiteCaptures, 1);
  assert.equal(completed.nextPosition.history.length, 3);
  assert.equal(sequence(exercise, [0, 0], [0, 0], [4, 4]).outcome, 'unverified');
  assert.equal(sequence({ ...exercise, minimumCaptures: 4 }, [0, 0], [0, 0]).outcome, 'unverified');
  const white = { ...exercise, position: exercisePosition(['.XO..', '.XO..', 'OO...', '.....', '.....'], 'white') };
  const whiteCompleted = sequence(white, [0, 0], [0, 0]);
  assert.equal(whiteCompleted.outcome, 'success');
  assert.equal(whiteCompleted.nextPosition.whiteCaptures, 3);
  assert.equal(whiteCompleted.nextPosition.blackCaptures, 1);
});

test('rule rubrics count shared liberties and territory from independent fixtures', () => {
  const examples = [
    { ...fixture(['.....', '.....', '.XX..', '.....', '.....'], { kind: 'liberties', anchor: { x: 1, y: 2 } }), kind: 'number', answer: 6 },
    { ...fixture(['XX...', 'X....', '.....', '.....', '.....'], { kind: 'liberties', anchor: { x: 0, y: 0 } }), kind: 'number', answer: 3 },
    { ...fixture(['X.X.X', 'XXXXX', '.....', 'OOOOO', 'O.O.O'], { kind: 'territory', color: 'black' }), kind: 'number', answer: 2 },
  ];
  for (const exercise of examples) {
    assert.equal(gradeExercise(exercise, { kind: 'number', value: exercise.answer }).outcome, 'success');
    assert.equal(gradeExercise(exercise, { kind: 'number', value: exercise.answer + 1 }).outcome, 'failure');
    assert.equal(gradeExercise(exercise, { kind: 'number', value: -1 }).outcome, 'unverified');
  }
  const atari = fixture(['.X...', 'XO...', '.....', '.....', '.....'], { kind: 'atari', anchor: { x: 1, y: 1 } });
  assert.equal(point(atari, 2, 1).outcome, 'success');
  assert.equal(point(atari, 4, 4).outcome, 'failure');
  const connection = fixture(['.....', '.X...', '..X..', '.....', '.....'], { kind: 'connect', anchors: [{ x: 1, y: 1 }, { x: 2, y: 2 }] });
  assert.equal(point(connection, 2, 1).outcome, 'success');
  assert.equal(point(connection, 1, 2).outcome, 'success');
  assert.equal(point(connection, 4, 4).outcome, 'failure');
});

test('taking two target chains is capture, not cutting between surviving chains', () => {
  const exercise = fixture(['XOX..', 'X.X..', 'XOX..', '.X...', '.....'], { kind: 'cut', anchors: [{ x: 1, y: 0 }, { x: 1, y: 2 }] });
  for (const group of getAllGroups(exercise.position.board)) assert.ok(group.liberties > 0);
  const move = inspectMove(exercise.position.board, 1, 1, 'black');
  assert.equal(move.legal, true);
  assert.equal(move.result.captured, 2);
  assert.equal(point(exercise, 1, 1).outcome, 'failure');
});

test('ko preserves predecessor and suicide is checked after captures', () => {
  const before = exercisePosition(['.XO..', 'XO.O.', '.XO..', '.....', '.....']);
  const position = played(before, 2, 1);
  assert.ok(position);
  const exercise = { ...capture(), position };
  assert.equal(point(exercise, 1, 1).outcome, 'failure');
  assert.match(point(exercise, 1, 1).explanation, /劫/);
  assert.equal(point({ ...exercise, position: { ...position, history: [] } }, 1, 1).outcome, 'success');
  const suicide = fixture(['.O...', 'O.O..', '.O...', '.....', '.....'], { kind: 'legal' });
  assert.equal(point(suicide, 1, 1).outcome, 'failure');
  assert.equal(point(suicide, 1, 0).outcome, 'failure', 'occupied intersection');
  const canCapture = fixture(['.X...', 'XOX..', 'O.O..', '.O...', '.....'], { kind: 'capture', minimum: 1 });
  assert.equal(point(canCapture, 1, 2).outcome, 'success');
});

test('ordinary capture misses report actual results and commits remain bound to their private starting position', () => {
  const exercise = capture();
  const miss = point(exercise, 4, 4);
  assert.match(miss.explanation, /本手提掉 0 子/);
  assert.match(miss.explanation, /目标至少 1 子/);
  const grade = point(exercise, 1, 2);
  let position = exercise.position;
  const access = { readPosition: () => position, writePosition: next => { position = next; } };
  assert.equal(applyExerciseGrade(access, exercise, grade), true);
  assert.equal(position.currentPlayer, 'white');
  assert.equal(position.blackCaptures, 1);
  assert.equal(position.history.length, 1);
  assert.equal(exercise.position.blackCaptures, 0);
  assert.equal(applyExerciseGrade(access, exercise, grade), false);
});

test('legacy imported choice exercises retain strict IDs and answer-kind validation', () => {
  const exercise = { ...capture(), kind: 'choice', choices: [{ id: 'yes', label: '是' }], correctChoiceId: 'yes' };
  assert.equal(gradeExercise(exercise, { kind: 'choice', choiceId: 'yes' }).outcome, 'success');
  assert.equal(gradeExercise(exercise, { kind: 'choice', choiceId: 'other' }).outcome, 'unverified');
  assert.equal(gradeExercise(exercise, { kind: 'number', value: 1 }).outcome, 'unverified');
});

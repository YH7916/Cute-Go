import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { sourceLessons, sourceSections, gradeExercise, createExerciseDemonstration } = await loadTestModule({ contents: `
  export { sourceLessons, sourceSections } from './domains/coach/sourceCurriculum';
  export { gradeExercise } from './domains/coach/exercise';
  export { createExerciseDemonstration } from './domains/coach/exerciseInteraction';
` });
const source = JSON.parse(await readFile(new URL('../third_party/ogs-learning/catalog.json', import.meta.url), 'utf8'));
const ggg = JSON.parse(await readFile(new URL('../third_party/go-game-guru/problems.json', import.meta.url), 'utf8'));
const exercises = sourceLessons.flatMap((lesson) => lesson.exercises);
const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
const samePoint = (point) => point ? `${point.x},${point.y}` : 'pass';

function correctPath(nodes) {
  for (const node of nodes) {
    if (node.wrong) continue;
    if (node.correct) return [node];
    const tail = correctPath(node.children);
    if (tail) return [node, ...tail];
  }
  return null;
}
function markedPaths(nodes, verdict, prefix = []) {
  return nodes.flatMap((node) => {
    const line = [...prefix, node.point];
    return [...(node[verdict] ? [line.map(samePoint).join('/')] : []), ...markedPaths(node.children, verdict, line)];
  });
}
function nodesOf(nodes) { return nodes.flatMap((node) => [node, ...nodesOf(node.children)]); }

test('source curriculum has 29 ordered lessons and 114 stable source families', () => {
  assert.equal(sourceLessons.length, 29);
  assert.equal(exercises.length, 114);
  assert.equal(new Set(exercises.map((exercise) => exercise.familyId)).size, 114);
  assert.deepEqual(sourceSections.map((section) => section.id), ['ogs-stage-1', 'ogs-stage-2', 'ogs-stage-3', 'ggg-practice']);
  assert.equal(sourceLessons.find((lesson) => lesson.id === 'go.rules.capture').exercises[0].id, 'ogs-capture_stone-page01');
  assert.equal(sourceLessons.find((lesson) => lesson.id === 'go.tactics.escape-atari').exercises[0].id, 'ogs-escape-page01');
  const seen = new Set();
  for (const lesson of sourceLessons) {
    assert.equal(lesson.reviewStatus, 'source-adapted');
    for (const prerequisite of lesson.prerequisites) assert.ok(seen.has(prerequisite), `${lesson.id}: unavailable prerequisite`);
    seen.add(lesson.id);
    for (const exercise of lesson.exercises) {
      assert.equal(exercise.skillId, lesson.skillId);
      assert.equal(exercise.familyId, exercise.id);
      assert.ok(exercise.sources.length);
      assert.doesNotMatch(exercise.prompt, /https?:\/\//);
    }
  }
});

test('all OGS normalized positions and every explicit verdict survive adaptation', () => {
  for (const page of source.sections.flatMap((section) => section.lessons.flatMap((lesson) => lesson.pages))) {
    const exercise = byId.get(page.id);
    assert.ok(exercise, page.id);
    assert.equal(exercise.position.board.length, page.position.height);
    assert.equal(exercise.position.currentPlayer, page.position.initialPlayer);
    for (const color of ['black', 'white']) for (const point of page.position[color]) {
      assert.equal(exercise.position.board[point.y][point.x].color, color, page.id);
    }
    const stoneCount = exercise.position.board.flat().filter(Boolean).length;
    assert.equal(stoneCount, page.position.black.length + page.position.white.length);
    if (page.answer.kind === 'move-tree') {
      assert.equal(exercise.kind, 'variation');
      for (const verdict of ['correct', 'wrong']) {
        const expected = [...new Set(page.answer[verdict].map((line) => line.map(samePoint).join('/')))].sort();
        assert.deepEqual(markedPaths(exercise.solution, verdict).sort(), expected, `${page.id}: ${verdict}`);
      }
    }
  }
});

test('every adapted variation has a legal same-board demonstration and a playable success path', () => {
  for (const exercise of exercises.filter((item) => item.kind === 'variation')) {
    const snapshot = JSON.stringify(exercise.position);
    const frames = createExerciseDemonstration(exercise);
    assert.ok(frames.length > 1, exercise.id);
    assert.equal(JSON.stringify(frames[0].position), snapshot, exercise.id);
    const path = correctPath(exercise.solution);
    assert.ok(path, exercise.id);
    const points = path.filter((node) => node.color === exercise.position.currentPlayer).map((node) => node.point);
    assert.ok(points.every(Boolean), `${exercise.id}: unsupported learner pass`);
    assert.equal(gradeExercise(exercise, { kind: 'variation', points }).outcome, 'success', exercise.id);
    assert.equal(JSON.stringify(exercise.position), snapshot, `${exercise.id}: source setup mutated`);
  }
});

test('choices use original options; source actions require the appropriate action and exact dead stones', () => {
  for (const exercise of exercises.filter((item) => item.kind === 'choice')) {
    for (const choice of exercise.choices) {
      const expected = exercise.correctChoiceIds.includes(choice.id) ? 'success' : 'failure';
      assert.equal(gradeExercise(exercise, { kind: 'choice', choiceId: choice.id }).outcome, expected, exercise.id);
    }
    assert.notEqual(exercise.hints[0], exercise.prompt, 'a hint must add an observation direction');
  }
  const removal = byId.get('ogs-ending-the-game-page02');
  assert.equal(gradeExercise(removal, { kind: 'action', action: 'remove', points: removal.expectedPoints }).outcome, 'success');
  assert.equal(gradeExercise(removal, { kind: 'action', action: 'remove', points: removal.expectedPoints.slice(1) }).outcome, 'failure');
  assert.equal(gradeExercise(removal, { kind: 'action', action: 'pass', points: [] }).outcome, 'unverified');
  assert.match(byId.get('ogs-ending-the-game-page01').prompt, /点击“停一手”/);
  for (const id of ['ogs-territory-page01', 'ogs-count-territory-page01', 'ogs-ending-the-game-page03']) {
    assert.match(byId.get(id).teachingNotes, /地盘[＋加]提子/);
  }
});

test('GGG annotations, unknown leaves and per-node board labels remain distinct', () => {
  for (const problem of ggg.problems) {
    const exercise = byId.get(problem.id);
    const sourceNodes = nodesOf(problem.root.children);
    const adapted = nodesOf(exercise.solution);
    assert.equal(adapted.length, sourceNodes.length, problem.id);
    for (let index = 0; index < sourceNodes.length; index += 1) {
      assert.equal(adapted[index].correct, sourceNodes[index].correct, problem.id);
      assert.equal(adapted[index].wrong, sourceNodes[index].wrong, problem.id);
      assert.ok(Array.isArray(adapted[index].boardMarks), 'empty marks explicitly clear an earlier annotation');
    }
  }
  const short = byId.get('ggg-easy-25');
  assert.equal(gradeExercise(short, { kind: 'variation', points: [{ x: 14, y: 17 }] }).outcome, 'unverified');
  assert.equal(gradeExercise(short, { kind: 'variation', points: [{ x: 14, y: 18 }] }).outcome, 'success');
  assert.ok(exercises.filter((item) => item.kind === 'variation').some((item) => nodesOf(item.solution).some((node) => node.boardMarks?.some((mark) => mark.label === 'A'))));
});

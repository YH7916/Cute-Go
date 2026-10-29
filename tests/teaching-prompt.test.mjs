import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { ogsLessons, getExerciseGuidance, createExerciseDemonstration, getBoardHash, inspectMove } = await loadTestModule({ contents: `
  export { ogsLessons } from './domains/coach/sourceOgs';
  export { getExerciseGuidance, createExerciseDemonstration } from './domains/coach/exerciseInteraction';
  export { getBoardHash } from './core/board';
  export { inspectMove } from './core/go/rules';
` });
const exercises = ogsLessons.flatMap(lesson => lesson.exercises);
const exercise = id => { const found = exercises.find(item => item.id === id); assert.ok(found, id); return found; };
const archive = readFileSync(new URL('../domains/coach/sourceData/ogs.json', import.meta.url));
const source = JSON.parse(archive);
const rawPages = source.sections.flatMap(section => section.lessons.flatMap(lesson => lesson.pages));
const hash = value => createHash('sha256').update(value).digest('hex');

test('pedagogy edits preserve the raw archive and every source position, answer tree and progress identity', () => {
  assert.equal(exercises.length, 98);
  // Ignore checkout line endings, preserving every archived business field.
  assert.equal(hash(JSON.stringify(source)), 'd17708131a0e44358716f9df84cfe81a390f478b4dfa2f8a58a4093c14930ceb');
  // Captured before editing copy or mark visibility; exclude only presentation fields.
  const invariant = exercises.map(e => ({ id: e.id, familyId: e.familyId, skillId: e.skillId,
    contentRevision: e.contentRevision, kind: e.kind, position: e.position, solution: e.solution,
    choices: e.choices, correctChoiceId: e.correctChoiceId, correctChoiceIds: e.correctChoiceIds,
    action: e.action, expectedPoints: e.expectedPoints, sources: e.sources }));
  // The restored ko capture creates a runtime stone ID; its color/coordinate are the invariant.
  const stable = JSON.stringify(invariant, (key, value) => value && value.color && typeof value.x === 'number'
    && typeof value.y === 'number' && 'id' in value ? { x: value.x, y: value.y, color: value.color } : value);
  assert.equal(hash(stable), '0bef027197f5cf2731210d28567098f9950c0567554cb6fcd57b813dead678a5');
});

test('initial prompts state the task without a second line of solution instructions', () => {
  for (const ex of exercises) {
    assert.doesNotMatch(ex.prompt, /\n|看看 C|B 处假眼|先找劫材|各有两口气|黑棋 24 目/, ex.id);
    assert.ok(ex.prompt.length <= 55, ex.id);
    assert.ok(ex.teachingNotes.length <= 80, ex.id);
    assert.doesNotMatch(ex.teachingNotes, /先在 B|黑棋在 A 落子|A 是真眼|A 是两边|本题两块棋各有/, ex.id);
    if (ex.teachingNotes.includes('\n')) {
      assert.ok(ex.teachingNotes.split('\n').every(line => line.startsWith('- ')), `${ex.id}: independent notes use list items`);
    }
  }
  for (const id of ['ogs-cut-page01', 'ogs-make-alive-page01', 'ogs-net-page01', 'ogs-close_territory-page01']) {
    assert.doesNotMatch(exercise(id).prompt + exercise(id).teachingNotes, /[A-C×]/, id);
  }
  assert.match(exercise('ogs-self-capture-page01').prompt, /白先.*△.*黑棋/);
  assert.match(exercise('ogs-real-false-eye-page01').prompt, /A.*真眼.*假眼/);
  assert.match(exercise('ogs-atari-correct-side-page01').prompt, /A、B.*△/);
  assert.match(exercise('ogs-count-territory-page04').prompt, /数目法/);
});

test('initial marks do not pre-count liberties, number groups or identify the only winning move', () => {
  for (const id of ['ogs-count-liberties-page01', 'ogs-count_chains-page01', 'ogs-connect-page01',
    'ogs-cut-page01', 'ogs-make-alive-page01', 'ogs-close_territory-page01']) {
    assert.deepEqual(exercise(id).boardMarks, [], id);
  }
  for (const id of ['ogs-in_atari-page01', 'ogs-play_double_atari-page01', 'ogs-net-page01']) {
    assert.ok(exercise(id).boardMarks.length > 0, id);
    assert.ok(exercise(id).boardMarks.every(mark => mark.label === '△'), id);
  }
  assert.ok(rawPages.find(page => page.id === 'ogs-count-liberties-page01').position.marks.cross.length === 3);
  assert.ok(rawPages.find(page => page.id === 'ogs-count_chains-page01').position.marks['4']);
});

test('targets, candidate labels and ko history remain available as problem context', () => {
  for (const page of rawPages) {
    const triangles = exercise(page.id).boardMarks.filter(mark => mark.label === '△').map(mark => mark.point);
    assert.deepEqual(triangles, page.position.marks.triangle ?? [], page.id);
  }
  for (const id of ['ogs-eyes-page01', 'ogs-atari-correct-side-page01', 'ogs-snapback-page01']) {
    const marks = exercise(id).boardMarks.filter(mark => mark.label !== '△');
    assert.deepEqual(marks.map(mark => mark.label), ['A', 'B'], id);
  }
  assert.deepEqual(exercise('ogs-self-capture-page01').boardMarks.map(mark => mark.label), ['A', 'B', 'C', '△', '△']);
  assert.deepEqual(exercise('ogs-real-false-eye-page06').boardMarks, [{ point: { x: 6, y: 8 }, label: 'A' }]);
  const ko = exercise('ogs-ko-page05');
  assert.match(ko.prompt, /白棋刚在 1 处提子/);
  assert.ok(ko.boardMarks.some(mark => mark.label === '1' && mark.point.x === 0 && mark.point.y === 10));
  assert.deepEqual(ko.position.lastMove, { x: 0, y: 10 });
  assert.equal(ko.position.whiteCaptures, 1);
  const recapture = inspectMove(ko.position.board, 0, 9, 'black', 'Go', getBoardHash(ko.position.history.at(-1).board));
  assert.equal(recapture.legal, false); assert.equal(recapture.reason, 'ko');
});

test('answer points and totals stay behind explicit hint two or demonstration', () => {
  const choice = exercise('ogs-count-liberties-page01');
  assert.deepEqual(getExerciseGuidance(choice, [], choice.position, 0), { hint: '', points: [] });
  assert.doesNotMatch(getExerciseGuidance(choice, [], choice.position, 1).hint, /3|三口/);
  assert.match(getExerciseGuidance(choice, [], choice.position, 2).hint, /答案.*3/);
  const cut = exercise('ogs-cut-page01');
  assert.deepEqual(getExerciseGuidance(cut, [], cut.position, 0), { hint: '', points: [] });
  assert.deepEqual(getExerciseGuidance(cut, [], cut.position, 1).points, []);
  assert.deepEqual(getExerciseGuidance(cut, [], cut.position, 2).points, [{ x: 3, y: 0 }]);
  const frames = createExerciseDemonstration(cut);
  assert.equal(frames[0].position, cut.position);
  assert.deepEqual(frames[0].boardMarks, []);
  assert.deepEqual(frames[1].points, [{ x: 3, y: 0 }]);
  assert.equal(frames[1].position.board[0][3].color, 'black');
});

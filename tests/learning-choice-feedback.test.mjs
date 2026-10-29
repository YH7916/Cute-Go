import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { ogsLessons, gradeExercise, getGroup, getAllGroups, calculateTerritory, inspectMove } = await loadTestModule({ contents: `
  export { ogsLessons } from './domains/coach/sourceOgs';
  export { gradeExercise } from './domains/coach/exercise';
  export { getGroup, getAllGroups } from './core/board';
  export { calculateTerritory } from './core/go/scoring';
  export { inspectMove } from './core/go/rules';
` });
const exercises = ogsLessons.flatMap(lesson => lesson.exercises);
const exercise = id => { const found = exercises.find(item => item.id === id); assert.ok(found, id); return found; };
const answer = (id, choiceId) => gradeExercise(exercise(id), { kind: 'choice', choiceId });

test('wrong false-eye answer invites a local capture check without giving the verdict', () => {
  const ex = exercise('ogs-real-false-eye-page01'), before = structuredClone(ex.position);
  const grade = answer(ex.id, 'real');
  assert.equal(grade.outcome, 'failure');
  assert.match(grade.explanation, /A 左边.*黑棋.*气/);
  assert.match(grade.explanation, /白棋.*A/);
  assert.doesNotMatch(grade.explanation, /真眼|假眼|最后一口|两颗|正确答案|你选了/);
  const move = inspectMove(ex.position.board, 5, 7, 'white');
  assert.equal(move.legal, true); assert.equal(move.result.captured, 2);
  assert.equal(grade.nextPosition, undefined); assert.deepEqual(ex.position, before);
  const correct = answer(ex.id, 'false');
  assert.equal(correct.outcome, 'success');
  assert.match(correct.explanation, /假眼.*白棋.*A.*提.*左边.*黑子/);
});

test('true-eye feedback explains this shape and does not turn one eye or disconnected stones into a life verdict', () => {
  for (const id of ['ogs-real-false-eye-page03', 'ogs-real-false-eye-page06']) {
    const ex = exercise(id), wrong = answer(id, 'false'), grade = answer(id, 'real');
    assert.equal(wrong.outcome, 'failure');
    assert.match(wrong.explanation, /A/);
    assert.doesNotMatch(wrong.explanation, /真眼|假眼|不能下|正确答案/);
    assert.equal(grade.outcome, 'success'); assert.match(grade.explanation, /真眼/);
    assert.match(grade.explanation, /A.*无气/);
    assert.match(grade.explanation, /一眼.*不等于.*活棋/);
    assert.doesNotMatch(grade.explanation, /永远不能|一定活|没有连成一块.*假眼/);
    const move = inspectMove(ex.position.board, 6, 8, id.endsWith('03') ? 'black' : 'white');
    assert.equal(move.legal, false); assert.equal(move.reason, 'suicide');
  }
  assert.match(answer('ogs-real-false-eye-page06', 'real').explanation, /右上.*空点/);
  assert.equal(inspectMove(exercise('ogs-real-false-eye-page06').position.board, 7, 7, 'white').reason, 'suicide');
});

test('counting retries direct attention without showing totals; success explains the board', () => {
  const liberties = exercise('ogs-count-liberties-page01'), grade = answer(liberties.id, '4');
  assert.match(grade.explanation, /左侧.*斜角/);
  assert.doesNotMatch(grade.explanation, /[346]|三口|四口|六口|你选了|正确答案/);
  assert.match(answer(liberties.id, '3').explanation, /3.*气.*左边.*白子/);
  assert.equal(getGroup(liberties.position.board, { x: 4, y: 4 }).liberties, 3);
  const shared = answer('ogs-count-liberties-page11', '8');
  assert.match(shared.explanation, /中间.*空点/);
  assert.doesNotMatch(shared.explanation, /[1-9]|七口/);
  assert.match(answer('ogs-count-liberties-page11', '7').explanation, /7.*气.*中间.*空点.*一次/);
  const chains = exercise('ogs-count_chains-page03');
  assert.match(answer(chains.id, '4').explanation, /左上.*横竖/);
  assert.doesNotMatch(answer(chains.id, '4').explanation, /[1-9]|五块/);
  assert.match(answer(chains.id, '5').explanation, /5 块.*斜/);
  assert.deepEqual(getAllGroups(chains.position.board).map(group => group.stones.length).sort((a, b) => a - b), [1, 1, 3, 4, 6]);
});

test('atari feedback checks the marked whole group rather than counting diagonal neighbors', () => {
  const ex = exercise('ogs-in_atari-page02');
  assert.equal(getGroup(ex.position.board, { x: 3, y: 8 }).liberties, 2);
  const grade = answer(ex.id, 'yes');
  assert.match(grade.explanation, /△.*外缘.*下边线/);
  assert.doesNotMatch(grade.explanation, /2|两口|不是|否/);
  assert.match(answer(ex.id, 'no').explanation, /否.*2 口气.*打吃/);
});

test('every liberty, chain and atari answer agrees with the actual source groups', () => {
  for (const [id, anchor, size, liberties] of [
    ['ogs-count-liberties-page01', { x: 4, y: 4 }, 1, 3],
    ['ogs-count-liberties-page05', { x: 5, y: 7 }, 5, 3],
    ['ogs-count-liberties-page11', { x: 2, y: 3 }, 6, 7],
  ]) {
    const ex = exercise(id), group = getGroup(ex.position.board, anchor);
    assert.equal(group.stones.length, size, id);
    assert.equal(group.liberties, liberties, id);
    assert.equal(Number(ex.correctChoiceId), liberties, id);
  }
  for (const [id, sizes] of [
    ['ogs-count_chains-page01', [1, 1, 2, 3]],
    ['ogs-count_chains-page03', [1, 1, 3, 4, 6]],
    ['ogs-count_chains-page06', [3, 4, 5]],
  ]) {
    const ex = exercise(id);
    const groups = getAllGroups(ex.position.board).filter(group => group.stones[0].color === 'white');
    assert.deepEqual(groups.map(group => group.stones.length).sort((a, b) => a - b), sizes, id);
    assert.equal(Number(ex.correctChoiceId), groups.length, id);
  }
  for (const [id, anchor, size, liberties] of [
    ['ogs-in_atari-page01', { x: 3, y: 5 }, 1, 1],
    ['ogs-in_atari-page02', { x: 4, y: 7 }, 3, 2],
    ['ogs-in_atari-page06', { x: 3, y: 5 }, 2, 1],
  ]) {
    const ex = exercise(id), group = getGroup(ex.position.board, anchor);
    assert.equal(group.stones.length, size, id);
    assert.equal(group.liberties, liberties, id);
    assert.equal(ex.correctChoiceId, liberties === 1 ? 'yes' : 'no', id);
  }
});

test('territory feedback separates empty points and prisoners, including the source false-eye exception', () => {
  const ex = exercise('ogs-count-territory-page04');
  const board = ex.position.board.map(row => [...row]);
  board[5][1] = null; board[6][1] = null;
  assert.equal(calculateTerritory(board).white.length, 7);
  const retry = answer(ex.id, '7');
  assert.match(retry.explanation, /左下.*黑棋.*移走.*空点.*提子/);
  assert.doesNotMatch(retry.explanation, /[1-9]|九目|正确答案/);
  const grade = answer(ex.id, '9');
  assert.match(grade.explanation, /5 ＋ 2 × 2 ＝ 9/);
  assert.match(grade.explanation, /提子.*空点|空点.*提子/);
  const falseEye = exercise('ogs-count-territory-page12');
  assert.equal(calculateTerritory(falseEye.position.board).white.length, 7);
  const invasion = inspectMove(falseEye.position.board, 4, 6, 'black');
  assert.equal(invasion.legal, true); assert.equal(invasion.result.captured, 2);
  const special = answer(falseEye.id, '7');
  assert.match(special.explanation, /右侧.*空点.*白子.*气/);
  assert.doesNotMatch(special.explanation, /假眼|不算|[1-9]|六目/);
  assert.match(answer(falseEye.id, '6').explanation, /6 目.*右侧.*假眼.*补/);
});

test('every authored territory breakdown agrees with the board after only the stated dead stones are removed', () => {
  const cases = [
    ['ogs-territory-page01', 'black', [], [2, 2]],
    ['ogs-territory-page02', 'white', [], [3, 3]],
    ['ogs-territory-page03', 'white', [], [4, 2]],
    ['ogs-territory-page04', 'black', [], [3, 2, 3]],
    ['ogs-territory-page05', 'white', [], [2, 2, 3]],
    ['ogs-territory-page06', 'black', [], [4, 3]],
    ['ogs-territory-page07', 'black', [], [2, 3, 4]],
    ['ogs-territory-page08', 'white', [], [3, 5]],
    ['ogs-territory-page09', 'white', [], [5, 4, 5]],
    ['ogs-territory-page10', 'black', [], [5, 5]],
    ['ogs-territory-page11', 'black', [[7, 6]], [1, 2, 3]],
    ['ogs-territory-page12', 'white', [[4, 7], [5, 7]], [2, 5]],
    ['ogs-count-territory-page01', 'white', [], [1, 1, 1]],
    ['ogs-count-territory-page04', 'white', [[1, 5], [1, 6]], [1, 1, 1, 2]],
    ['ogs-count-territory-page08', 'white', [[1, 4], [1, 5], [1, 6]], [1, 1, 1, 2]],
  ];
  for (const [id, color, dead, rows] of cases) {
    const ex = exercise(id), board = ex.position.board.map(row => [...row]);
    for (const [x, y] of dead) {
      assert.notEqual(board[y][x]?.color, color); assert.ok(board[y][x]); board[y][x] = null;
    }
    const territory = calculateTerritory(board)[color];
    assert.equal(territory.length + dead.length, Number(ex.correctChoiceId), id);
    const originalEmpty = territory.filter(point => !ex.position.board[point.y][point.x]);
    const counts = board.map((_, y) => originalEmpty.filter(point => point.y === y).length).filter(Boolean);
    assert.deepEqual(counts, rows, id);
    if (dead.length) assert.ok(ex.explanation.includes(`${originalEmpty.length} ＋ ${dead.length} × 2 ＝ ${ex.correctChoiceId}`), id);
  }
});

test('all 28 source choices have short separate retry cues and success reasons', () => {
  const choices = exercises.filter(item => item.kind === 'choice');
  assert.equal(choices.length, 28);
  for (const ex of choices) {
    const correct = answer(ex.id, ex.correctChoiceId);
    assert.equal(correct.outcome, 'success');
    assert.ok(correct.explanation.length >= 15 && correct.explanation.length <= 85, ex.id);
    assert.ok(ex.wrongAnswerExplanation?.length >= 15, ex.id);
    assert.ok(ex.wrongAnswerExplanation.length <= 75, ex.id);
    for (const option of ex.choices.filter(item => !(ex.correctChoiceIds ?? [ex.correctChoiceId]).includes(item.id))) {
      const wrong = answer(ex.id, option.id);
      assert.equal(wrong.outcome, 'failure');
      assert.equal(wrong.explanation, ex.wrongAnswerExplanation, ex.id);
      assert.notEqual(wrong.explanation, correct.explanation, ex.id);
      assert.doesNotMatch(wrong.explanation, /正确答案|你选了|你把|你漏|你没有|你忽略|[0-9]|[＋＝]|换个答案试试|再试一次/, ex.id);
      assert.ok(wrong.explanation.split(/[。？！]/).filter(Boolean).length <= 2, ex.id);
      assert.equal(wrong.nextPosition, undefined);
    }
    const unknown = answer(ex.id, 'not-an-option');
    assert.equal(unknown.outcome, 'unverified');
    assert.equal(unknown.explanation, '这个选项不属于当前题目。');
  }
});

test('a choice without an authored retry cue uses its observation hint, never its solution', () => {
  const source = exercise('ogs-count-liberties-page01');
  const legacy = { ...source, wrongAnswerExplanation: undefined };
  const wrong = gradeExercise(legacy, { kind: 'choice', choiceId: '4' });
  assert.equal(wrong.outcome, 'failure');
  assert.equal(wrong.explanation, legacy.hints[0]);
  assert.doesNotMatch(wrong.explanation, /3|三口|正确答案/);
  const correct = gradeExercise(legacy, { kind: 'choice', choiceId: '3' });
  assert.equal(correct.outcome, 'success');
  assert.equal(correct.explanation, source.explanation);
});

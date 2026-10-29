import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const rulesPath = JSON.stringify(fileURLToPath(new URL('../core/go/rules.ts', import.meta.url)));
const { useLearningPractice, renderHook, exercisePosition, inspectMove, inspections, recordMove } = await loadTestModule({
  reactHost: true,
  plugins: [{ name: 'count-real-rule-inspections', setup(build) {
    build.onResolve({ filter: /core\/go\/rules$/ }, () => ({ path: 'rules', namespace: 'counted-rules' }));
    build.onLoad({ filter: /.*/, namespace: 'counted-rules' }, () => ({ resolveDir: fileURLToPath(new URL('../', import.meta.url)), contents: `
      export * from ${rulesPath};
      import { inspectMove as inspect } from ${rulesPath};
      export const inspections = [];
      export const inspectMove = (...args) => {
        const result = inspect(...args);
        inspections.push({ args, result });
        return result;
      };
    ` }));
  } }],
  contents: `
    export { useLearningPractice } from './hooks/useLearningPractice';
    export { renderHook } from './tests/helpers/reactHooks';
    export { exercisePosition } from './domains/coach/exercise';
    export { inspectMove, inspections } from './core/go/rules';
    export { recordMove } from './domains/game/positionState';
  `,
});

const surrounded = exercisePosition(['.O...', 'O.O..', '.O...', '.....', '.....']);
const beforeKo = exercisePosition(['.XO..', 'XO.O.', '.XO..', '.....', '.....']);
beforeKo.blackCaptures = 3;
beforeKo.whiteCaptures = 5;
const capture = inspectMove(beforeKo.board, 2, 1, 'black');
assert.equal(capture.legal, true);
const ko = recordMove(beforeKo, capture.result.newBoard, { x: 2, y: 1 }, capture.result.captured, false);

for (const [reason, position, point, explanation] of [
  ['out-of-bounds', surrounded, { x: -1, y: 0 }, '落点不在棋盘内，请换一个交叉点。'],
  ['suicide', surrounded, { x: 1, y: 1 }, '这手落下后没有气，也没有提走对方棋子。请换一手。'],
  ['ko', ko, { x: 1, y: 1 }, '立即提回会还原上一局面，劫规则不允许。请换一手。'],
  ['occupied', surrounded, { x: 1, y: 0 }, '- 这块白棋共 1 子、3 气。\n- 沿亮线找空点，同一个空点只数一次。'],
]) test(`practice ${reason}: inspect once, preserve the complete position and never record a failed answer`, t => {
  const events = [];
  const exercise = { id: `illegal-${reason}`, familyId: `illegal-${reason}`, skillId: 'fixture', contentRevision: 'test.1',
    kind: 'sequence', position, solution: [], minimumCaptures: 1,
    prompt: '观察棋盘后落子。', hints: ['数气。', '看看空点。'], explanation: '已完成。' };
  const learning = { loaded: true, attemptedFamilyIds: [], exposedFamilyIds: [],
    recordAttempt: item => { events.push(['attempt', item]); return true; },
    recordExposure: item => { events.push(['exposure', item]); return true; } };
  const host = renderHook(() => useLearningPractice(learning, {
    canAct: () => true, bindAction: action => action, invalidateActions() {},
    onMessage: message => assert.fail(message), onOpenExercise: () => false,
    onNext: () => assert.fail('illegal input cannot advance the lesson'),
  }));
  t.after(() => host.unmount());
  host.render().begin(exercise, 'practice');
  const before = host.render().activeView;
  const snapshot = JSON.stringify(position);
  inspections.length = 0;
  before.onPoint(point.x, point.y);
  const inspected = [...inspections];
  const active = host.render().activeView;
  assert.equal(active.phase, 'practice');
  assert.equal(active.result, null);
  assert.equal(active.instruction, explanation);
  assert.equal(active.board, before.board);
  assert.deepEqual([active.currentPlayer, active.blackCaptures, active.whiteCaptures, active.lastMove],
    [before.currentPlayer, before.blackCaptures, before.whiteCaptures, before.lastMove]);
  assert.equal(active.canUndo, false);
  assert.equal(JSON.stringify(position), snapshot);
  assert.equal(events.filter(([kind]) => kind === 'attempt').length, 0);
  if (reason === 'occupied') {
    assert.equal(inspected.length, 0, 'an existing stone is inspected, not submitted as a move');
    assert.deepEqual(events.map(([kind]) => kind), ['exposure']);
    assert.deepEqual(active.focusPoint, point);
  } else {
    assert.deepEqual(events, [], 'rejected input does not count as an answer or hint');
    assert.equal(inspected.length, 1, 'the first legality result is sufficient to explain a rejected move');
    assert.deepEqual(inspected[0].result, { legal: false, reason });
    assert.equal(inspected[0].args[0], position.board);
    assert.equal(inspected[0].args[3], position.currentPlayer);
    if (reason === 'ko') assert.ok(inspected[0].args[5], 'the inspection keeps the preceding board hash');
  }
});

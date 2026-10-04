import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, sequence, curriculumLessons, inspectMove, setup } from './helpers/learningCenter.mjs';

test('course entry and lesson selection start with an unaided move, without an introductory slideshow', t => {
  const host = setup(t);
  host.render().open();
  let state = host.render();
  assert.equal(state.isOpen, true);
  assert.equal(state.view.active.phase, 'practice');
  assert.equal('sources' in state.view.active, false, 'source attribution belongs in About, not individual exercises');
  assert.equal(state.view.active.independent, true);
  assert.deepEqual(host.events, []);
  state.view.onLesson(curriculumLessons[1].id);
  state = host.render();
  assert.equal(state.view.active.phase, 'practice');
  assert.equal(state.view.active.title, curriculumLessons[1].title);
  assert.equal(host.record.exposures.length, 0);
});

test('an optional demonstration returns to the same exercise and records assistance rather than success', t => {
  const host = setup(t);
  host.render().view.onLesson('ogs-make-alive');
  let state = host.render();
  const initialBoard = state.view.active.board;
  state.view.active.onDemonstrate();
  state = host.render();
  assert.equal(state.view.active.phase, 'demonstration');
  assert.equal(state.view.active.independent, false);
  assert.equal(host.record.attempts.length, 0);
  assert.ok(host.record.exposures.some(item => item.attemptId && item.hintLevel === 3));
  state.view.active.onPoint(0, 0);
  assert.equal(host.record.attempts.length, 0, 'demonstration cannot accept student moves');
  const demoTotal = state.view.active.demoTotal;
  for (let i = 0; i < demoTotal; i++) host.render().view.active.onContinue();
  state = host.render();
  assert.equal(state.view.active.phase, 'practice');
  assert.equal(state.view.active.board, initialBoard);
  assert.equal(state.view.active.independent, false);
  assert.equal(host.record.attempts.length, 0);
  state.close();
  assert.equal(host.record.attempts.length, 1, 'only abandoned practice is recorded');
  assert.equal(host.record.attempts[0].hintLevel, 3);
});

test('a failed move retries immediately without replaying the demonstration', t => {
  const host = setup(t);
  host.render().openExercise(capture.id);
  let state = host.render();
  const initialBoard = state.view.active.board;
  state.view.active.onPoint(4, 4);
  state = host.render();
  assert.equal(state.view.active.result.outcome, 'failure');
  assert.equal(state.view.active.continueLabel, '再试一次');
  state.view.active.onContinue();
  state = host.render();
  assert.equal(state.view.active.phase, 'practice');
  assert.equal(state.view.active.board, initialBoard);
  assert.equal(state.view.active.independent, false);
  assert.equal(host.record.attempts.length, 1);
  state.view.active.onPoint(4, 4);
  assert.equal(host.record.attempts[1].retryOf, host.record.attempts[0].attemptId);
});

test('a wrong legal move stops at its decision point and undo restores the verified branch', t => {
  const host = setup(t);
  host.render().openExercise(sequence.id);
  host.render().view.active.onPoint(1, 2);
  const decision = host.render().view.active.board;
  host.render().view.active.onPoint(0, 4);
  let active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.currentPlayer, 'white');
  assert.equal(active.canUndo, true);
  assert.equal(host.record.attempts.length, 1);
  const wrongBoard = active.board;
  const nextPoint = active.board.flatMap((row, y) => row.map((_, x) => ({ x, y })))
    .find(point => inspectMove(active.board, point.x, point.y, active.currentPlayer).legal);
  active.onPoint(nextPoint.x, nextPoint.y);
  active = host.render().view.active;
  assert.equal(active.board, wrongBoard);
  assert.equal(host.record.attempts.length, 1, 'stopped feedback cannot create another graded answer');
  active.onUndo();
  active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.deepEqual(active.board, decision);
  active.onPoint(3, 2);
  assert.equal(host.render().view.active.result.outcome, 'success');
  assert.equal(host.record.attempts[1].retryOf, host.record.attempts[0].attemptId);
  assert.ok(host.record.attempts[1].hintLevel > 0);
});

test('demonstration uses this exercise and can return to an in-progress snapshot', t => {
  const host = setup(t);
  host.render().openExercise(sequence.id);
  host.render().view.active.onPoint(1, 2);
  const before = host.render().view.active.board;
  host.render().view.active.onDemonstrate();
  let active = host.render().view.active;
  assert.equal(active.board, sequence.position.board);
  active.onContinue();
  active = host.render().view.active;
  assert.equal(active.board[2][1].color, 'black');
  assert.equal(active.board[4][4], null, 'opponent move is shown as its own step');
  active.onUndo();
  assert.equal(host.render().view.active.board, sequence.position.board);
  host.render().view.active.onReturnFromDemo();
  active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.equal(active.board, before);
  assert.equal(active.independent, false);
});

test('inspecting stones and illegal moves keep practice interactive without a failed attempt', t => {
  const host = setup(t);
  host.render().openExercise(capture.id);
  host.render().view.active.onInspect(1, 1);
  let active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.match(active.instruction, /1 气/);
  assert.equal(active.board, capture.position.board);
  assert.equal(host.record.attempts.length, 0);
  active.onPoint(-1, 0);
  active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.match(active.instruction, /棋盘/);
  assert.equal(host.record.attempts.length, 0);
  active.onPoint(1, 2);
  assert.equal(host.render().view.active.result.outcome, 'success');
});

test('requesting a demonstration after failure assists only the retry and preserves the first answer', t => {
  const host = setup(t);
  host.render().openExercise(capture.id);
  host.render().view.active.onPoint(4, 4);
  const original = { ...host.record.attempts[0] };
  host.render().view.active.onDemonstrate();
  host.render().view.active.onReturnFromDemo();
  host.render().view.active.onRetry();
  host.render().view.active.onPoint(4, 4);
  assert.deepEqual(host.record.attempts[0], original);
  assert.equal(original.hintLevel, 0);
  assert.equal(host.record.attempts[1].hintLevel, 3);
  assert.equal(host.record.attempts[1].retryOf, original.attemptId);
});

test('point practice submits directly and saves first attempt before feedback exposure; retry is not new evidence', t => {
  const host = setup(t);
  host.render().openExercise(capture.id);
  host.render().view.active.onPoint(1, 2);
  let state = host.render();
  assert.deepEqual(host.events, ['attempt', 'exposure']);
  assert.equal(state.view.active.phase, 'feedback');
  assert.equal(state.view.active.result.outcome, 'success');
  assert.equal(host.record.attempts[0].hintLevel, 0);
  assert.equal(host.record.attempts[0].source, 'review');
  assert.equal(state.view.stats.independent, 1);
  assert.equal(state.view.active.independent, true);
  state.view.active.onExplanation(); state = host.render();
  assert.equal(host.record.attempts[0].hintLevel, 0);
  state.view.active.onRetry(); state = host.render();
  assert.equal(state.view.active.independent, false);
  state.view.active.onPoint(1, 2); state = host.render();
  assert.equal(host.record.attempts[1].retryOf, host.record.attempts[0].attemptId);
  assert.equal(state.view.stats.independent, 1);
});

test('hints and explanations record assistance before an answer', t => {
  const host = setup(t);
  host.render().openExercise(capture.id);
  host.render().view.active.onHint();
  let state = host.render();
  assert.equal(state.view.active.hintLevel, 1);
  assert.equal(host.record.exposures[0].source, 'review');
  state.view.active.onExplanation(); state = host.render();
  assert.equal(state.view.active.explanationVisible, true);
  assert.equal(host.record.exposures[1].hintLevel, 3);
  assert.equal(state.view.active.independent, false);
  state.view.active.onPoint(1, 2);
  assert.equal(host.record.attempts[0].hintLevel, 3);
  assert.equal(host.render().view.stats.independent, 0);
});

test('old answer, hint and demonstration callbacks cannot change a replacement lesson or closed mode', t => {
  const host = setup(t);
  host.render().view.onLesson('ogs-make-alive');
  const oldShowDemo = host.render().view.active.onDemonstrate;
  oldShowDemo();
  const oldDemo = host.render().view.active.onContinue;
  host.render().openExercise(capture.id);
  let state = host.render();
  const oldPoint = state.view.active.onPoint, oldHint = state.view.active.onHint;
  state.openExercise(sequence.id); state = host.render();
  const attempts = host.record.attempts.length;
  const exposures = host.record.exposures.length;
  oldPoint(1, 2); oldHint(); oldDemo(); oldShowDemo();
  state = host.render();
  assert.equal(host.record.attempts.length, attempts);
  assert.equal(host.record.exposures.length, exposures, 'old callbacks do not add to the already-recorded demonstration exposure');
  assert.equal(state.view.active.kind, 'sequence');
  assert.equal(state.view.active.result, null);
  const pointBeforeClose = state.view.active.onPoint;
  state.close(); pointBeforeClose(1, 2);
  assert.equal(host.render().isOpen, false);
  assert.equal(host.render().view.active, null);
});

test('practice owns its position and retry restores the immutable source', t => {
  const before = JSON.stringify(capture.position);
  const host = setup(t);
  host.render().openExercise(capture.id);
  host.render().view.active.onPoint(1, 2);
  let state = host.render();
  assert.equal(state.view.active.board[1][1], null);
  assert.equal(state.view.active.currentPlayer, 'white');
  assert.equal(JSON.stringify(capture.position), before);
  state.view.active.onRetry(); state = host.render();
  assert.equal(state.view.active.board[1][1].color, 'white');
  assert.equal(state.view.active.currentPlayer, 'black');
});

test('multi-move practice waits for the complete line; undo removes student and reply and records help', t => {
  const before = JSON.stringify(sequence.position);
  const host = setup(t);
  host.render().openExercise(sequence.id);
  host.render().view.active.onPoint(1, 2);
  let state = host.render();
  assert.equal(state.view.active.phase, 'practice');
  assert.equal(state.view.active.result, null);
  assert.equal(host.record.attempts.length, 0);
  assert.equal(state.view.active.board[4][4].color, 'white');
  assert.equal(state.view.active.currentPlayer, 'black');
  state.view.active.onUndo(); state = host.render();
  assert.equal(state.view.active.board[4][4], null);
  assert.equal(state.view.active.board[1][1].color, 'white');
  assert.equal(state.view.active.canUndo, false);
  assert.equal(state.view.active.independent, false);
  state.view.active.onPoint(1, 2);
  host.render().view.active.onPoint(3, 2); state = host.render();
  assert.equal(state.view.active.result.outcome, 'success');
  assert.equal(host.record.attempts.length, 1);
  assert.equal(host.record.attempts[0].hintLevel, 1);
  assert.equal(JSON.stringify(sequence.position), before);
});

test('personal exercises share submission; loading, owner change and deletion invalidate actions', t => {
  const host = setup(t);
  let state = host.render();
  assert.equal(state.view.personal[0].id, capture.id);
  state.view.onPersonal(capture.id);
  state = host.render();
  const oldPoint = state.view.active.onPoint;
  host.setLoaded(false); state = host.render();
  oldPoint(1, 2);
  assert.equal(state.openExercise(capture.id), false);
  assert.equal(host.render().isOpen, false);
  assert.equal(host.record.attempts.length, 0);
  host.setLoaded(true); state = host.render();
  state.openExercise(capture.id);
  state = host.render(); state.close(); state.close();
  assert.equal(host.record.attempts.length, 1);
  assert.equal(host.record.attempts[0].outcome, 'abandoned');
  state = host.render(); state.view.onDelete(); state = host.render();
  assert.equal(state.view.deletePending, true);
  assert.equal(host.record.attempts.length, 1);
  state.view.onDelete(); state = host.render();
  assert.equal(host.record.attempts.length, 0);
  assert.ok(!state.view.storageMessage.includes('已清空'));
});

test('entry during initial load waits; closing prevents a late open', t => {
  const host = setup(t);
  host.setLoaded(false); host.render().open();
  assert.equal(host.render().view.active, null);
  host.setLoaded(true); host.render();
  assert.equal(host.render().view.active.phase, 'practice');
  host.setLoaded(false); host.render(); host.render().open(); host.render().close();
  host.setLoaded(true); host.render();
  assert.equal(host.render().isOpen, false);
  assert.equal(host.render().view.active, null);
});

test('a delayed backup read cannot restore records after deletion', async t => {
  const host = setup(t);
  let resolveText;
  const pendingText = new Promise(resolve => { resolveText = resolve; });
  let state = host.render();
  state.view.onImport({ size: 100, text: () => pendingText });
  state.view.onDelete(); state = host.render();
  state.view.onDelete(); state = host.render();
  resolveText('{"version":1}');
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(host.imports, []);
  assert.ok(!host.render().view.storageMessage.includes('已合并'));
});

test('leaving teaching invalidates a pending backup read', async t => {
  const host = setup(t);
  host.render().openExercise(capture.id);
  let resolveText;
  const pendingText = new Promise(resolve => { resolveText = resolve; });
  const state = host.render();
  state.view.onImport({ size: 100, text: () => pendingText });
  state.close();
  host.render().openExercise(sequence.id);
  resolveText('{"version":1}');
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(host.imports, []);
  assert.equal(host.render().view.active.kind, 'sequence');
  assert.ok(!host.render().view.storageMessage.includes('已合并'));
});

for (const transition of ['replace', 'reopen', 'owner']) {
  test(`old teaching entry and record callbacks cannot change a ${transition} session`, t => {
    const host = setup(t);
    host.render().openExercise(capture.id);
    const old = host.render();
    if (transition === 'reopen') old.close();
    if (transition === 'owner') {
      host.setLoaded(false); host.render();
      host.setLoaded(true); host.render();
    }
    host.render().openExercise(sequence.id);
    const current = host.render();
    const events = [...host.events];
    let fileReads = 0;
    const staleActions = [old.open, old.close, old.view.onClose, old.view.onExport, old.view.onDelete,
      old.view.active.onBack, () => old.openExercise(capture.id), () => old.view.onLesson(curriculumLessons[0].id),
      () => old.view.onPersonal(capture.id), () => old.view.onFilter('personal'),
      () => old.view.onImport({ size: 0, text: async () => { fileReads++; return ''; } })];
    for (const action of staleActions) {
      action();
      const state = host.render();
      assert.equal(state.isOpen, true);
      assert.equal(state.view.active?.kind, 'sequence');
      assert.equal(state.view.active?.board, current.view.active.board);
      assert.equal(state.view.filter, current.view.filter);
      assert.equal(state.view.notice, current.view.notice);
      assert.equal(state.view.deletePending, false);
      assert.deepEqual(host.events, events);
    }
    assert.equal(fileReads, 0);
    assert.equal(old.openExercise(capture.id), false);
  });
}

test('course entry never replaces an exposed built-in exercise with a same-skill personal position', t => {
  const lesson = curriculumLessons[0];
  const personal = { ...capture, skillId: lesson.skillId, prompt: '私人收藏，不属于本课' };
  const host = setup(t, [personal]);
  for (const [index, exercise] of lesson.exercises.entries()) host.record.exposures.push({
    exposureId: `previous-${index}`, familyId: exercise.familyId, exerciseId: exercise.id,
    skillId: exercise.skillId, contentRevision: exercise.contentRevision, hintLevel: 4,
    occurredAt: Date.now(), source: 'course', sequence: index + 1,
  });
  host.render().open();
  assert.notEqual(host.render().view.active.prompt, personal.prompt);
  host.render().view.onLesson(lesson.id);
  assert.notEqual(host.render().view.active.prompt, personal.prompt);
  const state = host.render();
  assert.equal(state.view.active.phase, 'practice');
  assert.ok(lesson.exercises.some(exercise => exercise.prompt === state.view.active.prompt));
  state.view.onPersonal(personal.id);
  assert.equal(host.render().view.active.prompt, personal.prompt, 'explicit personal entry remains available');
});


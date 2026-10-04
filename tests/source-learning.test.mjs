import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, curriculumLessons, exercisePosition, setup } from './helpers/learningCenter.mjs';

const variation = { ...capture, id: 'source-variation', familyId: 'source-variation', kind: 'variation',
  boardMarks: [{ point: { x: 1, y: 1 }, label: 'A' }], solution: [
    { point: { x: 1, y: 2 }, color: 'black', children: [
      { point: { x: 4, y: 4 }, color: 'white', text: '白棋应在角上，请继续。',
        boardMarks: [{ point: { x: 3, y: 3 }, label: 'B' }], children: [
          { point: { x: 3, y: 3 }, color: 'black', correct: true, text: '这条变化完成了。', children: [] },
          { point: { x: 0, y: 4 }, color: 'black', children: [
            { point: { x: 1, y: 4 }, color: 'white', wrong: true, text: '这条变化没有完成目标。', children: [] },
          ] },
        ] },
    ] },
  ] };
const pass = { ...capture, id: 'source-pass', familyId: 'source-pass', kind: 'action', action: 'pass' };
const finish = { ...pass, id: 'source-finish', familyId: 'source-finish', action: 'finish' };
const removal = { ...pass, id: 'source-removal', familyId: 'source-removal', action: 'remove',
  position: exercisePosition(['.....', '.OO..', '...X.', 'O..X.', '.....']),
  expectedPoints: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 0, y: 3 }] };

test('course progress counts unique successful current pages and preserves the current lesson identity', t => {
  const host = setup(t);
  const lesson = curriculumLessons.find(item => item.id === 'ogs-make-alive');
  assert.ok(lesson, 'the retained make-alive source lesson must remain in the advanced curriculum');
  host.render().view.onLesson(lesson.id);
  const first = lesson.exercises[0];
  assert.equal(first.kind, 'variation');
  const lessonView = view => view.lessons.find(item => item.id === lesson.id);
  let view = host.render().view;
  assert.equal(view.activeLessonId, lesson.id);
  assert.equal(lessonView(view).completedSteps, 0);
  assert.equal(lessonView(view).totalSteps, lesson.exercises.length);
  const point = first.solution.find(node => node.correct).point;
  view.active.onPoint(point.x, point.y);
  const original = host.record.attempts[0];
  host.record.attempts.push({ ...original, attemptId: 'duplicate-success' });
  for (const exercise of lesson.exercises.slice(1)) host.record.attempts.push({ ...original,
    attemptId: `obsolete-${exercise.id}`, exerciseId: exercise.id, contentRevision: 'obsolete' });
  view = host.render().view;
  assert.equal(lessonView(view).completedSteps, 1, 'retries and obsolete pages must not inflate progress or mark the lesson complete');
  assert.equal(lessonView(view).status, '练习中');
  view.active.onContinue();
  assert.equal(host.render().view.activeLessonId, lesson.id);
  for (const exercise of lesson.exercises.slice(1)) host.record.attempts.push({ ...original,
    attemptId: `success-${exercise.id}`, exerciseId: exercise.id, contentRevision: exercise.contentRevision });
  view = host.render().view;
  assert.equal(lessonView(view).completedSteps, lesson.exercises.length);
  assert.equal(lessonView(view).status, '练习通过');
});

test('course reentry resumes the first unfinished source page even after assistance and abandonment', t => {
  const host = setup(t);
  host.render().open();
  const first = curriculumLessons[0].exercises[0];
  assert.equal(host.render().view.active.prompt, first.prompt);
  host.render().view.active.onHint();
  host.render().close();
  host.render().open();
  assert.equal(host.render().view.active.prompt, first.prompt, 'novelty selection must not skip unfinished source pages');
  assert.equal(host.render().view.active.independent, false);
  assert.equal(first.kind, 'choice', 'advanced reentry now begins with identifying real and false eyes');
  host.render().view.active.onChoice(first.correctChoiceId);
  host.render().view.active.onSubmit();
  host.render().view.active.onContinue();
  assert.equal(host.render().view.active.prompt, curriculumLessons[0].exercises[1].prompt);
});

test('source practice automatically replies and grades only the completed variation', t => {
  const host = setup(t, [variation]);
  host.render().openExercise(variation.id);
  host.render().view.active.onPoint(1, 2);
  let active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.equal(active.result, null);
  assert.equal(active.currentPlayer, 'black');
  assert.equal(active.board[1][1], null);
  assert.equal(active.board[4][4].color, 'white');
  assert.equal(active.replyPreview.blackCaptures, 1);
  assert.equal(active.replyPreview.history.length, 1);
  assert.equal(active.replyPreview.board[4][4], null);
  assert.match(active.instruction, /白棋应在角上/);
  assert.deepEqual(active.boardMarks, [{ point: { x: 3, y: 3 }, label: 'B' }]);
  assert.equal(host.record.attempts.length, 0);
  active.onPoint(3, 3);
  active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'success');
  assert.equal(active.result.nextPosition.history.length, 3);
  assert.equal(active.result.nextPosition.blackCaptures, 1);
  assert.equal(host.record.attempts.length, 1);
  assert.equal(host.record.attempts[0].hintLevel, 0);
});

test('a source hint follows the second decision instead of pointing back at the opening move', t => {
  const host = setup(t, [variation]);
  host.render().openExercise(variation.id);
  host.render().view.active.onPoint(1, 2);
  host.render().view.active.onHint();
  assert.deepEqual(host.render().view.active.markers, []);
  host.render().view.active.onHint();
  assert.deepEqual(host.render().view.active.markers, [{ x: 3, y: 3 }]);
});

test('an unknown source move stops for retry, and undo returns to the original decision', t => {
  const host = setup(t, [variation]);
  host.render().openExercise(variation.id);
  host.render().view.active.onPoint(4, 0);
  let active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'unverified');
  assert.equal(active.currentPlayer, 'white');
  assert.equal(active.replyPreview, undefined);
  assert.match(active.instruction, /暂不能判定.*重试/);
  const firstBoard = active.board;
  const firstResult = active.result;
  const firstAttempt = { ...host.record.attempts[0] };
  active.onPoint(1, 2);
  active = host.render().view.active;
  assert.equal(active.board, firstBoard);
  assert.equal(active.currentPlayer, 'white');
  assert.equal(active.result, firstResult);
  assert.equal(host.record.attempts.length, 1);
  active.onUndo();
  active = host.render().view.active;
  assert.equal(active.board, variation.position.board);
  assert.equal(active.phase, 'practice');
  assert.equal(active.currentPlayer, 'black');
  assert.equal(active.independent, false);
  active.onPoint(1, 2);
  host.render().view.active.onPoint(3, 3);
  assert.equal(host.render().view.active.result.outcome, 'success');
  assert.deepEqual(host.record.attempts[0], firstAttempt);
  assert.equal(host.record.attempts[1].retryOf, firstAttempt.attemptId);
  assert.ok(host.record.attempts[1].hintLevel > 0);
});

test('source-authored refutations receive exactly one reply and retain the original failed attempt', t => {
  const host = setup(t, [variation]);
  host.render().openExercise(variation.id);
  host.render().view.active.onPoint(1, 2);
  host.render().view.active.onPoint(0, 4);
  const active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'failure');
  assert.equal(active.result.nextPosition.history.length, 4);
  assert.equal(active.replyPreview.history.length, 3);
  assert.equal(active.board, active.result.nextPosition.board);
  assert.equal(active.currentPlayer, 'black');
  assert.equal(active.board[4][1].color, 'white');
  assert.match(active.instruction, /没有完成目标.*\n.*重试/);
  active.onPoint(3, 3);
  assert.equal(host.render().view.active.board, active.board, 'a refuted line cannot become endless exploration');
  assert.equal(host.record.attempts.length, 1);
});

test('source demonstration returns to the exact ongoing branch including captures, marks and undo', t => {
  const host = setup(t, [variation]);
  host.render().openExercise(variation.id);
  host.render().view.active.onPoint(1, 2);
  const before = host.render().view.active;
  before.onDemonstrate();
  assert.equal(host.render().view.active.board, variation.position.board);
  host.render().view.active.onContinue();
  host.render().view.active.onContinue();
  host.render().view.active.onUndo();
  host.render().view.active.onReturnFromDemo();
  let active = host.render().view.active;
  assert.equal(active.board, before.board);
  assert.equal(active.currentPlayer, before.currentPlayer);
  assert.deepEqual(active.lastMove, before.lastMove);
  assert.deepEqual(active.boardMarks, before.boardMarks);
  assert.equal(active.instruction, before.instruction);
  assert.equal(active.canUndo, true);
  assert.equal(active.independent, false);
  assert.equal(active.replyPreview, undefined, 'returning must not replay an old response animation');
  active.onPoint(3, 3);
  active = host.render().view.active;
  const restored = active.result.nextPosition;
  assert.equal(restored.history.length, 3);
  assert.equal(restored.blackCaptures, 1);
  assert.equal(restored.whiteCaptures, 0);
  assert.equal(restored.consecutivePasses, 0);
  assert.deepEqual(restored.history[2].board.map(row => row.map(stone => stone?.color ?? null)),
    before.board.map(row => row.map(stone => stone?.color ?? null)));
  assert.equal(restored.history[2].currentPlayer, before.currentPlayer);
  assert.deepEqual(restored.history[2].lastMove, before.lastMove);
  assert.equal(host.record.attempts[0].hintLevel, 3);
});

for (const exercise of [pass, finish]) test(`the source ${exercise.action} action finishes once and preserves its position semantics`, t => {
  const host = setup(t, [exercise]);
  host.render().openExercise(exercise.id);
  const action = host.render().view.active.onAction;
  action(); action();
  const active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'success');
  const next = active.result.nextPosition;
  assert.equal(next.board, exercise.position.board);
  assert.equal(next.blackCaptures, exercise.position.blackCaptures);
  assert.equal(next.whiteCaptures, exercise.position.whiteCaptures);
  assert.equal(next.currentPlayer, exercise.action === 'pass' ? 'white' : 'black');
  assert.equal(next.consecutivePasses, exercise.action === 'pass' ? 1 : 0);
  assert.equal(next.history.length, exercise.action === 'pass' ? 1 : 0);
  assert.equal(host.record.attempts.length, 1);
});

test('dead stones select whole groups, support multiple groups, and can be corrected after failure', t => {
  const host = setup(t, [removal]);
  host.render().openExercise(removal.id);
  host.render().view.active.onInspect(1, 1);
  let active = host.render().view.active;
  assert.equal(active.actionSelectionCount, 2);
  assert.deepEqual(new Set(active.markers.map(p => `${p.x},${p.y}`)), new Set(['1,1', '2,1']));
  assert.equal(active.board, removal.position.board);
  assert.equal(active.independent, true, 'selecting an answer is not an inspection hint');
  active.onInspect(2, 1);
  assert.equal(host.render().view.active.actionSelectionCount, 0);
  host.render().view.active.onInspect(1, 1);
  host.render().view.active.onAction();
  const failed = { ...host.record.attempts[0] };
  active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, 'failure');
  assert.equal(active.board, removal.position.board);
  active.onInspect(0, 3);
  active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.equal(active.actionSelectionCount, 3);
  assert.equal(active.independent, false);
  active.onAction();
  active = host.render().view.active;
  assert.equal(active.result.outcome, 'success');
  assert.equal(active.result.nextPosition.blackCaptures, 3);
  for (const p of removal.expectedPoints) assert.equal(active.board[p.y][p.x], null);
  assert.equal(active.board[2][3].color, 'black');
  assert.equal(removal.position.board[1][1].color, 'white');
  assert.deepEqual(host.record.attempts[0], failed);
  assert.equal(host.record.attempts[1].retryOf, failed.attemptId);
  assert.equal(host.record.exposures.filter(item => item.hintLevel === 1).length, 0);
});

test('dead-stone demonstration returns the selection and old source actions cannot touch another exercise', t => {
  const host = setup(t, [removal, pass, variation]);
  host.render().openExercise(removal.id);
  host.render().view.active.onInspect(1, 1);
  const oldRemoval = host.render().view.active;
  oldRemoval.onDemonstrate();
  host.render().view.active.onContinue();
  host.render().view.active.onReturnFromDemo();
  let active = host.render().view.active;
  assert.equal(active.board, removal.position.board);
  assert.equal(active.actionSelectionCount, 2);
  assert.deepEqual(active.markers, oldRemoval.markers);
  host.render().openExercise(pass.id);
  const oldPass = host.render().view.active;
  host.render().openExercise(variation.id);
  const before = host.render().view.active;
  const events = [...host.events];
  for (const stale of [oldRemoval.onAction, () => oldRemoval.onInspect(0, 3), oldRemoval.onUndo,
    oldRemoval.onDemonstrate, oldPass.onAction, oldPass.onRetry, active.onReturnFromDemo]) {
    stale();
    active = host.render().view.active;
    assert.equal(active.board, before.board);
    assert.equal(active.phase, 'practice');
    assert.equal(active.kind, 'variation');
    assert.equal(active.result, null);
    assert.deepEqual(host.events, events);
  }
});

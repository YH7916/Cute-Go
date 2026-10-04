import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, sequence, exercisePosition, setup } from './helpers/learningCenter.mjs';
import { props, render, button } from './helpers/learningUi.mjs';

const variation = { ...capture, id: 'retry-variation', familyId: 'retry-variation', kind: 'variation',
  solution: [{ point: { x: 1, y: 2 }, color: 'black', correct: true, children: [] }] };
const white = { ...variation, id: 'retry-white', familyId: 'retry-white',
  position: exercisePosition(['.O...', 'OXO..', '.....', '.....', '.....'], 'white'),
  solution: [{ point: { x: 1, y: 2 }, color: 'white', correct: true, children: [] }] };

for (const exercise of [capture, sequence, variation, white]) test(`${exercise.kind} ${exercise.id}: a graded deviation stops immediately and retry restores the root`, t => {
  const host = setup(t, [exercise]);
  const original = JSON.stringify(exercise.position);
  host.render().openExercise(exercise.id);
  const stale = host.render().view.active.onPoint;
  stale(4, 4);
  let active = host.render().view.active;
  assert.equal(active.phase, 'feedback');
  assert.equal(active.result.outcome, exercise.kind === 'point' ? 'failure' : 'unverified');
  assert.match(active.instruction, /重试/);
  assert.doesNotMatch(active.instruction, /继续试下/);
  assert.equal(active.result.nextPosition.history.length, 1, 'no generic AI reply after leaving the exercise');
  assert.equal(active.replyKey, undefined);
  const stopped = active.board;
  const attempt = { ...host.record.attempts[0] };
  for (let i = 0; i < 20; i++) {
    active.onPoint(1, 2);
    stale(0, 4);
    active = host.render().view.active;
    assert.equal(active.board, stopped);
    assert.equal(host.record.attempts.length, 1);
  }
  active.onRetry();
  active = host.render().view.active;
  assert.equal(active.phase, 'practice');
  assert.equal(active.board, exercise.position.board);
  assert.equal(active.currentPlayer, exercise.position.currentPlayer);
  assert.equal(active.result, null);
  assert.equal(active.independent, false);
  active.onPoint(1, 2);
  if (exercise.kind === 'sequence') host.render().view.active.onPoint(3, 2);
  assert.equal(host.render().view.active.result.outcome, 'success');
  assert.deepEqual(host.record.attempts[0], attempt);
  assert.equal(host.record.attempts[1].retryOf, attempt.attemptId);
  assert.equal(JSON.stringify(exercise.position), original);
});

test('stopped board feedback makes retry the main action while preserving undo and demonstration', t => {
  const calls = [];
  const input = { ...props, phase: 'feedback', kind: 'variation', canUndo: true,
    result: { outcome: 'unverified', explanation: '无法验证本题目标，请重试。' },
    onRetry: () => calls.push('retry'), onUndo: () => calls.push('undo'), onDemonstrate: () => calls.push('demo') };
  const tree = render(t, input).render();
  assert.match(button(tree, '重试').props.className, /btn-coffee/);
  button(tree, '重试').props.onClick();
  button(tree, '悔棋').props.onClick();
  button(tree, '示范').props.onClick();
  assert.deepEqual(calls, ['retry', 'undo', 'demo']);
});

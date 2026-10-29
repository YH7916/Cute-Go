import assert from 'node:assert/strict';
import test from 'node:test';
import { capture, sequence, exercisePosition, setup } from './helpers/learningCenter.mjs';
import { props, render, button, elements, text } from './helpers/learningUi.mjs';

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
  assert.match(active.instruction, /重开或悔棋/);
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

test('stopped board feedback keeps next in the middle, restart on the right and demonstration in the bubble', t => {
  const calls = [];
  const input = { ...props, phase: 'feedback', kind: 'variation', canUndo: true,
    result: { outcome: 'unverified', explanation: '无法验证本题目标，请重开或悔棋。' },
    onNext: () => calls.push('next'), onRetry: () => calls.push('retry'),
    onUndo: () => calls.push('undo'), onDemonstrate: () => calls.push('demo') };
  const [middle, speech] = render(t, input).render();
  assert.deepEqual(elements(middle).filter(node => node.props.onClick).map(text), ['悔棋', '下一题', '重开']);
  assert.match(button(middle, '下一题').props.className, /btn-coffee/);
  assert.match(button(middle, '重开').props.className, /btn-beige/);
  assert.equal(button(middle, '下一题').props.disabled, false);
  button(middle, '下一题').props.onClick();
  button(middle, '重开').props.onClick();
  button(middle, '悔棋').props.onClick();
  button(speech, '示范').props.onClick();
  assert.deepEqual(calls, ['next', 'retry', 'undo', 'demo']);
});

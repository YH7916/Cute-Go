import assert from 'node:assert/strict';
import test from 'node:test';
import { LearningExercise, LearningControls, ScoreBoard, LearningCenter, GameBoard,
  props, render, elements, text, button, centerInput } from './helpers/learningUi.mjs';

test('opponent replies first show the student move, block repeat input, then reveal the reply at 420 ms', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const calls = [];
  const preview = { board: Array.from({ length: 5 }, () => Array(5).fill(null)), currentPlayer: 'white', lastMove: { x: 2, y: 2 }, blackCaptures: 2, whiteCaptures: 1 };
  const active = { ...props, replyKey: 'lesson-1-turn-1', replyPreview: preview,
    instruction: '白救了左边，现在找出另一边的最后一气。', onPoint: (x, y) => calls.push(['move', x, y]),
    onInspect: (x, y) => calls.push(['inspect', x, y]), onDemonstrate: () => calls.push('demo') };
  const input = centerInput(active);
  const host = render(t, input, LearningCenter);
  let tree = host.render();
  let board = elements(tree).find(node => node.type === GameBoard);
  assert.equal(board.props.board, preview.board);
  assert.equal(board.props.currentPlayer, 'white');
  assert.equal(board.props.lastMove, preview.lastMove);
  const beforeScore = elements(tree).find(node => node.type === ScoreBoard).props;
  assert.deepEqual([beforeScore.currentPlayer, beforeScore.blackCaptures, beforeScore.whiteCaptures], ['white', 2, 1]);
  const beforeControls = elements(tree).find(node => node.type === LearningControls);
  const controlRow = LearningControls(beforeControls.props);
  const blockedControls = elements(controlRow.type(controlRow.props)).filter(node => typeof node.props.onClick === 'function');
  assert.equal(blockedControls.length, 3, 'only undo, next and restart occupy the middle action row');
  assert.ok(blockedControls.every(node => node.props.disabled));
  const beforeSpeech = elements(tree).find(node => node.type === LearningExercise);
  assert.equal(beforeSpeech.props.responding, true);
  assert.equal(button(render(t, beforeSpeech.props).render().at(-1), '示范').props.disabled, true, 'bubble demonstration also waits for the reply');
  board.props.onIntersectionClick(3, 3);
  board.props.onInspectPoint(2, 2);
  assert.deepEqual(calls, [], 'input must not skip ahead while the player is watching the response');
  assert.equal(elements(tree).find(node => node.type === LearningExercise).props.instruction, '看看对方的应手。');
  assert.match(text(elements(tree).find(node => node.props.role === 'status')), /对方应手中/);
  t.mock.timers.tick(419);
  assert.equal(elements(host.render()).find(node => node.type === GameBoard).props.board, preview.board);
  t.mock.timers.tick(1);
  tree = host.render(); board = elements(tree).find(node => node.type === GameBoard);
  assert.equal(board.props.board, active.board);
  const afterScore = elements(tree).find(node => node.type === ScoreBoard).props;
  assert.deepEqual([afterScore.currentPlayer, afterScore.blackCaptures, afterScore.whiteCaptures], ['black', 0, 0]);
  assert.equal(elements(tree).find(node => node.type === LearningExercise).props.instruction, active.instruction);
  const afterSpeech = elements(tree).find(node => node.type === LearningExercise);
  assert.equal(afterSpeech.props.responding, false);
  assert.equal(button(render(t, afterSpeech.props).render().at(-1), '示范').props.disabled, false);
  board.props.onIntersectionClick(3, 3);
  assert.deepEqual(calls, [['move', 3, 3]]);
});

test('a replacement reply owns its own delay and the earlier reply cannot reveal it early', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const preview = { board: Array.from({ length: 5 }, () => Array(5).fill(null)), currentPlayer: 'white', lastMove: { x: 1, y: 1 } };
  const active = { ...props, replyKey: 'first-turn', replyPreview: preview };
  const input = centerInput(active);
  const host = render(t, input, LearningCenter);
  host.render();
  t.mock.timers.tick(200);
  input.active = { ...active, replyKey: 'replacement-turn' };
  host.render();
  t.mock.timers.tick(220);
  assert.equal(elements(host.render()).find(node => node.type === GameBoard).props.board, preview.board, 'the first timer must not finish the new reply');
  t.mock.timers.tick(199);
  assert.equal(elements(host.render()).find(node => node.type === GameBoard).props.board, preview.board);
  t.mock.timers.tick(1);
  assert.equal(elements(host.render()).find(node => node.type === GameBoard).props.board, active.board);
});

for (const change of ['lesson', 'undo', 'close', 'unmount']) test(`pending reply cleanup preserves the current view after ${change}`, t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clearTimer = t.mock.method(globalThis, 'clearTimeout');
  const preview = { board: Array.from({ length: 5 }, () => Array(5).fill(null)), currentPlayer: 'white', lastMove: { x: 1, y: 1 } };
  const input = centerInput({ ...props, replyKey: 'obsolete-turn', replyPreview: preview });
  const host = render(t, input, LearningCenter);
  host.render();
  t.mock.timers.tick(100);
  if (change === 'close') input.isOpen = false;
  else if (change === 'unmount') host.unmount();
  else input.active = { ...props, title: change === 'lesson' ? '新的课程' : props.title };
  if (change !== 'unmount') host.render();
  t.mock.timers.tick(1_000);
  assert.equal(clearTimer.mock.callCount(), 1, 'leaving the response cancels its scheduled update');
  if (change === 'unmount') return;
  const tree = host.render();
  if (change === 'close') assert.equal(tree, null);
  else {
    assert.equal(elements(tree).find(node => node.type === GameBoard).props.board, props.board);
    assert.equal(elements(tree).find(node => node.type === LearningExercise).props.title, input.active.title);
    assert.equal(elements(tree).find(node => node.type === LearningExercise).props.instruction, props.instruction);
  }
});

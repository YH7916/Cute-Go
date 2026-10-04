import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// This uses the repository's minimal hook host, NOT real React or a browser.
// It checks callback decisions, state transitions, and effect/timer cleanup;
// DOM event dispatch, React scheduling, and actual touch input need browser tests.
const { useBoardInteraction, renderHook, createBoard } = await loadTestModule({
  reactHost: true,
  contents: `
      export { useBoardInteraction } from './components/board/useBoardInteraction';
      export { renderHook } from './tests/helpers/reactHooks';
      export { createBoard } from './core/board';
    `,
});

function fixture(size = 5) {
  const board = createBoard(size);
  board[1][1] = { x: 1, y: 1, color: 'black', id: 'first' };
  board[3][3] = { x: 3, y: 3, color: 'white', id: 'white' };
  return board;
}

function setup(t, overrides = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const clicks = [], vibrations = [], nativeVibrations = [];
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, value: { vibrate: value => nativeVibrations.push(value) },
  });
  let props = {
    board: fixture(), lastMove: null, showQi: true, showCoordinates: false,
    boardPixelSize: 200, onIntersectionClick: (x, y) => clicks.push([x, y]),
    vibrate: value => vibrations.push(value), ...overrides,
  };
  const host = renderHook(() => useBoardInteraction(props));
  let api;
  // The host flushes effects after returning values; another explicit render
  // exposes effect-driven updates without claiming to emulate React scheduling.
  const render = () => { host.render(); api = host.render(); return api; };
  let mounted = true;
  const unmount = () => { if (mounted) { mounted = false; host.unmount(); } };
  t.after(() => {
    unmount();
    if (oldNavigator) Object.defineProperty(globalThis, 'navigator', oldNavigator);
    else delete globalThis.navigator;
  });
  render();
  return {
    clicks, vibrations, nativeVibrations, render, unmount,
    get api() { return api; },
    update(patch) { props = { ...props, ...patch }; return render(); },
    tick(milliseconds) { t.mock.timers.tick(milliseconds); return render(); },
  };
}

const touch = (...points) => ({ touches: points.map(([clientX, clientY]) => ({ clientX, clientY })) });

test('board hook: occupied clicks show qi, empty clicks clear qi and forward coordinates', t => {
  const s = setup(t);
  s.api.handleIntersectionClickWrapper(1, 1);
  const qi = s.render().activeQiSegments;
  assert.equal(qi.length, 4);
  assert.ok(qi.every(segment => segment.x1 === 1 && segment.y1 === 1));
  assert.deepEqual(s.clicks, []);
  assert.deepEqual(s.vibrations, [10]);
  assert.deepEqual(s.nativeVibrations, [], 'board feedback must use the application vibration callback');

  s.api.handleIntersectionClickWrapper(2, 2);
  assert.deepEqual(s.render().activeQiSegments, []);
  assert.deepEqual(s.clicks, [[2, 2]]);

  s.update({ showQi: false });
  s.api.handleIntersectionClickWrapper(1, 1);
  assert.deepEqual(s.clicks, [[2, 2], [1, 1]], 'with qi disabled, application rules decide occupied clicks');
  assert.deepEqual(s.vibrations, [10]);
});

test('board hook: muted and absent feedback callbacks cannot bypass the vibration setting', t => {
  const s = setup(t, { vibrate: () => {} });
  s.api.handleIntersectionClickWrapper(1, 1);
  assert.equal(s.render().activeQiSegments.length, 4, 'muting preserves qi inspection');
  assert.deepEqual(s.nativeVibrations, []);
  s.update({ vibrate: undefined });
  s.api.handleIntersectionClickWrapper(3, 3);
  assert.equal(s.render().activeQiSegments.length, 4);
  assert.deepEqual(s.nativeVibrations, [], 'a board without feedback must remain silent');
});

test('board hook: hover refreshes qi, empty hover retains it, leaving clears it', t => {
  const s = setup(t);
  s.api.handleStoneHover(1, 1);
  assert.equal(s.render().activeQiSegments.length, 4);
  s.api.handleStoneHover(3, 3);
  const whiteQi = s.render().activeQiSegments;
  assert.equal(whiteQi.length, 4);
  assert.ok(whiteQi.every(segment => segment.x1 === 3 && segment.y1 === 3));
  s.api.handleStoneHover(2, 2);
  assert.equal(s.render().activeQiSegments, whiteQi);
  s.api.handleMouseLeaveBoard();
  assert.deepEqual(s.render().activeQiSegments, []);
  s.api.handleStoneHover(1, 1);
  s.render();
  s.update({ showQi: false });
  s.api.handleStoneHover(1, 1);
  assert.deepEqual(s.render().activeQiSegments, []);
  assert.deepEqual(s.clicks, []);
  assert.deepEqual(s.vibrations, []);
});

test('board hook: lessons can require explicit inspection without hover revealing or replacing qi', t => {
  const inspections = [];
  const s = setup(t, { qiOnHover: false, onInspectPoint: (x, y) => inspections.push([x, y]) });
  s.api.handleStoneHover(1, 1);
  assert.deepEqual(s.render().activeQiSegments, [], 'hover must not reveal an unrecorded counting hint');
  assert.deepEqual(inspections, []);
  s.api.handleIntersectionClickWrapper(1, 1);
  const selected = s.render().activeQiSegments;
  assert.equal(selected.length, 4);
  assert.deepEqual(inspections, [[1, 1]], 'an explicit click still records inspection assistance');
  s.api.handleStoneHover(3, 3);
  assert.equal(s.render().activeQiSegments, selected, 'hover must preserve the explicitly inspected group');
  s.api.handleStoneHover(2, 2);
  assert.equal(s.render().activeQiSegments, selected);
  s.update({ qiOnHover: true });
  s.api.handleStoneHover(3, 3);
  assert.ok(s.render().activeQiSegments.every(segment => segment.x1 === 3 && segment.y1 === 3));
});

test('board hook: automatic qi survives mouse leave and board changes clear old segments', t => {
  const s = setup(t, { autoShowQiAt: { x: 1, y: 1 } });
  const initial = s.api.activeQiSegments;
  assert.equal(initial.length, 4);
  s.api.handleMouseLeaveBoard();
  assert.equal(s.render().activeQiSegments, initial);
  s.update({ autoShowQiAt: { x: 3, y: 3 } });
  assert.ok(s.api.activeQiSegments.every(segment => segment.x1 === 3 && segment.y1 === 3));
  s.update({ board: fixture() });
  assert.deepEqual(s.api.activeQiSegments, [], 'same auto target must not restore stale qi after a board update');
  s.update({ autoShowQiAt: { x: 1, y: 1 } });
  assert.equal(s.api.activeQiSegments.length, 4);
});

test('board hook: coordinate and board-size changes reset zoom, qi, and animation', t => {
  const s = setup(t);
  let moveNumber = 0;
  const activate = () => {
    const board = fixture();
    const stoneId = `first-${++moveNumber}`;
    board[1][1].id = stoneId;
    s.update({ board, lastMove: { x: 1, y: 1 } });
    s.api.setTransform({ scale: 2, x: 30, y: -20 });
    s.api.handleStoneHover(1, 1);
    s.render();
    assert.equal(s.api.animatingStoneId, stoneId);
    assert.equal(s.api.activeQiSegments.length, 4);
  };
  const assertReset = () => {
    assert.deepEqual(s.api.transform, { scale: 1, x: 0, y: 0 });
    assert.deepEqual(s.api.activeQiSegments, []);
    assert.equal(s.api.animatingStoneId, null);
  };
  activate();
  s.update({ showCoordinates: true });
  assertReset();
  activate();
  s.update({ board: fixture(9), boardPixelSize: 360 });
  assertReset();
});

test('board hook: pinch scales and pans within limits, blocking clicks until 100 ms after touchend', t => {
  const s = setup(t);
  s.api.handleTouchStart(touch([10, 20]));
  s.api.handleTouchStart(touch([10, 20], [20, 20]));
  s.api.handleTouchMove(touch([15, 23], [35, 23]));
  assert.deepEqual(s.render().transform, { scale: 2, x: 5, y: 3 });
  s.api.handleTouchMove(touch([30, 40]));
  assert.deepEqual(s.render().transform, { scale: 2, x: 5, y: 3 }, 'single-finger motion is ignored');
  s.api.handleTouchMove(touch([1015, 2023], [1115, 2023]));
  assert.deepEqual(s.render().transform, { scale: 3, x: 200, y: 200 });
  s.api.handleTouchMove(touch([1015, 2023], [1020, 2023]));
  assert.equal(s.render().transform.scale, 1);
  s.api.handleIntersectionClickWrapper(2, 2);
  assert.deepEqual(s.clicks, []);
  s.api.handleTouchEnd();
  s.tick(99);
  s.api.handleIntersectionClickWrapper(2, 2);
  assert.deepEqual(s.clicks, []);
  s.tick(1);
  s.api.handleIntersectionClickWrapper(2, 2);
  assert.deepEqual(s.clicks, [[2, 2]]);
});

test('board hook: new-stone animation lasts 450 ms and unchanged renders do not restart it', t => {
  const s = setup(t);
  s.update({ lastMove: { x: 1, y: 1 } });
  assert.equal(s.api.animatingStoneId, 'first');
  s.tick(200);
  s.render();
  s.tick(249);
  assert.equal(s.api.animatingStoneId, 'first');
  s.tick(1);
  assert.equal(s.api.animatingStoneId, null);
});

test('board hook: consecutive moves cancel the earlier animation timer', t => {
  const s = setup(t);
  s.update({ lastMove: { x: 1, y: 1 } });
  s.tick(200);
  const board = fixture();
  board[1][2] = { x: 2, y: 1, color: 'black', id: 'second' };
  s.update({ board, lastMove: { x: 2, y: 1 } });
  assert.equal(s.api.animatingStoneId, 'second');
  s.tick(250);
  assert.equal(s.api.animatingStoneId, 'second', 'the first move timer must not clear the second move');
  s.tick(199);
  assert.equal(s.api.animatingStoneId, 'second');
  s.tick(1);
  assert.equal(s.api.animatingStoneId, null);
});

test('board hook: unmount cancels the active animation timer', t => {
  const s = setup(t);
  const schedule = t.mock.method(globalThis, 'setTimeout');
  const cancel = t.mock.method(globalThis, 'clearTimeout');
  s.update({ lastMove: { x: 1, y: 1 } });
  assert.equal(schedule.mock.callCount(), 1);
  assert.equal(schedule.mock.calls[0].arguments[1], 450);
  const animationTimer = schedule.mock.calls[0].result;
  s.unmount();
  assert.equal(cancel.mock.callCount(), 1);
  assert.equal(cancel.mock.calls[0].arguments[0], animationTimer);
});

test('board hook: disabled placement animations do not schedule a timer for new moves', t => {
  const s = setup(t, { stoneAnimationEnabled: false });
  const schedule = t.mock.method(globalThis, 'setTimeout');
  s.update({ lastMove: { x: 1, y: 1 } });
  assert.equal(s.api.animatingStoneId, null);
  const board = fixture();
  board[1][2] = { x: 2, y: 1, color: 'black', id: 'second' };
  s.update({ board, lastMove: { x: 2, y: 1 } });
  assert.equal(s.api.animatingStoneId, null);
  assert.equal(schedule.mock.callCount(), 0);
});

test('board hook: disabling placement animation cancels the active timer and clears its target', t => {
  const s = setup(t);
  const schedule = t.mock.method(globalThis, 'setTimeout');
  const cancel = t.mock.method(globalThis, 'clearTimeout');
  s.update({ lastMove: { x: 1, y: 1 } });
  const animationTimer = schedule.mock.calls[0].result;
  assert.equal(s.api.animatingStoneId, 'first');
  s.tick(200);
  s.update({ stoneAnimationEnabled: false });
  assert.equal(s.api.animatingStoneId, null);
  assert.equal(cancel.mock.callCount(), 1);
  assert.equal(cancel.mock.calls[0].arguments[0], animationTimer);
  s.tick(250);
  assert.equal(s.api.animatingStoneId, null);
  assert.equal(schedule.mock.callCount(), 1, 'disabling must not schedule a replacement timer');
  s.update({ stoneAnimationEnabled: true });
  assert.equal(s.api.animatingStoneId, null, 're-enabling must not resume the interrupted animation');
  assert.equal(schedule.mock.callCount(), 1);
});

test('board hook: enabling placement animation waits for a new stone instead of replaying the last move', t => {
  const s = setup(t, { stoneAnimationEnabled: false });
  const schedule = t.mock.method(globalThis, 'setTimeout');
  s.update({ lastMove: { x: 1, y: 1 } });
  s.update({ stoneAnimationEnabled: true });
  assert.equal(s.api.animatingStoneId, null);
  s.update({ board: fixture(), lastMove: { x: 1, y: 1 } });
  assert.equal(s.api.animatingStoneId, null, 'new object identities must not replay the same stone');
  assert.equal(schedule.mock.callCount(), 0);

  const board = fixture();
  board[1][2] = { x: 2, y: 1, color: 'black', id: 'second' };
  s.update({ board, lastMove: { x: 2, y: 1 } });
  assert.equal(s.api.animatingStoneId, 'second');
  assert.equal(schedule.mock.callCount(), 1);
  s.tick(450);
  assert.equal(s.api.animatingStoneId, null);
});

for (const changeCoordinates of [false, true]) {
  test(`board hook: disabled mounted last move is not replayed after enabling${changeCoordinates ? ' with new coordinates' : ''}`, t => {
    const s = setup(t, { stoneAnimationEnabled: false, lastMove: { x: 1, y: 1 } });
    const schedule = t.mock.method(globalThis, 'setTimeout');
    assert.equal(s.api.animatingStoneId, null);
    if (changeCoordinates) s.update({ showCoordinates: true });
    s.update({ stoneAnimationEnabled: true });
    assert.equal(s.api.animatingStoneId, null, 'mounting or resetting geometry must retain the last stone identity');
    assert.equal(schedule.mock.callCount(), 0);
  });
}

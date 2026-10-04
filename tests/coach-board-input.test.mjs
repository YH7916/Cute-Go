import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Real game actions and board interaction with the existing hook host. These
// checks cover decisions and state ownership, not browser event dispatch.
const { useGameState, useGameActions, useBoardInputAction, useBoardInteraction, createInitialPosition, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
    export { useGameState } from './hooks/useGameState';
    export { useGameActions } from './hooks/useGameActions';
    export { useBoardInputAction } from './hooks/gameActions/useBoardInputAction';
    export { useBoardInteraction } from './components/board/useBoardInteraction';
    export { createInitialPosition } from './domains/game/positionState';
    export { renderHook } from './tests/helpers/reactHooks';
  `,
});

function occupiedPosition() {
  const position = createInitialPosition(9);
  position.board[1][1] = { x: 1, y: 1, color: 'black', id: 'occupied' };
  position.blackCaptures = 2;
  position.whiteCaptures = 3;
  position.lastMove = { x: 1, y: 1 };
  position.consecutivePasses = 1;
  return position;
}

function setupActions(t) {
  const noop = () => {};
  const rejected = [], sounds = [];
  const options = {
    aiTimerRef: { current: null }, aiTurnLock: { current: false }, boardSizeRef: { current: 9 },
    gameTypeRef: { current: 'Go' }, pendingEndGameRef: { current: null },
    myColorRef: { current: null }, onlineStatusRef: { current: 'disconnected' },
    onlineStatus: 'disconnected', myColor: null, isThinking: false, isWebThinking: false,
    session: null, isWorkerReady: false, displayTerritory: null, userProfile: null,
    settings: { gameMode: 'PvAI', coachMode: true, gameType: 'Go', boardSize: 9, userColor: 'black', setBoardSize: noop },
    sendData: async () => true, webAiEngine: { resetAI: noop }, requestAnalysis: () => true,
    checkEndGameAchievements: noop, checkMoveAchievements: noop, vibrate: noop, setIsThinking: noop,
    stopWebThinking: noop, cleanupOnline: noop, clearInitialStones: noop,
    setEloDiffStyle: noop, setEloDiffText: noop, setMyColor: noop, setShowMenu: noop, setShowPassModal: noop,
    playSfx: sound => sounds.push(sound), onIllegalMove: (point, position) => rejected.push({ point, position }),
  };
  const host = renderHook(() => {
    const state = useGameState(9);
    return { state, actions: useGameActions({ ...options, gameState: state }) };
  });
  t.after(() => host.unmount());
  host.render().state.writePosition(occupiedPosition());
  return { ...host, options, rejected, sounds };
}

test('coach user rejection reports the occupied point with the unchanged complete position', async t => {
  const s = setupActions(t), api = s.render();
  const before = api.state.readPosition(), snapshot = structuredClone(before);
  await api.actions.handleIntersectionClick(1, 1);
  assert.equal(s.rejected.length, 1);
  assert.deepEqual(s.rejected[0].point, { x: 1, y: 1 });
  assert.equal(s.rejected[0].position, before, 'explanation owns the exact rejected position');
  assert.equal(api.state.readPosition(), before);
  assert.deepEqual(before, snapshot, 'board, captures, last move, passes and history stay unchanged');
  assert.deepEqual(s.sounds, ['error']);
});

test('coach suicide rejection uses the real rule result without writing a new position', async t => {
  const s = setupActions(t), api = s.render();
  const before = createInitialPosition(9);
  for (const [x, y] of [[1, 0], [0, 1]]) before.board[y][x] = { x, y, color: 'white', id: `${x}-${y}` };
  api.state.writePosition(before);
  await api.actions.handleIntersectionClick(0, 0);
  assert.equal(s.rejected.length, 1);
  assert.deepEqual(s.rejected[0].point, { x: 0, y: 0 });
  assert.equal(s.rejected[0].position, before);
  assert.equal(api.state.readPosition(), before);
  assert.equal(before.board[0][0], null);
  assert.deepEqual(s.sounds, ['error']);
});

test('legal coach input commits a move without rejected-point teaching', async t => {
  const s = setupActions(t), api = s.render();
  const before = api.state.readPosition();
  await api.actions.handleIntersectionClick(4, 4);
  assert.deepEqual(s.rejected, []);
  assert.notEqual(api.state.readPosition(), before);
  assert.equal(api.state.readPosition().board[4][4].color, 'black');
  assert.equal(api.state.readPosition().history.length, 1);
  assert.deepEqual(s.sounds, ['move']);
});

for (const isRemote of [false, true]) {
  test(`${isRemote ? 'remote' : 'local AI'} executeMove rejection never masquerades as player input`, t => {
    const s = setupActions(t), api = s.render(), before = api.state.readPosition();
    api.actions.executeMove(1, 1, isRemote);
    assert.deepEqual(s.rejected, []);
    assert.equal(api.state.readPosition(), before);
    assert.deepEqual(s.sounds, isRemote ? [] : ['error']);
  });
}

for (const [label, patch] of [
  ['ordinary AI', { coachMode: false }], ['local two-player', { gameMode: 'PvP' }],
  ['Gomoku', { gameType: 'Gomoku' }],
]) {
  test(`${label} keeps its existing rejection behavior without coach notifications`, async t => {
    const s = setupActions(t);
    Object.assign(s.options.settings, patch);
    s.options.gameTypeRef.current = s.options.settings.gameType;
    const api = s.render(), before = api.state.readPosition();
    await api.actions.handleIntersectionClick(1, 1);
    assert.deepEqual(s.rejected, []);
    assert.equal(api.state.readPosition(), before);
    assert.deepEqual(s.sounds, ['error']);
  });
}

test('blocked player turns, finished games and review never request rejection teaching', async t => {
  const s = setupActions(t);
  let api = s.render();
  api.state.writePosition({ ...api.state.readPosition(), currentPlayer: 'white' });
  await api.actions.handleIntersectionClick(1, 1);
  api.state.writePosition(occupiedPosition());
  api.state.setGameOver(true);
  api = s.render();
  await api.actions.handleIntersectionClick(1, 1);
  api.state.setGameOver(false);
  api.state.setAppMode('review');
  api = s.render();
  await api.actions.handleIntersectionClick(1, 1);
  assert.deepEqual(s.rejected, []);
  assert.deepEqual(s.sounds, []);
});

test('legacy void move callbacks do not imply an illegal point', async t => {
  const s = setupActions(t), { state } = s.render(), calls = [];
  const input = renderHook(() => useBoardInputAction({ ...s.options, gameState: state }, (...args) => { calls.push(args); }));
  t.after(() => input.unmount());
  await input.render()(1, 1);
  assert.deepEqual(calls, [[1, 1, false]], 'the existing three-argument callback stays compatible');
  assert.deepEqual(s.rejected, []);
});

test('a rejection after position replacement cannot teach the previous board', async t => {
  const s = setupActions(t), { state } = s.render(), replacement = occupiedPosition();
  const input = renderHook(() => useBoardInputAction({ ...s.options, gameState: state }, () => {
    state.writePosition(replacement);
    return false;
  }));
  t.after(() => input.unmount());
  await input.render()(1, 1);
  assert.equal(state.readPosition(), replacement);
  assert.deepEqual(s.rejected, [], 'matching-looking resets still invalidate the old position identity');
});

function setupBoard(t, inspect) {
  const clicks = [], inspections = [], events = [];
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    vibrate: () => assert.fail('board inspection must not bypass the application feedback callback'),
  } });
  const props = { board: occupiedPosition().board, lastMove: null, showQi: true, showCoordinates: false,
    boardPixelSize: 200, onIntersectionClick: (x, y) => clicks.push([x, y]),
    vibrate: () => events.push('vibrate'),
    onInspectPoint: inspect ? (x, y) => { inspections.push([x, y]); events.push('inspect'); } : undefined };
  const host = renderHook(() => useBoardInteraction(props));
  t.after(() => {
    host.unmount();
    if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
    else Reflect.deleteProperty(globalThis, 'navigator');
  });
  host.render();
  return { ...host, props, clicks, inspections, events };
}

test('occupied inspection retains qi lines and notifies once after the existing feedback', t => {
  const s = setupBoard(t, true);
  s.render().handleIntersectionClickWrapper(1, 1);
  const qi = s.render().activeQiSegments;
  assert.equal(qi.length, 4);
  assert.ok(qi.every(segment => segment.x1 === 1 && segment.y1 === 1));
  assert.deepEqual(s.inspections, [[1, 1]]);
  assert.deepEqual(s.events, ['vibrate', 'inspect']);
  assert.deepEqual(s.clicks, [], 'inspection does not also dispatch an attempted move');
  s.render().handleIntersectionClickWrapper(2, 2);
  assert.deepEqual(s.render().activeQiSegments, []);
  assert.deepEqual(s.clicks, [[2, 2]]);
  assert.deepEqual(s.inspections, [[1, 1]], 'empty intersections only use the normal input path');
});

test('ordinary qi inspection and qi-disabled clicks preserve their original paths', t => {
  const s = setupBoard(t, false);
  s.render().handleIntersectionClickWrapper(1, 1);
  assert.equal(s.render().activeQiSegments.length, 4);
  assert.deepEqual(s.clicks, []);
  s.props.showQi = false;
  s.render().handleIntersectionClickWrapper(1, 1);
  assert.deepEqual(s.clicks, [[1, 1]]);
  assert.deepEqual(s.inspections, []);
});

test('qi-disabled occupied clicks never also dispatch the optional inspection callback', t => {
  const s = setupBoard(t, true);
  s.props.showQi = false;
  s.render().handleIntersectionClickWrapper(1, 1);
  assert.deepEqual(s.inspections, []);
  assert.deepEqual(s.clicks, [[1, 1]]);
});

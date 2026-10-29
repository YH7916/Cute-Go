import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Exercise the real hooks and rules, replacing only React's host. This covers
// callbacks before another render, not React scheduling or browser interaction.
const { useGameState, useGameAiSession, useMoveAction, usePassAction, useUndoAction, useResetGameAction, useScoringAction, useEndGameAction, renderHook, createBoard, evaluateScoring } = await loadTestModule({
  reactHost: true,
  contents: `
      export { useGameState } from './hooks/useGameState';
      export { useGameAiSession } from './hooks/useGameAiSession';
      export { useMoveAction } from './hooks/gameActions/useMoveAction';
      export { usePassAction } from './hooks/gameActions/usePassAction';
      export { useUndoAction } from './hooks/gameActions/useUndoAction';
      export { useResetGameAction } from './hooks/gameActions/useResetGameAction';
      export { useScoringAction } from './hooks/gameActions/useScoringAction';
      export { useEndGameAction } from './hooks/gameActions/useEndGameAction';
      export { renderHook } from './tests/helpers/reactHooks';
      export { createBoard } from './core/board';
      export { evaluateScoring } from './domains/game/scoringResult';
    `,
});

function setup(t, gameType = 'Go', boardSize = 9) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: Object.assign(new EventTarget(), { hidden: false }),
  });
  const noop = () => {};
  const endings = [];
  const achievements = [];
  let scoring = 0;
  const options = {
    aiTimerRef: { current: null }, aiTurnLock: { current: false },
    boardSizeRef: { current: boardSize }, gameTypeRef: { current: gameType },
    pendingEndGameRef: { current: null },
    myColorRef: { current: null }, onlineStatusRef: { current: 'disconnected' },
    onlineStatus: 'disconnected', isWebThinking: false,
    session: null,
    isWorkerReady: false, displayTerritory: null, userProfile: null,
    requestAnalysis: () => true, checkEndGameAchievements: input => achievements.push(input),
    settings: { gameMode: 'PvP', gameType, boardSize, userColor: 'black', setBoardSize: noop },
    sendData: async () => true,
    checkMoveAchievements: noop, playSfx: noop, vibrate: noop,
    stopWebThinking: noop, cleanupOnline: noop,
    setEloDiffStyle: noop, setEloDiffText: noop,
    setMyColor: noop, setShowMenu: noop,
  };
  const host = renderHook(() => {
    const state = useGameState(boardSize);
    const ai = useGameAiSession({ boardSize, gameState: state, executeMoveRef: { current: noop },
      handlePassRef: { current: noop }, endGameRef: { current: noop }, setToastMsg: noop });
    Object.assign(options, { aiTimerRef: ai.aiTimerRef, aiTurnLock: ai.aiTurnLock,
      pendingEndGameRef: ai.pendingEndGameRef });
    const input = { ...options, gameState: state, webAiEngine: ai.webAiEngine };
    return {
      state,
      move: useMoveAction(input, (...args) => endings.push(args)),
      pass: usePassAction(input, () => scoring++),
      undo: useUndoAction(input), reset: useResetGameAction(input),
      score: useScoringAction(input, (...args) => endings.push(args)),
      end: useEndGameAction(input),
    };
  });
  t.after(() => {
    host.unmount();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  return { ...host, options, endings, achievements, get scoring() { return scoring; } };
}

function capturingPosition(state) {
  const board = createBoard(9);
  for (const [x, y, color] of [[1, 1, 'white'], [0, 1, 'black'], [1, 0, 'black'], [2, 1, 'black']]) {
    board[y][x] = { x, y, color, id: `${x}-${y}` };
  }
  state.writePosition({
    ...state.readPosition(), board, currentPlayer: 'black',
    blackCaptures: 2, whiteCaptures: 3, lastMove: { x: 2, y: 1 }, consecutivePasses: 1,
  });
  return board;
}

function assertRefs(state) {
  assert.equal(state.boardRef.current, state.board);
  assert.equal(state.historyRef.current, state.history);
  assert.equal(state.currentPlayerRef.current, state.currentPlayer);
}

test('two passes before the next render retain both snapshots and trigger scoring', async t => {
  const host = setup(t);
  const api = host.render();
  await Promise.all([api.pass(true), api.pass(true)]);
  const { state } = host.render();
  assert.equal(state.consecutivePasses, 2);
  assert.equal(host.scoring, 1);
  assert.deepEqual(state.history.map(item => [item.currentPlayer, item.consecutivePasses]), [['black', 0], ['white', 1]]);
  assert.equal(state.currentPlayer, 'white', 'the second pass keeps the scoring side to play');
  assertRefs(state);
});

test('successive moves snapshot captures, last move and passes from the latest position', t => {
  const host = setup(t);
  capturingPosition(host.render().state);
  const api = host.render();
  api.move(1, 2, true);
  api.move(8, 8, true);
  const { state } = host.render();
  assert.equal(state.blackCaptures, 3);
  assert.equal(state.whiteCaptures, 3);
  assert.equal(state.board[1][1], null);
  assert.equal(state.board[8][8].color, 'white');
  assert.deepEqual(state.history.map(item => ({ captures: item.blackCaptures, move: item.lastMove, passes: item.consecutivePasses })), [
    { captures: 2, move: { x: 2, y: 1 }, passes: 1 },
    { captures: 3, move: { x: 1, y: 2 }, passes: 0 },
  ]);
  assertRefs(state);
});

for (const color of ['black', 'white']) {
  test(`${color}: move action rejects immediate ko recapture without changing the complete position`, t => {
    const host = setup(t);
    const api = host.render();
    const board = createBoard(9);
    const opponent = color === 'black' ? 'white' : 'black';
    for (const [x, y] of [[0, 1], [1, 0], [1, 2]]) board[y][x] = { x, y, color, id: `${x}-${y}` };
    for (const [x, y] of [[1, 1], [2, 0], [3, 1], [2, 2]]) board[y][x] = { x, y, color: opponent, id: `${x}-${y}` };
    api.state.writePosition({
      ...api.state.readPosition(), board, currentPlayer: opponent,
      blackCaptures: 2, whiteCaptures: 3, lastMove: { x: 3, y: 1 }, consecutivePasses: 1,
    });
    // Keep an older, different snapshot to catch using the wrong history end.
    assert.equal(api.move(8, 8, true), true);
    const original = api.state.readPosition();
    const originalSnapshot = structuredClone(original);
    assert.equal(api.move(2, 1, true), true);
    const captured = api.state.readPosition();
    const capturedSnapshot = structuredClone(captured);
    assert.equal(captured.board[1][1], null);
    assert.equal(captured.board[1][2].color, color);
    assert.equal(captured.currentPlayer, opponent);
    assert.equal(captured.blackCaptures, color === 'black' ? 3 : 2);
    assert.equal(captured.whiteCaptures, color === 'white' ? 4 : 3);
    assert.deepEqual(captured.lastMove, { x: 2, y: 1 });
    assert.equal(captured.consecutivePasses, 0);
    const { history, ...beforeCapture } = original;
    assert.deepEqual(captured.history, [...history, { ...beforeCapture, move: { x: 2, y: 1 } }]);
    for (const isRemote of [false, true]) {
      assert.equal(api.move(1, 1, isRemote), false);
      assert.equal(api.state.readPosition(), captured, 'rejection must not publish a new position');
      assert.deepEqual(api.state.readPosition(), capturedSnapshot);
      assert.deepEqual(original, originalSnapshot, 'neither the input board nor its history may be mutated');
    }
    assertRefs(host.render().state);
    api.undo();
    assert.deepEqual(api.state.readPosition(), originalSnapshot);
    assert.equal(api.state.readPosition().board, original.board);
    assertRefs(host.render().state);
  });
}

test('undo restores every position field even when moves and undo share a render', t => {
  const host = setup(t);
  const originalBoard = capturingPosition(host.render().state);
  const api = host.render();
  api.move(1, 2, true);
  api.move(8, 8, true);
  api.undo();
  let { state } = host.render();
  assert.equal(state.history.length, 1);
  assert.equal(state.board[8][8], null);
  assert.equal(state.currentPlayer, 'white');
  assert.equal(state.blackCaptures, 3);
  assert.deepEqual(state.lastMove, { x: 1, y: 2 });
  assert.equal(state.consecutivePasses, 0);
  assertRefs(state);
  api.undo();
  state = host.render().state;
  assert.equal(state.board, originalBoard);
  assert.equal(state.history.length, 0);
  assert.equal(state.currentPlayer, 'black');
  assert.equal(state.blackCaptures, 2);
  assert.equal(state.whiteCaptures, 3);
  assert.deepEqual(state.lastMove, { x: 2, y: 1 });
  assert.equal(state.consecutivePasses, 1);
  assertRefs(state);
});

for (const coachMode of [false, true]) {
  for (const aiReplied of [false, true]) {
    test(`${coachMode ? 'coach' : 'ordinary AI'} undo restores the human turn ${aiReplied ? 'after the reply' : 'while awaiting the reply'}`, t => {
      const host = setup(t);
      const originalBoard = capturingPosition(host.render().state);
      Object.assign(host.options.settings, { gameMode: 'PvAI', coachMode });
      const api = host.render();
      const original = api.state.readPosition();
      api.move(1, 2, false);
      if (aiReplied) api.move(8, 8, false);
      host.options.pendingEndGameRef.current = { stale: true };
      host.options.aiTurnLock.current = true;
      api.undo();
      const current = api.state.readPosition();
      assert.deepEqual(current, original);
      assert.equal(current.board, originalBoard);
      assert.equal(current.currentPlayer, 'black');
      assert.equal(host.options.pendingEndGameRef.current, null);
      assert.equal(host.options.aiTurnLock.current, false);
      assertRefs(host.render().state);
    });
  }
}

test('reset publishes one complete empty position and shares its history with legacy refs', async t => {
  const host = setup(t);
  capturingPosition(host.render().state);
  const api = host.render();
  api.move(1, 2, true);
  host.options.pendingEndGameRef.current = { stale: true };
  await api.reset(false, 13);
  const position = api.state.readPosition();
  assert.equal(position.board.length, 13);
  assert.ok(position.board.flat().every(stone => stone === null));
  assert.equal(position.currentPlayer, 'black');
  assert.equal(position.blackCaptures, 0);
  assert.equal(position.whiteCaptures, 0);
  assert.equal(position.lastMove, null);
  assert.equal(position.consecutivePasses, 0);
  assert.deepEqual(position.history, []);
  assert.equal(api.state.historyRef.current, position.history);
  assert.equal(host.options.pendingEndGameRef.current, null);
  const { state } = host.render();
  assert.equal(state.board, position.board);
  assertRefs(state);
});

test('complete writes update latest read-only refs without exposing field writers', t => {
  const host = setup(t);
  const { state } = host.render();
  const board = createBoard(13);
  state.writePosition(position => ({ ...position, board, blackCaptures: position.blackCaptures + 2 }));
  state.writePosition(position => ({ ...position, blackCaptures: position.blackCaptures + 3, currentPlayer: 'white' }));
  assert.equal(state.boardRef.current, board);
  assert.equal(state.readPosition().blackCaptures, 5);
  assert.throws(() => { state.currentPlayerRef.current = 'black'; }, TypeError);
  assert.throws(() => { state.boardRef.current = createBoard(9); }, TypeError);
  assert.throws(() => { state.historyRef.current = []; }, TypeError);
  for (const name of ['setBoard', 'setCurrentPlayer', 'setBlackCaptures', 'setWhiteCaptures',
    'setLastMove', 'setConsecutivePasses', 'setHistory']) assert.equal(name in state, false);
  assert.equal(state.readPosition().currentPlayer, 'white');
  assert.equal(host.render().state.currentPlayer, 'white');
});

test('scoring requested immediately after a capture stores the current capture counts', t => {
  const host = setup(t);
  capturingPosition(host.render().state);
  host.options.settings.gameMode = 'PvAI';
  host.options.isWorkerReady = true;
  const api = host.render();
  api.move(1, 2, true);
  api.score();
  const request = host.options.pendingEndGameRef.current;
  assert.deepEqual(request.captures, { black: 3, white: 3 });
  assert.equal(request.board, api.state.readPosition().board);
  assert.equal(request.history, api.state.readPosition().history);
  assert.equal(request.player, 'white');
});

test('endgame achievements immediately after a capture use the current position', async t => {
  const host = setup(t);
  capturingPosition(host.render().state);
  host.options.settings.gameMode = 'PvAI';
  host.options.session = { user: { id: 'test-user' } };
  const api = host.render();
  api.move(1, 2, true);
  await api.end('black', 'test result');
  assert.equal(host.achievements.length, 1);
  assert.deepEqual(host.achievements[0].captures, { black: 3, white: 3 });
  assert.deepEqual(host.achievements[0].score, { black: 80, white: 6.5 });
});

function deadWhitePosition(state) {
  const board = createBoard(9);
  for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
    board[y][x] = { x, y, color: x === 4 && y === 4 ? 'white' : 'black', id: `${x}-${y}` };
  }
  state.writePosition(position => ({ ...position, board, blackCaptures: 2, whiteCaptures: 3 }));
  return new Float32Array(81).fill(1);
}

test('settled achievements retain dead-stone prisoners while preserving the recorded position', async t => {
  const host = setup(t);
  host.options.settings.gameMode = 'PvAI';
  host.options.session = { user: { id: 'test-user' } };
  const api = host.render();
  const ownership = deadWhitePosition(api.state);
  const position = api.state.readPosition();
  const before = structuredClone(position);
  const deadStone = position.board[4][4];
  const result = evaluateScoring({ board: position.board, history: position.history,
    player: position.currentPlayer, komi: 3.5, captures: { black: 2, white: 3 } }, ownership);
  assert.deepEqual(result.score, { black: 4, white: 6.5 });
  api.state.setFinalScore(result.score);
  await api.end('white', 'AI result', result.score);
  assert.equal(api.state.readPosition(), position);
  assert.equal(api.state.readPosition().board[4][4], deadStone);
  assert.deepEqual(api.state.readPosition(), before);
  assert.equal(host.achievements[0].score, result.score, 'achievements reuse the authoritative settlement');
  assert.deepEqual(host.achievements[0].score, host.render().state.finalScore);
  assert.deepEqual(host.achievements[0].captures, { black: 2, white: 3 });
});

test('local scoring passes its exact settled score to the endgame action', t => {
  const host = setup(t);
  host.options.displayTerritory = deadWhitePosition(host.render().state);
  const api = host.render();
  const position = api.state.readPosition();
  const before = structuredClone(position);
  const deadStone = position.board[4][4];
  api.score();
  assert.equal(api.state.readPosition(), position, 'local settlement must preserve the recorded position');
  assert.equal(api.state.readPosition().board[4][4], deadStone);
  assert.deepEqual(api.state.readPosition(), before);
  const score = host.render().state.finalScore;
  assert.deepEqual(score, { black: 4, white: 6.5 });
  assert.equal(host.endings[0][0], 'white');
  assert.equal(host.endings[0][2], score, 'the endgame callback receives the same score shown by the UI');
});

for (const reset of [false, true]) {
  test(`delayed Gomoku win ${reset ? 'is invalidated by reset' : 'still ends the unchanged game'}`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const host = setup(t, 'Gomoku', 15);
    let api = host.render();
    const board = createBoard(15);
    for (let x = 0; x < 4; x++) board[7][x] = { color: 'black', x, y: 7, id: String(x) };
    api.state.writePosition(position => ({ ...position, board }));
    api = host.render();
    api.move(4, 7, false);
    if (reset) await api.reset();
    t.mock.timers.tick(0);
    assert.deepEqual(host.endings, reset ? [] : [['black', '五子连珠！']]);
  });
}

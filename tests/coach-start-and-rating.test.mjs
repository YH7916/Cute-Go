import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Compose the real start/reset/end hooks. The lightweight host verifies state
// ownership and callback routing; browser rendering remains separate acceptance.
const { useStartGameFlow, useResetGameAction, useEndGameAction, useGameState,
  createInitialPosition, recordMove, deferAiMove, platform, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
    export { useStartGameFlow } from './hooks/useStartGameFlow';
    export { useResetGameAction } from './hooks/gameActions/useResetGameAction';
    export { useEndGameAction } from './hooks/gameActions/useEndGameAction';
    export { useGameState } from './hooks/useGameState';
    export { createInitialPosition, recordMove } from './domains/game/positionState';
    export { deferAiMove } from './domains/game/deferredAiMove';
    export { platform } from './services/platform';
    export { renderHook } from './tests/helpers/reactHooks';
  `,
});

function setup(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true, value: Object.assign(new EventTarget(), { hidden: false }),
  });
  const noop = () => {};
  const events = [], achievements = [], fetched = [], eloTexts = [], eloStyles = [];
  const updateElo = t.mock.method(platform.profile, 'updateElo', async () => {});
  const applyOnline = t.mock.method(platform.profile, 'applyOnlineMatchResult', async () => {});
  const settings = {
    gameType: 'Gomoku', gameMode: 'PvP', difficulty: 'Hard', userColor: 'white', boardSize: 15, coachMode: false,
    setGameType: value => { settings.gameType = value; },
    setGameMode: value => { settings.gameMode = value; },
    setDifficulty: value => { settings.difficulty = value; },
    setCoachMode: value => { settings.coachMode = value; },
    setUserColor: value => { settings.userColor = value; },
    setBoardSize: value => { settings.boardSize = value; },
  };
  let showStartScreen = true;
  const webAiEngine = {
    isWorkerReady: false, isInitializing: false,
    initializeAI: value => events.push(['initialize', value]),
    terminateAI: () => events.push(['terminate']), resetAI: () => events.push(['reset-ai']),
  };
  const options = {
    settings, webAiEngine,
    aiTimerRef: { current: null }, aiTurnLock: { current: false },
    boardSizeRef: { current: 15 }, gameTypeRef: { current: 'Gomoku' },
    pendingEndGameRef: { current: null }, onlineStatusRef: { current: 'disconnected' },
    onlineStatus: 'disconnected', myColor: null, opponentProfile: null,
    session: { user: { id: 'player-1' }, provider: 'taptap' }, userProfile: { id: 'player-1', elo: 800 },
    displayTerritory: null, checkEndGameAchievements: value => achievements.push(value),
    fetchProfile: async id => { fetched.push(id); },
    stopWebThinking: () => events.push(['stop-thinking']),
    cleanupOnline: value => events.push(['cleanup-online', value]),
    sendData: async value => { events.push(['send', value]); return true; },
    setEloDiffText: value => eloTexts.push(value), setEloDiffStyle: value => eloStyles.push(value),
    clearInitialStones: noop, setShowMenu: noop, setShowPassModal: noop, setIsThinking: noop,
    setMyColor: noop, playSfx: noop, vibrate: noop,
  };
  const host = renderHook(() => {
    const state = useGameState(15);
    const input = { ...options, gameState: state };
    const resetGame = useResetGameAction(input);
    return { state, end: useEndGameAction(input), ...useStartGameFlow({
      settings, showStartScreen, setShowStartScreen: value => { showStartScreen = value; },
      appMode: state.appMode, webAiEngine, gameTypeRef: options.gameTypeRef, resetGame,
      vibrate: noop,
    }) };
  });
  t.after(() => {
    host.unmount();
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  return { ...host, settings, options, events, achievements, fetched, eloTexts, eloStyles,
    updateElo, applyOnline, get showStartScreen() { return showStartScreen; } };
}

test('coach start makes a fresh black-first 9x9 game and cancels the previous game', t => {
  const s = setup(t);
  const api = s.render();
  const previous = api.state.readPosition();
  const board = previous.board.map(row => [...row]);
  board[3][3] = { x: 3, y: 3, color: 'black', id: 'previous-game' };
  api.state.writePosition({ ...recordMove(previous, board, { x: 3, y: 3 }, 2, false),
    whiteCaptures: 3, consecutivePasses: 1 });
  api.state.setGameOver(true);
  api.state.setFinalScore({ black: 1, white: 2 });
  s.options.pendingEndGameRef.current = { board, history: api.state.readPosition().history };
  s.options.aiTurnLock.current = true;
  let staleMoves = 0;
  deferAiMove({ timer: s.options.aiTimerRef,
    readPosition: () => { const p = api.state.readPosition(); return { board: p.board, history: p.history, player: p.currentPlayer }; },
    allowed: () => true, apply: () => staleMoves++,
  });

  api.handleStartCoach();
  const current = s.render();
  assert.deepEqual({ gameType: s.settings.gameType, gameMode: s.settings.gameMode,
    difficulty: s.settings.difficulty, userColor: s.settings.userColor,
    boardSize: s.settings.boardSize, coachMode: s.settings.coachMode },
  { gameType: 'Go', gameMode: 'PvAI', difficulty: 'Fun', userColor: 'black', boardSize: 9, coachMode: true });
  assert.equal(s.options.gameTypeRef.current, 'Go');
  assert.equal(s.options.boardSizeRef.current, 9);
  assert.deepEqual(current.state.readPosition(), createInitialPosition(9));
  assert.notEqual(current.state.readPosition().board, board);
  assert.equal(current.state.gameOver, false);
  assert.equal(current.state.finalScore, null);
  assert.equal(s.options.pendingEndGameRef.current, null);
  assert.equal(s.options.aiTimerRef.current, null);
  assert.equal(s.options.aiTurnLock.current, false);
  assert.equal(s.showStartScreen, false);
  assert.deepEqual(s.events, [['reset-ai'], ['cleanup-online', true], ['terminate']]);
  t.mock.timers.tick(500);
  assert.equal(staleMoves, 0);
});

test('ordinary AI start leaves coach mode and promotes its Fun difficulty to Easy', t => {
  const s = setup(t);
  s.render().handleStartCoach();
  const api = s.render();
  s.events.length = 0;
  api.handleStartGame('PvAI', 'local', 'Go');
  assert.equal(s.settings.coachMode, false);
  assert.equal(s.settings.difficulty, 'Easy');
  assert.equal(s.settings.gameMode, 'PvAI');
  assert.deepEqual(s.events.filter(([event]) => event === 'initialize'), [['initialize', { needModel: true }]]);
  assert.equal(s.events.filter(([event]) => event === 'reset-ai').length, 1);
});

test('ordinary local two-player start clears coach mode and terminates the AI', t => {
  const s = setup(t);
  s.render().handleStartCoach();
  const api = s.render();
  s.events.length = 0;
  api.handleStartGame('PvP', undefined, 'Gomoku');
  assert.equal(s.settings.coachMode, false);
  assert.equal(s.settings.gameType, 'Gomoku');
  assert.equal(s.settings.gameMode, 'PvP');
  assert.equal(s.events.filter(([event]) => event === 'terminate').length, 1);
  assert.equal(s.events.some(([event]) => event === 'initialize'), false);
});

for (const winner of ['black', 'white']) {
  test(`coach ${winner === 'black' ? 'win' : 'loss'} ends normally without ratings or achievements`, async t => {
    const s = setup(t);
    Object.assign(s.settings, { gameType: 'Go', gameMode: 'PvAI', coachMode: true, userColor: 'black', difficulty: 'Fun' });
    s.options.pendingEndGameRef.current = { pending: true };
    s.options.aiTurnLock.current = true;
    let staleMoves = 0;
    s.options.aiTimerRef.current = setTimeout(() => staleMoves++, 200);
    await s.render().end(winner, '陪练结束', { black: 40, white: 41 });
    const { state } = s.render();
    assert.equal(state.gameOver, true);
    assert.equal(state.winner, winner);
    assert.equal(state.winReason, '陪练结束');
    assert.equal(s.options.pendingEndGameRef.current, null);
    assert.equal(s.options.aiTurnLock.current, false);
    assert.equal(s.options.aiTimerRef.current, null);
    assert.deepEqual(s.events, [['stop-thinking']]);
    assert.deepEqual(s.eloTexts, [null]);
    assert.deepEqual(s.eloStyles, [null]);
    assert.deepEqual(s.achievements, []);
    assert.deepEqual(s.fetched, []);
    assert.equal(s.updateElo.mock.callCount(), 0);
    assert.equal(s.applyOnline.mock.callCount(), 0);
    t.mock.timers.tick(500);
    assert.equal(staleMoves, 0);
  });
}

test('ordinary AI victory still records the settled achievement and updates the profile', async t => {
  const s = setup(t);
  Object.assign(s.settings, { gameType: 'Go', gameMode: 'PvAI', difficulty: 'Easy', userColor: 'black' });
  const score = { black: 42, white: 39 };
  await s.render().end('black', '数目结束', score);
  assert.deepEqual(s.achievements, [{ winner: 'black', myColor: 'black', score, captures: { black: 0, white: 0 } }]);
  assert.deepEqual(s.updateElo.mock.calls.map(call => call.arguments), [['player-1', 808]]);
  assert.equal(s.applyOnline.mock.callCount(), 0);
  assert.deepEqual(s.fetched, ['player-1']);
  assert.deepEqual(s.eloTexts, ['+8']);
  assert.equal(s.render().state.winReason, '数目结束 (积分 +8)');
});

test('online games retain competitive settlement even if a stale coach flag is present', async t => {
  const s = setup(t);
  Object.assign(s.settings, { gameType: 'Go', gameMode: 'PvAI', coachMode: true });
  Object.assign(s.options, { onlineStatus: 'connected', myColor: 'black', opponentProfile: { id: 'player-2', elo: 800 } });
  await s.render().end('black', '联机结束', { black: 42, white: 39 });
  assert.equal(s.achievements.length, 1);
  assert.equal(s.updateElo.mock.callCount(), 0);
  assert.equal(s.applyOnline.mock.callCount(), 1);
  assert.equal(s.applyOnline.mock.calls[0].arguments[0].winnerId, 'player-1');
  assert.equal(s.applyOnline.mock.calls[0].arguments[0].loserId, 'player-2');
  assert.deepEqual(s.fetched, ['player-1']);
});

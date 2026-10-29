import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Real settings, apply/reset and turn scheduling; only the AI request boundary
// and browser APIs are replaced. Model inference and browser UI are separate checks.
for (const [difficulty, boardSize, simulations, temperature] of [
  ['Easy', 13, 1, 0], ['Medium', 19, 4, 0.22], ['Hard', 11, 1, 0],
]) {
  test(`applying ${difficulty} coach settings preserves practice and requests the selected game`, async t => {
    const stored = new Map(Object.entries({ boardSize: '9', gameType: '"Go"', gameMode: '"PvAI"',
      difficulty: '"Fun"', userColor: '"black"' }));
    const globals = {
      localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
      document: Object.assign(new EventTarget(), { hidden: false }),
      navigator: { userAgent: 'Desktop test' },
    };
    const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
    const { useAppSettings, useGameState, useApplySettingsFlow, useResetGameAction, useGameFlow,
      recordMove, renderHook } = await loadTestModule({ reactHost: true, registerCleanup: cleanup => t.after(cleanup), contents: `
        export { useAppSettings } from './hooks/useAppSettings';
        export { useGameState } from './hooks/useGameState';
        export { useApplySettingsFlow } from './hooks/useApplySettingsFlow';
        export { useResetGameAction } from './hooks/gameActions/useResetGameAction';
        export { useGameFlow } from './hooks/useGameFlow';
        export { recordMove } from './domains/game/positionState';
        export { renderHook } from './tests/helpers/reactHooks';
      ` });
    const noop = () => {};
    const requests = [], initialization = [];
    const aiTimerRef = { current: null }, aiTurnLock = { current: false }, boardSizeRef = { current: 9 };
    let menuOpen = true;
    const engine = { isWorkerReady: false, isInitializing: false,
      initializeAI: value => { initialization.push(value); engine.isInitializing = true; },
      terminateAI: noop, resetAI: noop };
    const host = renderHook(() => {
      const settings = useAppSettings();
      const state = useGameState(settings.boardSize);
      const resetGame = useResetGameAction({ settings, gameState: state, boardSizeRef, webAiEngine: engine,
        onlineStatusRef: { current: 'disconnected' }, cleanupOnline: noop, sendData: async () => true,
        setEloDiffStyle: noop, setEloDiffText: noop, setMyColor: noop, setShowMenu: value => { menuOpen = value; } });
      const apply = useApplySettingsFlow({ settings, resetGame, aiTimerRef, aiTurnLock,
        setToastMsg: noop, stopWebThinking: noop, userProfile: null, vibrate: noop, webAiEngine: engine });
      useGameFlow({ settings, gameState: state, showStartScreen: false, aiTimerRef, aiTurnLock,
        webAi: { isWorkerReady: engine.isWorkerReady, isWebLoading: false, isWebThinking: false,
          isWebInitializing: engine.isInitializing, webWinRate: 50, webLead: null, webTerritory: null,
          stopWebThinking: noop, requestWebAiMove: (...args) => requests.push(args) } });
      return { settings, state, apply };
    });
    t.after(() => {
      host.unmount();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else Reflect.deleteProperty(globalThis, key);
      }
    });
    let api = host.render();
    api.settings.setCoachMode(true);
    api = host.render();
    const before = api.state.readPosition();
    const board = before.board.map(row => [...row]);
    board[3][3] = { x: 3, y: 3, color: 'black', id: 'old-game' };
    api.state.writePosition(recordMove(before, board, { x: 3, y: 3 }, 0, false));
    api.apply({ gameType: 'Go', gameMode: 'PvAI', boardSize, difficulty, userColor: 'white' });
    api = host.render();
    assert.equal(api.settings.coachMode, true);
    assert.equal(api.settings.userColor, 'white');
    assert.equal(api.state.board.length, boardSize);
    assert.ok(api.state.board.every(row => row.length === boardSize && row.every(stone => stone === null)));
    assert.equal(api.state.history.length, 0);
    assert.equal(api.state.currentPlayer, 'black');
    assert.equal(menuOpen, false);
    assert.equal(boardSizeRef.current, boardSize);
    assert.deepEqual(initialization, [{ needModel: true }]);
    assert.equal(requests.length, 1, 'AI starts as black after choosing white');
    const [requestedBoard, color, history, visits, komi, requestedDifficulty, requestedTemperature, gameType] = requests[0];
    assert.equal(requestedBoard, api.state.board);
    assert.equal(color, 'black');
    assert.deepEqual(history, []);
    assert.equal(visits, simulations);
    assert.equal(komi, 7.5);
    assert.equal(requestedDifficulty, difficulty);
    assert.equal(requestedTemperature, temperature);
    assert.equal(gameType, 'Go');
    assert.equal(stored.get('boardSize'), String(boardSize));
    assert.equal(stored.get('difficulty'), JSON.stringify(difficulty));
    assert.equal(stored.get('userColor'), '"white"');
  });
}

import { loadTestModule } from './loadTestModule.mjs';

const { useGameState, useGameAiSession, useGameActions, useGameFlow, useStartGameFlow, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
    export { useGameState } from './hooks/useGameState';
    export { useGameAiSession } from './hooks/useGameAiSession';
    export { useGameActions } from './hooks/useGameActions';
    export { useGameFlow } from './hooks/useGameFlow';
    export { useStartGameFlow } from './hooks/useStartGameFlow';
    export { renderHook } from './tests/helpers/reactHooks';
  `,
});

// Compose the same production hooks as AppController. Only the React host,
// clock, browser globals and non-game side effects are replaced. Fun executes
// the production beginner algorithm and response lifecycle, without ONNX.
export function setupGameFlow(t, { gameType = 'Go', boardSize = 9 } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(Math, 'random', () => 0.5);
  const stored = new Map();
  const errors = [], sounds = [];
  let workerCreations = 0;
  class ForbiddenWorker {
    constructor() { workerCreations++; throw new Error('Rules-only flow must not load a model Worker'); }
  }
  const globals = {
    Worker: ForbiddenWorker,
    document: Object.assign(new EventTarget(), { hidden: false }),
    localStorage: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
    window: { location: { origin: 'https://flow.test.invalid', pathname: '/' }, crossOriginIsolated: false },
  };
  const original = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const noop = () => {};
  const executeMoveRef = { current: noop }, handlePassRef = { current: noop }, endGameRef = { current: noop };
  const boardSizeRef = { current: boardSize }, gameTypeRef = { current: gameType };
  let showStartScreen = true;
  let showPassModal = false;
  const settings = {
    boardSize, gameType, gameMode: 'PvP', difficulty: 'Fun', userColor: 'black', showWinRate: false, coachMode: false,
    setBoardSize: value => { settings.boardSize = value; boardSizeRef.current = value; },
    setGameType: value => { settings.gameType = value; },
    setGameMode: value => { settings.gameMode = value; },
    setDifficulty: value => { settings.difficulty = value; },
    setUserColor: value => { settings.userColor = value; },
    setCoachMode: value => { settings.coachMode = value; },
  };
  const host = renderHook(() => {
    const state = useGameState(settings.boardSize);
    const ai = useGameAiSession({ boardSize: settings.boardSize, gameState: state,
      executeMoveRef, handlePassRef, endGameRef,
      setToastMsg: message => { if (message) errors.push(message); },
      setShowPassModal: value => { showPassModal = value; },
    });
    const engine = ai.webAiEngine;
    const flow = useGameFlow({
      settings, gameState: state, showStartScreen, showPassModal,
      isThinking: ai.isThinking, setIsThinking: ai.setIsThinking,
      aiTimerRef: ai.aiTimerRef, aiTurnLock: ai.aiTurnLock,
      webAi: { isWorkerReady: engine.isWorkerReady, isWebLoading: engine.isLoading,
        isWebThinking: engine.isThinking, isWebInitializing: engine.isInitializing,
        webWinRate: engine.aiWinRate, webLead: engine.aiLead, webTerritory: engine.aiTerritory,
        stopWebThinking: engine.stopThinking, requestWebAiMove: engine.requestWebAiMove },
    });
    const actions = useGameActions({
      settings, gameState: state, boardSizeRef, gameTypeRef,
      aiTimerRef: ai.aiTimerRef, aiTurnLock: ai.aiTurnLock, pendingEndGameRef: ai.pendingEndGameRef,
      isThinking: flow.showThinkingStatus, isWebThinking: engine.isThinking, isWorkerReady: engine.isWorkerReady,
      displayTerritory: flow.displayTerritory, requestAnalysis: engine.requestAnalysis,
      webAiEngine: engine, stopWebThinking: engine.stopThinking, setIsThinking: ai.setIsThinking,
      onlineStatus: 'disconnected', onlineStatusRef: { current: 'disconnected' },
      myColor: null, myColorRef: { current: null }, session: null, userProfile: null, opponentProfile: null,
      sendData: async () => true, fetchProfile: async () => {},
      checkMoveAchievements: noop, checkEndGameAchievements: noop, cleanupOnline: noop,
      clearInitialStones: noop, setEloDiffStyle: noop, setEloDiffText: noop,
      setMyColor: noop, setShowMenu: noop, setShowPassModal: value => { showPassModal = value; },
      playSfx: value => sounds.push(value), vibrate: noop,
    });
    executeMoveRef.current = actions.executeMove;
    handlePassRef.current = actions.handlePass;
    endGameRef.current = actions.endGame;
    const start = useStartGameFlow({ settings, showStartScreen,
      setShowStartScreen: value => { showStartScreen = value; },
      appMode: state.appMode, webAiEngine: engine, gameTypeRef, resetGame: actions.resetGame, vibrate: noop,
    });
    return { state, ai, flow, actions, start };
  });
  t.after(() => {
    host.unmount();
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  let api;
  const render = () => {
    // Explicitly observe effect updates; this is not a React scheduler emulator.
    host.render();
    api = host.render();
    return api;
  };
  render();
  return {
    render, settings, errors, sounds, get api() { return api; }, get workerCreations() { return workerCreations; },
    advance(milliseconds) { t.mock.timers.tick(milliseconds); return render(); },
    async start(mode = 'PvAI') {
      api.start.handleStartGame(mode, mode === 'PvAI' ? 'fun' : undefined, settings.gameType);
      return render();
    },
    async move(x, y) { await api.actions.handleIntersectionClick(x, y); return render(); },
    undo() { api.actions.handleUndo(); return render(); },
    async reset() { await api.actions.resetGame(false); return render(); },
    async pass() { await api.actions.handlePass(false); return render(); },
  };
}

import { loadTestModule } from './loadTestModule.mjs';

const { useGameState, useGameAiSession, useGameReview, useGameFlow, createInitialPosition, recordMove, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
    export { useGameState } from './hooks/useGameState';
    export { useGameAiSession } from './hooks/useGameAiSession';
    export { useGameReview } from './hooks/useGameReview';
    export { useGameFlow } from './hooks/useGameFlow';
    export { createInitialPosition, recordMove } from './domains/game/positionState';
    export { renderHook } from './tests/helpers/reactHooks';
  `,
});

export function setupAiSession(t, withGameFlow = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = [], moves = [], endings = [], errors = [];
  class FakeWorker {
    messages = [];
    constructor() { workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() {}
    emit(message) { this.onmessage?.({ data: message }); }
  }
  const globals = { Worker: FakeWorker, document: Object.assign(new EventTarget(), { hidden: false }),
    localStorage: { getItem: () => null, setItem() {} },
    window: { location: { origin: 'https://test.local', pathname: '/' }, crossOriginIsolated: false } };
  const old = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const options = { showTerritory: false, ownerScopeId: 'local:guest', onReviewRender: null };
  const host = renderHook(() => {
    const state = useGameState(9);
    const ai = useGameAiSession({ boardSize: 9, gameState: state,
      executeMoveRef: { current: (...args) => moves.push(args) }, handlePassRef: { current: () => moves.push('pass') },
      endGameRef: { current: (...args) => endings.push(args) }, setToastMsg: message => errors.push(message), setShowPassModal() {},
    });
    const review = useGameReview({ gameState: state, gameType: 'Go', showTerritory: options.showTerritory,
      ownerScopeId: options.ownerScopeId, engine: ai.webAiEngine });
    options.onReviewRender?.(review);
    const engine = ai.webAiEngine;
    const flow = withGameFlow ? useGameFlow({
      settings: { boardSize: 9, gameType: 'Go', gameMode: 'PvAI', difficulty: 'Fun', userColor: 'black', showWinRate: false },
      gameState: state, isThinking: ai.isThinking, setIsThinking: ai.setIsThinking,
      showStartScreen: false, showPassModal: false, aiTimerRef: ai.aiTimerRef, aiTurnLock: ai.aiTurnLock,
      webAi: { isWorkerReady: engine.isWorkerReady, isWebLoading: engine.isLoading, isWebThinking: engine.isThinking,
        isWebInitializing: engine.isInitializing, webWinRate: engine.aiWinRate, webLead: engine.aiLead,
        webTerritory: engine.aiTerritory, stopWebThinking: engine.stopThinking, requestWebAiMove: engine.requestWebAiMove },
    }) : null;
    return { state, ...ai, review, flow };
  });
  t.after(() => {
    host.unmount();
    for (const [key, value] of old) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
  });
  function ready() {
    const worker = workers.at(-1);
    const init = worker.messages.findLast(message => message.type === 'init' || message.type === 'reinit');
    worker.emit({ type: 'init-complete', generation: init.generation });
    return worker;
  }
  function reply(worker, request, ownership = Array(81).fill(0.5)) {
    worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
      data: { move: request.data.mode === 'analyze' ? null : { x: 2, y: 2 }, winRate: 50, lead: 1, ownership } });
  }
  return { ...host, options, workers, moves, endings, errors, ready, reply };
}

export { createInitialPosition, recordMove };


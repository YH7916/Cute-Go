import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { useWebKataGo, useGameFlow, useStartGameFlow, deferAiMove, renderHook } = await loadTestModule({
  reactHost: true,
  contents: "export {useWebKataGo} from './hooks/useWebKataGo'; export {useGameFlow} from './hooks/useGameFlow'; export {useStartGameFlow} from './hooks/useStartGameFlow'; export {deferAiMove} from './domains/game/deferredAiMove'; export {renderHook} from './tests/helpers/reactHooks';",
});

function setup(t, { composeStartFlow = false, composeGameFlow = false, deferMoves = false, difficulty = 'Easy', userColor = 'black' } = {}) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = [];
  class FakeWorker {
    messages = [];
    terminated = false;
    constructor() { workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() { this.terminated = true; }
    emit(message) { this.onmessage?.({ data: message }); }
  }
  const doc = Object.assign(new EventTarget(), { hidden: false });
  const globals = { Worker: FakeWorker, document: doc, localStorage: { getItem: () => null, setItem() {} }, window: {
    location: { origin: 'https://local.test', pathname: '/' }, crossOriginIsolated: false,
    setTimeout: (...args) => setTimeout(...args),
  } };
  const old = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const moves = [], analyses = [], errors = [];
  let callbacks = { boardSize: 9, onAiMove: (x, y) => moves.push([x, y]), onAiPass: () => moves.push('pass'), onAiError: error => errors.push(error), onAnalysisComplete: data => analyses.push(data) };
  const noop = () => {};
  const settings = { boardSize: 9, showWinRate: false, userColor, gameType: 'Go', gameMode: 'PvAI', difficulty,
    setGameType: noop, setGameMode: noop, setDifficulty: noop, setCoachMode: noop, setUserColor: noop };
  const gameTypeRef = { current: 'Go' };
  const board = Array.from({ length: 9 }, () => Array(9).fill(null));
  const gameState = { board, boardRef: { current: board }, currentPlayer: 'black', currentPlayerRef: { current: 'black' }, historyRef: { current: [] }, gameOver: false, appMode: 'playing' };
  const aiTurnLock = { current: false };
  const aiTimerRef = { current: null };
  if (deferMoves) callbacks.onAiMove = (x, y) => deferAiMove({
    timer: aiTimerRef,
    readPosition: () => ({ board: gameState.boardRef.current, history: gameState.historyRef.current, player: gameState.currentPlayerRef.current }),
    allowed: () => aiTurnLock.current && gameState.currentPlayerRef.current !== settings.userColor,
    apply: () => {
      moves.push([x, y]);
      const next = gameState.boardRef.current.map(row => [...row]);
      next[y][x] = { x, y, color: gameState.currentPlayerRef.current, id: `${x},${y}` };
      gameState.board = next;
      gameState.boardRef.current = next;
      gameState.currentPlayer = settings.userColor;
      gameState.currentPlayerRef.current = settings.userColor;
    },
  });
  const host = renderHook(() => {
    const webAiEngine = useWebKataGo(callbacks);
    if (composeGameFlow) useGameFlow({
      settings, gameState, isThinking: false, setIsThinking: noop, showStartScreen: false, showPassModal: false,
      aiTimerRef, aiTurnLock, webAi: {
        isWorkerReady: webAiEngine.isWorkerReady, isWebLoading: webAiEngine.isLoading,
        isWebThinking: webAiEngine.isThinking, isWebInitializing: webAiEngine.isInitializing,
        webWinRate: webAiEngine.aiWinRate, webLead: webAiEngine.aiLead, webTerritory: webAiEngine.aiTerritory,
        stopWebThinking: webAiEngine.stopThinking, requestWebAiMove: webAiEngine.requestWebAiMove,
      },
    });
    if (composeStartFlow) useStartGameFlow({
      settings, showStartScreen: false, setShowStartScreen: noop, appMode: 'playing', webAiEngine,
      gameTypeRef, resetGame: noop, vibrate: noop,
    });
    return webAiEngine;
  });
  let api = host.render();
  t.after(() => {
    host.unmount();
    for (const [key, value] of old) { if (value) Object.defineProperty(globalThis, key, value); else delete globalThis[key]; }
  });
  function ready(worker = workers.at(-1)) {
    const init = worker.messages.findLast(message => message.type === 'init' || message.type === 'reinit');
    worker.emit({ type: 'init-complete', generation: init.generation });
    api = host.render();
    return worker;
  }
  function response(worker, request, x = 2) {
    worker.emit({ type: 'ai-response', generation: request.generation, requestId: request.requestId, data: { move: { x, y: 2 }, winRate: 50, lead: 1, ownership: null } });
  }
  return { workers, moves, analyses, errors, doc, board, ready, response, gameState, aiTimerRef, aiTurnLock,
    get api() { return api; }, render: () => { api = host.render(); return api; },
    unmount: () => host.unmount(),
    callbacks: value => { callbacks = { ...callbacks, ...value }; api = host.render(); },
  };
}

test('hook: A cancelled then B ignores late A and routes B by its own mode', t => {
  const s = setup(t);
  s.api.initializeAI();
  const worker = s.ready();
  s.api.requestWebAiMove(s.board, 'black', []);
  const a = worker.messages.at(-1);
  s.api.stopThinking();
  s.api.requestAnalysis(s.board, 'white', []);
  const b = worker.messages.at(-1);
  s.response(worker, a);
  assert.equal(s.analyses.length, 0, 'a cancelled move must not become analysis B');
  s.response(worker, b);
  assert.equal(s.analyses.length, 1);
  assert.deepEqual(s.moves, []);
});

test('hook: cancelled Fun timer cannot consume a later Worker request', t => {
  const s = setup(t);
  s.api.initializeAI();
  const worker = s.ready();
  s.api.requestWebAiMove(s.board, 'black', [], 1, 3.5, 'Fun');
  s.api.stopThinking();
  s.api.requestWebAiMove(s.board, 'black', []);
  const b = worker.messages.at(-1);
  t.mock.timers.tick(180);
  assert.deepEqual(s.moves, []);
  s.response(worker, b);
  assert.deepEqual(s.moves, [[2, 2]]);
});

test('hook: init failure terminates worker and retry drains pending analysis', t => {
  const s = setup(t);
  s.api.requestAnalysis(s.board, 'black', []);
  const first = s.workers.at(-1);
  first.emit({ type: 'error', generation: first.messages[0].generation, message: 'load failed' });
  assert.equal(first.terminated, true);
  assert.equal(s.render().isThinking, false);
  s.api.resetAI();
  s.api.requestAnalysis(s.board, 'black', []);
  const second = s.ready();
  assert.notEqual(second, first);
  assert.equal(second.messages.at(-1).type, 'compute');
  s.response(second, second.messages.at(-1));
  assert.equal(s.analyses.length, 1);
});

test('hook: init timeout clears pending work and ignores a late ready from old worker', t => {
  const s = setup(t);
  s.api.requestWebAiMove(s.board, 'black', []);
  const first = s.workers[0];
  t.mock.timers.tick(60001);
  assert.equal(s.render().isThinking, false);
  assert.equal(first.terminated, true);
  s.api.resetAI();
  s.api.requestWebAiMove(s.board, 'black', []);
  first.emit({ type: 'init-complete', generation: first.messages[0].generation });
  assert.equal(s.render().isWorkerReady, false);
  const second = s.ready();
  s.response(second, second.messages.at(-1));
  assert.deepEqual(s.moves, [[2, 2]]);
});

test('hook: background cancels, foreground retry works and uses latest callback', t => {
  const s = setup(t);
  s.api.initializeAI();
  const worker = s.ready();
  s.api.requestWebAiMove(s.board, 'black', []);
  const a = worker.messages.at(-1);
  s.doc.hidden = true;
  s.doc.dispatchEvent(new Event('visibilitychange'));
  assert.equal(s.render().isThinking, false);
  s.doc.hidden = false;
  s.doc.dispatchEvent(new Event('visibilitychange'));
  const updated = [];
  s.callbacks({ onAiMove: (x, y) => updated.push([x, y]) });
  s.api.requestWebAiMove(s.board, 'black', []);
  const b = worker.messages.at(-1);
  s.response(worker, a);
  s.response(worker, b, 3);
  assert.deepEqual(updated, [[3, 2]]);
  assert.deepEqual(s.moves, []);
});

test('hook: reset during A waits for release before reinit and drains only new B', t => {
  const s = setup(t);
  s.api.initializeAI();
  const worker = s.ready();
  s.api.requestWebAiMove(s.board, 'black', []);
  const a = worker.messages.at(-1);
  s.api.resetAI();
  const release = worker.messages.at(-1);
  s.api.requestAnalysis(s.board, 'white', []);
  assert.equal(worker.messages.at(-1).type, 'release');
  s.response(worker, a);
  worker.emit({ type: 'released', generation: release.generation });
  assert.equal(worker.messages.at(-1).type, 'reinit');
  s.ready();
  assert.equal(worker.messages.at(-1).data.mode, 'analyze');
  s.response(worker, worker.messages.at(-1));
  assert.equal(s.analyses.length, 1);
  assert.deepEqual(s.moves, []);
});

test('hook: Busy analysis cannot be relabelled as a move, stale errors cannot fail B', t => {
  const s = setup(t);
  s.api.initializeAI();
  const worker = s.ready();
  s.api.requestAnalysis(s.board, 'black', []);
  const a = worker.messages.at(-1);
  assert.equal(s.api.requestWebAiMove(s.board, 'black', []), false);
  s.response(worker, a);
  assert.equal(s.analyses.length, 1);
  s.api.requestWebAiMove(s.board, 'black', []);
  const b = worker.messages.at(-1);
  worker.emit({ type: 'error', generation: a.generation, requestId: a.requestId, message: 'late failure' });
  assert.deepEqual(s.errors, []);
  s.response(worker, b);
  assert.deepEqual(s.moves, [[2, 2]]);
});

test('hook: reinit gets its own watchdog; terminate/unmount clears every timer', t => {
  const s = setup(t);
  s.api.initializeAI();
  const worker = s.ready();
  s.api.resetAI();
  const release = worker.messages.at(-1);
  worker.emit({ type: 'released', generation: release.generation });
  s.api.requestWebAiMove(s.board, 'black', []);
  assert.equal(worker.messages.at(-1).type, 'reinit');
  t.mock.timers.tick(60001);
  assert.equal(worker.terminated, true);
  assert.equal(s.render().isThinking, false);
  assert.equal(s.errors.length, 1);
  s.api.resetAI();
  s.api.requestWebAiMove(s.board, 'black', [], 1, 3.5, 'Fun');
  s.api.terminateAI();
  s.unmount();
  t.mock.timers.tick(120000);
  assert.deepEqual(s.moves, []);
  assert.equal(s.errors.length, 1);
});

test('hook: old thin Worker cannot complete or crash a replacement model Worker', t => {
  const s = setup(t);
  s.api.initializeAI({ needModel: false });
  const oldWorker = s.ready();
  const oldInit = oldWorker.messages[0];
  s.api.requestAnalysis(s.board, 'black', []);
  const replacement = s.workers.at(-1);
  assert.equal(oldWorker.terminated, true);
  assert.notEqual(replacement, oldWorker);
  oldWorker.emit({ type: 'init-complete', generation: oldInit.generation });
  oldWorker.onerror?.({ message: 'old crash' });
  assert.equal(s.render().isWorkerReady, false);
  s.ready(replacement);
  s.response(replacement, replacement.messages.at(-1));
  assert.equal(s.analyses.length, 1);
  assert.deepEqual(s.errors, []);
});

test('hook: persistent initialization failure stays stopped until explicit reset', t => {
  const s = setup(t);
  s.api.initializeAI();
  const worker = s.workers[0];
  worker.emit({ type: 'error', generation: worker.messages[0].generation, message: 'model HTTP 404' });
  for (let attempt = 0; attempt < 3; attempt++) {
    s.render().initializeAI();
    assert.equal(s.api.requestWebAiMove(s.board, 'black', []), false);
  }
  assert.equal(s.workers.length, 1, 'render effects cannot create an unbounded load retry loop');
  assert.equal(s.errors.length, 1);
  assert.equal(s.render().isThinking, false);
  s.api.resetAI();
  assert.equal(s.api.requestWebAiMove(s.board, 'black', []), true);
  const replacement = s.ready();
  s.response(replacement, replacement.messages.at(-1));
  assert.deepEqual(s.moves, [[2, 2]]);
});

test('hook integration: automatic start cannot repeatedly restart a permanently failing Worker', t => {
  const s = setup(t, { composeStartFlow: true });
  s.render();
  const first = s.workers[0];
  for (let attempt = 0; attempt < 3; attempt++) {
    const worker = s.workers.at(-1);
    worker.emit({ type: 'error', generation: worker.messages[0].generation, message: 'model HTTP 404' });
    s.render();
    s.render();
  }
  assert.equal(s.workers.length, 1, 'start-flow effects must not turn a permanent failure into a worker loop');
  assert.equal(first.terminated, true);
  assert.equal(s.errors.length, 1);
  assert.equal(s.api.isInitializing, false);
});

test('hook integration: hidden initialization stays cancelled and foreground starts one replacement', t => {
  const s = setup(t, { composeStartFlow: true });
  s.render();
  const first = s.workers[0];
  s.doc.hidden = true;
  s.doc.dispatchEvent(new Event('visibilitychange'));
  s.render();
  s.render();
  assert.equal(first.terminated, true);
  assert.equal(s.workers.length, 1, 'automatic initialization must not undo background cancellation');
  assert.equal(s.api.isInitializing, false);
  t.mock.timers.tick(60001);
  assert.deepEqual(s.errors, []);

  s.doc.hidden = false;
  s.doc.dispatchEvent(new Event('visibilitychange'));
  s.render();
  s.render();
  assert.equal(s.workers.length, 2);
  const second = s.ready();
  s.render();
  s.render();
  assert.equal(s.workers.length, 2, 'foreground recovery initializes exactly once');
  assert.equal(second.terminated, false);
  assert.equal(s.api.isWorkerReady, true);
});

test('hook integration: Fun AI plays first when the human chooses white', t => {
  const s = setup(t, { composeStartFlow: true, composeGameFlow: true, difficulty: 'Fun', userColor: 'white' });
  s.render();
  t.mock.timers.tick(180);
  assert.equal(s.moves.length, 1, 'automatic engine cleanup must not cancel the local Fun move');
  assert.equal(s.workers.length, 0, 'Fun play must remain model-free');
  assert.deepEqual(s.errors, []);
});

test('hook integration: Fun result awaiting deferred placement is not retried as a stale turn', t => {
  const s = setup(t, { composeStartFlow: true, composeGameFlow: true, deferMoves: true, difficulty: 'Fun', userColor: 'white' });
  s.render();
  t.mock.timers.tick(180);
  assert.equal(s.moves.length, 0, 'the result still has its normal 200 ms placement delay');
  const acceptedTimer = s.aiTimerRef.current;
  assert.notEqual(acceptedTimer, null);
  s.render();
  s.render();
  // A second Fun computation must not replace the already accepted move.
  t.mock.timers.tick(180);
  s.render();
  t.mock.timers.tick(20);
  s.render();
  assert.equal(s.moves.length, 1);
  assert.equal(s.gameState.currentPlayer, 'white');
  assert.equal(s.aiTimerRef.current, null);
  assert.equal(s.aiTurnLock.current, false);
  t.mock.timers.tick(1000);
  s.render();
  assert.equal(s.moves.length, 1, 'the turn passes to the human exactly once');
  assert.equal(s.workers.length, 0);
});

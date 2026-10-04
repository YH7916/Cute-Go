import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);
// Keep the actual controller, import/game/AI/coach hooks and rules together.
// Settings, unrelated native services and presentation use test adapters;
// the shared host does not emulate React scheduling or browser rendering.
const adapters = {
  useAppSettings: `let settings; export const setTestSettings = value => { settings = value; };
    export const useAppSettings = () => settings;`,
  useAudio: `export const useAudio = () => ({ playSfx() {}, vibrate() {} });`,
  useAppAuthProfile: `export const useAppAuthProfile = () => ({ session: null, userProfile: null,
    showLoginModal: false, setShowLoginModal() {}, fetchProfile: async () => {} });`,
  useAchievements: `export const useAchievements = () => ({ newUnlocked: null, clearNewUnlocked() {},
    checkEndGameAchievements() {}, checkMoveAchievements() {}, achievementsList: [], userAchievements: {} });`,
  useOnlineMatch: `export const useOnlineMatch = () => ({ onlineStatus: 'disconnected', myColor: null,
    setMyColor() {}, cleanupOnline() {}, sendData: async () => true, setShowOnlineMenu() {} });`,
  AppView: `export const AppView = () => null;`,
};
const { App, renderHook, setTestSettings } = await loadTestModule({
  reactHost: true, define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'controller-environment', setup(build) {
    build.onResolve({ filter: /jsx-runtime$/ }, () => ({ path: require.resolve('react/jsx-runtime') }));
    build.onResolve({ filter: /\/(useAppSettings|useAudio|useAppAuthProfile|useAchievements|useOnlineMatch|AppView)$/ }, args => {
      const name = args.path.split('/').at(-1);
      return { path: name, namespace: 'controller-adapter' };
    });
    build.onLoad({ filter: /.*/, namespace: 'controller-adapter' }, args => ({ contents: adapters[args.path], loader: 'js' }));
    // Keep the actual evidence/provider runtime; only skip its Worker transport.
    build.onResolve({ filter: /agent\/coach\/client$/ }, args => ({
      path: resolve(args.resolveDir, args.path.replace(/client$/, 'runtime.ts')), namespace: 'coach-runtime',
    }));
    build.onLoad({ filter: /.*/, namespace: 'coach-runtime' }, args => ({
      contents: `export { executeCoachAgent as runCoachAgent } from ${JSON.stringify(args.path)};`, loader: 'js', resolveDir: dirname(args.path),
    }));
  } }],
  contents: `export { default as App } from './AppController';
    export { setTestSettings } from './hooks/useAppSettings';
    export { renderHook } from './tests/helpers/reactHooks';`,
});

function setup(t, mode = 'PvAI', home = false) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = [];
  class FakeWorker {
    messages = [];
    constructor() { workers.push(this); }
    postMessage(message) { this.messages.push(message); }
    terminate() {}
    emit(message) { this.onmessage?.({ data: message }); }
  }
  const storage = new Map([['cute_go_tutorial_seen', 'true']]);
  const globals = { Worker: FakeWorker, document: Object.assign(new EventTarget(), { hidden: false }),
    window: { location: { origin: 'https://test.local', pathname: '/' }, crossOriginIsolated: false },
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key) } };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  const settings = { boardSize: 9, gameType: 'Go', gameMode: mode, difficulty: 'Hard', userColor: 'black',
    coachMode: false, skipStartScreen: !home, showWinRate: false, musicVolume: 0, hapticEnabled: false };
  for (const key of Object.keys(settings)) settings[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { settings[key] = value; };
  setTestSettings(settings);
  const host = renderHook(() => App().props.vm);
  t.after(() => {
    host.unmount();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const ready = () => {
    const worker = workers.at(-1);
    const init = worker.messages.findLast(message => message.type === 'init' || message.type === 'reinit');
    worker.emit({ type: 'init-complete', generation: init.generation });
    return worker;
  };
  const reply = (worker, request, move = null, details = {}) => worker.emit({ type: 'ai-response',
    requestId: request.requestId, generation: request.generation,
    data: { move, winRate: 50, lead: 0, ownership: Array(81).fill(0), ...details } });
  const importGame = key => {
    host.render().setImportKey(key);
    host.render().handleImport();
  };
  return { ...host, workers, settings, ready, reply, importGame };
}

const sgf = '(;SZ[9];B[aa])';
function cuteGoCode() {
  const board = Array.from({ length: 9 }, () => Array(9).fill('.'));
  board[0][0] = 'B';
  return btoa(JSON.stringify({ board, size: 9, turn: 'white', type: 'Go', bCaps: 2, wCaps: 3 }));
}
const computes = worker => worker.messages.filter(message => message.type === 'compute');

test('teaching from home is independent of the formal game and does not initialize a playing AI', async t => {
  const s = setup(t, 'PvAI', true);
  let vm = s.render();
  const game = vm.gameState.readPosition();
  vm.handleOpenLearning();
  s.render();
  await new Promise(resolve => setImmediate(resolve));
  s.render(); vm = s.render();
  assert.equal(vm.teaching.isOpen, true);
  assert.equal(vm.coach.active, false);
  assert.equal(vm.teaching.view.active.phase, 'practice');
  assert.equal(vm.gameState.readPosition(), game);
  assert.equal(s.workers.length, 0);
  vm.handleIntersectionClick(0, 0);
  await vm.handlePass();
  vm.handleUndo();
  assert.equal(vm.gameState.readPosition(), game, 'hidden formal-game controls cannot alter a lesson or game');
  const oldLessonAction = vm.teaching.view.active.onContinue;
  vm.handleReturnHome();
  oldLessonAction();
  vm = s.render();
  assert.equal(vm.teaching.isOpen, false);
  assert.equal(vm.teaching.view.active, null);
  assert.equal(vm.showStartScreen, true);
  assert.equal(vm.gameState.readPosition(), game);
  vm.handleStartCoach(); vm = s.render();
  assert.equal(vm.teaching.isOpen, false);
  assert.equal(vm.coach.active, true);
  assert.equal(vm.gameState.board.length, 9);
});

test('entering teaching cancels a deferred AI move synchronously and pauses further game requests', t => {
  const s = setup(t);
  let vm = s.render();
  const worker = s.ready();
  vm.handleIntersectionClick(0, 0); vm = s.render();
  const position = vm.gameState.readPosition();
  const request = computes(worker).at(-1);
  s.reply(worker, request, { x: 2, y: 2 });
  const oldBoardClick = vm.handleIntersectionClick;
  vm.handleOpenLearning();
  oldBoardClick(3, 3);
  t.mock.timers.tick(200);
  vm = s.render();
  assert.equal(vm.teaching.isOpen, true);
  assert.equal(vm.gameState.readPosition(), position);
  assert.equal(computes(worker).length, 1);
  assert.equal(vm.coach.active, false);
});

test('successful import leaves teaching and invalidates its old demonstration callback', async t => {
  const s = setup(t, 'PvP', true);
  s.render().handleOpenLearning(); s.render();
  await new Promise(resolve => setImmediate(resolve));
  s.render();
  const old = s.render().teaching.view.active.onContinue;
  s.importGame(sgf); old();
  const vm = s.render();
  assert.equal(vm.teaching.isOpen, false);
  assert.equal(vm.teaching.view.active, null);
  assert.equal(vm.showStartScreen, false);
  assert.equal(vm.gameState.board[0][0]?.color, 'black');
  assert.equal(vm.gameState.currentPlayer, 'white');
});

test('controller history inspection cancels a deferred AI move before the next render', t => {
  const s = setup(t);
  let vm = s.render();
  const worker = s.ready();
  vm.handleIntersectionClick(0, 0);
  vm = s.render();
  const position = vm.gameState.readPosition();
  const request = computes(worker).at(-1);
  s.reply(worker, request, { x: 2, y: 2 });
  vm.handleInspectReview(position);
  t.mock.timers.tick(200);
  assert.equal(vm.gameState.readPosition(), position, 'navigation clears the deferred move synchronously');
  vm = s.render();
  assert.equal(vm.gameState.appMode, 'review');
  assert.equal(vm.gameState.gameOver, false);
  assert.equal(vm.review.inVariation, true);
});

for (const gameOver of [false, true]) {
  test(`controller enters review without changing the original gameOver=${gameOver}`, t => {
    const s = setup(t, 'PvP');
    let vm = s.render();
    vm.gameState.setGameOver(gameOver);
    vm = s.render();
    const position = vm.gameState.readPosition();
    vm.handleEnterReview();
    vm = s.render();
    assert.equal(vm.gameState.appMode, 'review');
    assert.equal(vm.gameState.gameOver, gameOver);
    assert.equal(vm.gameState.readPosition(), position);
  });
}

test('controller import cancels old scoring and lets the imported AI turn run on the loaded model', async t => {
  const s = setup(t);
  s.render();
  const worker = s.ready();
  await s.render().handlePass();
  const scoring = computes(worker).at(-1);
  assert.equal(scoring.data.mode, 'analyze');
  assert.equal(s.render().showThinkingStatus, true);
  s.importGame(sgf);
  s.render();
  s.reply(worker, scoring);
  let vm = s.render();
  const requests = computes(worker);
  assert.equal(requests.length, 2, 'the imported white turn must not remain locked by old scoring');
  assert.equal(requests[1].data.mode, 'play');
  assert.equal(requests[1].data.color, 'white');
  assert.equal(vm.gameState.gameOver, false);
  assert.equal(vm.gameState.finalScore, null);
  assert.equal(vm.showStartScreen, false);
  assert.equal(s.workers.length, 1);
  assert.equal(worker.messages.some(message => message.type === 'release'), false);
  s.reply(worker, requests[1], { x: 2, y: 2 });
  t.mock.timers.tick(200);
  vm = s.render();
  assert.equal(vm.gameState.board[2][2]?.color, 'white');
  assert.equal(vm.gameState.currentPlayer, 'black');
});

test('controller import cancels an accepted deferred move before starting the imported game', async t => {
  const s = setup(t);
  s.render();
  const worker = s.ready();
  await s.render().handleIntersectionClick(0, 0);
  s.render();
  const old = computes(worker).at(-1);
  s.reply(worker, old, { x: 2, y: 2 });
  s.importGame(cuteGoCode());
  s.render();
  t.mock.timers.tick(200);
  const requests = computes(worker);
  assert.equal(requests.length, 2, 'clearing a stale deferred move must allow a fresh request');
  let vm = s.render();
  assert.equal(vm.gameState.board[2][2], null, 'the old accepted move cannot enter the imported board');
  assert.equal(vm.gameState.currentPlayer, 'white');
  assert.deepEqual([vm.gameState.blackCaptures, vm.gameState.whiteCaptures], [2, 3]);
  s.reply(worker, requests[1], { x: 3, y: 3 });
  t.mock.timers.tick(200);
  vm = s.render();
  assert.equal(vm.gameState.board[3][3]?.color, 'white');
  assert.equal(vm.gameState.currentPlayer, 'black');
});

test('controller import aborts the old coach request before the next render', async t => {
  const s = setup(t);
  let requestSignal;
  t.mock.method(globalThis, 'fetch', (_url, options) => {
    requestSignal = options.signal;
    return new Promise(() => {});
  });
  let vm = s.render();
  const worker = s.ready();
  vm.coachSettings.saveConfig({ endpoint: 'http://localhost:1234/v1', model: 'local', apiKey: '' }, false);
  s.settings.coachMode = true;
  vm = s.render();
  const asking = vm.coach.ask('hint');
  await new Promise(resolve => setImmediate(resolve));
  const analysis = computes(worker).at(-1);
  assert.equal(analysis.data.purpose, 'coach');
  s.reply(worker, analysis, null, { purpose: 'coach', visits: 8, candidates: [] });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requestSignal.aborted, false);
  s.importGame(sgf);
  assert.equal(requestSignal.aborted, true, 'successful import cancels cloud work synchronously');
  await asking;
  vm = s.render();
  assert.equal(vm.coach.active, false);
  assert.equal(vm.coach.loading, false);
  assert.equal(vm.settings.coachMode, false);
});

for (const [format, key] of [['SGF', sgf], ['CuteGo', cuteGoCode()]]) {
  test(`controller ${format} import from the home screen still opens a normal local game`, t => {
    const s = setup(t, 'PvP', true);
    assert.equal(s.render().showStartScreen, true);
    s.importGame(key);
    const vm = s.render();
    assert.equal(vm.showStartScreen, false);
    assert.equal(vm.settings.gameMode, 'PvP');
    assert.equal(vm.settings.coachMode, false);
    assert.equal(vm.gameState.appMode, 'playing');
    assert.equal(vm.gameState.currentPlayer, 'white');
    assert.equal(vm.gameState.board[0][0]?.color, 'black');
    assert.equal(vm.gameState.board.flat().filter(Boolean).length, 1);
    assert.equal(s.workers.length, 0, 'a normal local import does not initialize an AI model');
  });
}

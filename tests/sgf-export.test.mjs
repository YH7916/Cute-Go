import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { useGameState, useImportExportFlow, useBoardInputAction, useMoveAction,
  usePassAction, useUndoAction, useResetGameAction, useGameReview, parseSGF,
  renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
    export { useGameState } from './hooks/useGameState';
    export { useImportExportFlow } from './hooks/useImportExportFlow';
    export { useBoardInputAction } from './hooks/gameActions/useBoardInputAction';
    export { useMoveAction } from './hooks/gameActions/useMoveAction';
    export { usePassAction } from './hooks/gameActions/usePassAction';
    export { useUndoAction } from './hooks/gameActions/useUndoAction';
    export { useResetGameAction } from './hooks/gameActions/useResetGameAction';
    export { useGameReview } from './hooks/useGameReview';
    export { parseSGF } from './core/go/sgf';
    export { renderHook } from './tests/helpers/reactHooks';
  `,
});

// Real import, setup, action and review hooks; only browser I/O and the React
// host are adapted. Browser permissions/download behavior needs separate QA.
function setup(t, output) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const noop = () => {};
  const copied = [], downloaded = [], urls = new Map();
  const globals = {
    navigator: { clipboard: { writeText: async text => { copied.push(text); } } },
    document: {
      body: { appendChild: noop, removeChild: noop },
      createElement: name => {
        assert.equal(name, 'a');
        return { href: '', download: '', click() {
          assert.match(this.download, /^cutego_\d+\.sgf$/);
          const blob = urls.get(this.href);
          assert.equal(blob.type, 'application/x-go-sgf');
          downloaded.push(blob.text());
        } };
      },
    },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.mock.method(URL, 'createObjectURL', blob => {
    const url = `blob:test-${urls.size}`;
    urls.set(url, blob);
    return url;
  });
  t.mock.method(URL, 'revokeObjectURL', url => { urls.delete(url); });
  const settings = { boardSize: 9, gameMode: 'PvP', gameType: 'Go', userColor: 'black',
    setBoardSize: size => { settings.boardSize = size; }, setGameType: type => { settings.gameType = type; } };
  const options = {
    settings, aiTimerRef: { current: null }, aiTurnLock: { current: false },
    boardSizeRef: { current: 9 }, gameTypeRef: { current: 'Go' }, pendingEndGameRef: { current: null },
    onlineStatusRef: { current: 'disconnected' }, onlineStatus: 'disconnected', myColorRef: { current: null },
    isWebThinking: false, session: null, sendData: async () => true,
    cleanupOnline: noop, checkMoveAchievements: noop, playSfx: noop, vibrate: noop,
    setEloDiffStyle: noop, setEloDiffText: noop, setMyColor: noop,
    setShowMenu: noop, stopWebThinking: noop, webAiEngine: { resetAI: noop },
  };
  const host = renderHook(() => {
    const state = useGameState(9);
    const imports = useImportExportFlow({ settings, gameState: state, onImported: noop, playSfx: noop, vibrate: noop });
    const actions = { ...options, gameState: state };
    const move = useMoveAction(actions, noop);
    return { state, imports, move,
      input: useBoardInputAction(actions, move), pass: usePassAction(actions, noop),
      undo: useUndoAction(actions), reset: useResetGameAction(actions),
      review: useGameReview({ gameState: state, gameType: 'Go', showTerritory: false,
        engine: { requestAnalysis: noop, stopThinking: noop, isThinking: false, aiTerritory: null } }),
    };
  });
  t.after(() => {
    host.unmount();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return { ...host,
    import(key) {
      host.render().imports.setImportKey(key);
      host.render().imports.handleImport();
      return host.render();
    },
    async place(stones) {
      host.render().state.setAppMode('setup');
      for (const [x, y, color] of stones) {
        host.render().state.setSetupTool(color);
        await host.render().input(x, y);
      }
      host.render().state.setAppMode('playing');
      return host.render();
    },
    async exported(api = host.render()) {
      const original = api.state.readPosition();
      if (output === 'clipboard') api.imports.handleCopy();
      else api.imports.handleExportSGF();
      await Promise.resolve();
      const text = output === 'clipboard' ? copied.at(-1) : await downloaded.at(-1);
      assert.equal(api.state.readPosition(), original, 'export cannot replace the official position');
      assert.equal(urls.size, 0, 'download object URLs are released');
      const parsed = parseSGF(text);
      assert.ok(parsed, 'export must remain parseable SGF');
      return { text, parsed };
    },
  };
}

const root = [[1, 0, 'black'], [0, 1, 'black'], [1, 1, 'white'], [2, 1, 'black']];
const roots = parsed => parsed.initialStones.map(({ x, y, color }) => [x, y, color]).sort();
const actions = parsed => parsed.history.map(({ currentPlayer, move }) => [currentPlayer, move]);
const colors = board => board.map(row => row.map(stone => stone?.color ?? null));
const captureSgf = '(;SZ[9]AB[ba][ab][cb]AW[bb];B[bc])';

for (const output of ['clipboard', 'download']) {
  test(`${output}: setup stones round-trip as roots without invented moves`, async t => {
    const s = setup(t, output);
    const api = await s.place(root);
    const { parsed } = await s.exported(api);
    assert.deepEqual(roots(parsed), [...root].sort());
    assert.deepEqual(actions(parsed), []);
    assert.deepEqual(colors(parsed.board), colors(api.state.readPosition().board));
  });

  test(`${output}: CuteGo import replaces a preceding SGF root`, async t => {
    const s = setup(t, output);
    s.import(captureSgf);
    const board = Array.from({ length: 13 }, () => Array(13).fill('.'));
    board[6][6] = 'W'; board[2][3] = 'B';
    const api = s.import(btoa(JSON.stringify({ board, size: 13, turn: 'black', type: 'Go', bCaps: 0, wCaps: 0 })));
    const { parsed } = await s.exported(api);
    assert.equal(parsed.boardSize, 13);
    assert.deepEqual(roots(parsed), [[3, 2, 'black'], [6, 6, 'white']]);
    assert.deepEqual(actions(parsed), []);
    assert.deepEqual(colors(parsed.board), colors(api.state.readPosition().board));
  });

  test(`${output}: imported SGF preserves captured root stones and the real move`, async t => {
    const s = setup(t, output);
    const api = s.import(captureSgf);
    const { parsed } = await s.exported(api);
    assert.deepEqual(roots(parsed), [...root].sort());
    assert.deepEqual(actions(parsed), [['black', { x: 1, y: 2 }]]);
    assert.equal(parsed.board[1][1], null);
    assert.equal(parsed.blackCaptures, 1);
    assert.deepEqual(colors(parsed.board), colors(api.state.readPosition().board));
  });

  test(`${output}: setup roots later captured remain in AB/AW before replay`, async t => {
    const s = setup(t, output);
    const api = await s.place(root);
    assert.equal(api.move(1, 2, false), true);
    const { parsed } = await s.exported(api);
    assert.deepEqual(roots(parsed), [...root].sort());
    assert.deepEqual(actions(parsed), [['black', { x: 1, y: 2 }]]);
    assert.equal(parsed.board[1][1], null);
    assert.equal(parsed.blackCaptures, 1);
  });

  test(`${output}: first-pass history retains the root and color order`, async t => {
    const s = setup(t, output);
    const api = await s.place(root);
    await api.pass();
    assert.equal(api.move(8, 8, false), true);
    const { parsed } = await s.exported(api);
    assert.deepEqual(roots(parsed), [...root].sort());
    assert.deepEqual(actions(parsed), [['black', null], ['white', { x: 8, y: 8 }]]);
    assert.deepEqual(colors(parsed.board), colors(api.state.readPosition().board));
  });

  test(`${output}: undo to setup root exports no removed moves`, async t => {
    const s = setup(t, output);
    const api = await s.place(root);
    api.move(1, 2, false);
    api.undo();
    const { parsed } = await s.exported(api);
    assert.deepEqual(roots(parsed), [...root].sort());
    assert.deepEqual(actions(parsed), []);
    assert.equal(parsed.board[1][1]?.color, 'white');
    assert.equal(parsed.blackCaptures, 0);
  });

  test(`${output}: a retained callback after reset reads the fresh empty game`, async t => {
    const s = setup(t, output);
    const api = s.import(captureSgf);
    await api.reset(false, 13);
    const { parsed } = await s.exported(api);
    assert.equal(parsed.boardSize, 13);
    assert.deepEqual(roots(parsed), []);
    assert.deepEqual(actions(parsed), []);
    assert.ok(parsed.board.flat().every(stone => stone === null));
  });

  test(`${output}: reviewing and trying another move exports only the official record`, async t => {
    const s = setup(t, output);
    let api = s.import(captureSgf);
    const official = api.state.readPosition();
    api.state.setAppMode('review'); api.state.setReviewIndex(0);
    api = s.render(); api.review.startVariation();
    api = s.render(); api.review.playVariation(8, 8);
    api = s.render();
    assert.equal(api.review.readPosition().board[8][8]?.color, 'black');
    const { parsed } = await s.exported(api);
    assert.deepEqual(roots(parsed), [...root].sort());
    assert.deepEqual(actions(parsed), [['black', { x: 1, y: 2 }]]);
    assert.deepEqual(colors(parsed.board), colors(official.board));
    assert.equal(api.state.readPosition(), official);
  });
}

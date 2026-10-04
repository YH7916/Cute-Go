import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// Real entry hooks with the existing lightweight React host. This checks state
// transitions and callback order, not DOM rendering or React concurrency.
const { useGameState, useImportExportFlow, useBoardInputAction,
  createInitialPosition, renderHook } = await loadTestModule({
  reactHost: true,
  contents: `
    export { useGameState } from './hooks/useGameState';
    export { useImportExportFlow } from './hooks/useImportExportFlow';
    export { useBoardInputAction } from './hooks/gameActions/useBoardInputAction';
    export { createInitialPosition } from './domains/game/positionState';
    export { renderHook } from './tests/helpers/reactHooks';
  `,
});

function setup(t) {
  const noop = () => {};
  const observed = [];
  const moves = [], imported = [];
  const saved = new Map();
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null, setItem: (key, value) => { saved.set(key, value); },
  } });
  t.after(() => {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const online = { onlineStatus: 'disconnected', myColor: null, sendData: async () => true };
  const settings = { boardSize: 9, gameMode: 'PvP', gameType: 'Go', userColor: 'black',
    setBoardSize: size => { settings.boardSize = size; }, setGameType: noop };
  const host = renderHook(() => {
    const state = useGameState(9);
    const resetGame = (_keep, size = 9) => {
      settings.setBoardSize(size);
      state.writePosition(createInitialPosition(size));
    };
    return { state, resetGame,
      input: useBoardInputAction({ gameState: state, settings, aiTurnLock: { current: false },
        isThinking: false, ...online, playSfx: noop,
        vibrate: noop }, (...args) => { moves.push(args); }),
      imports: useImportExportFlow({ gameState: state,
        settings: { ...settings, setGameType: () => { observed.push(state.readPosition()); } },
        onImported: () => imported.push(state.readPosition()), playSfx: noop, vibrate: noop }),
    };
  });
  t.after(() => host.unmount());
  return { ...host, observed, settings, moves, online, saved, imported };
}

function capturePosition(player = 'black') {
  const position = createInitialPosition(9);
  position.currentPlayer = player;
  position.blackCaptures = 2;
  position.whiteCaptures = 3;
  position.consecutivePasses = 1;
  for (const [x, y, color] of [[1, 1, player === 'black' ? 'white' : 'black'],
    [0, 1, player], [1, 0, player], [2, 1, player]]) {
    position.board[y][x] = { x, y, color, id: `${x}-${y}` };
  }
  return position;
}

test('two setup clicks before another render retain both stones and one current position', async t => {
  const s = setup(t);
  s.render().state.setAppMode('setup');
  const api = s.render();
  await api.input(1, 1);
  await api.input(2, 2);
  const position = api.state.readPosition();
  assert.equal(position.board[1][1]?.color, 'black');
  assert.equal(position.board[2][2]?.color, 'black');
  assert.equal(position.currentPlayer, 'black');
  assert.deepEqual(position.history, []);
});

test('SGF import publishes captures/history/turn together before settings observers run', t => {
  const s = setup(t);
  let api = s.render();
  api.state.writePosition({ ...createInitialPosition(13), blackCaptures: 7, consecutivePasses: 2 });
  api.imports.setImportKey('(;SZ[9]AB[ab][ba][cb]AW[bb];B[bc])');
  api = s.render();
  api.imports.handleImport();
  assert.equal(s.observed.length, 1);
  const position = s.observed[0];
  assert.equal(position.board.length, 9);
  assert.equal(position.board[1][1], null);
  assert.equal(position.blackCaptures, 1);
  assert.equal(position.currentPlayer, 'white');
  assert.deepEqual(position.lastMove, { x: 1, y: 2 });
  assert.equal(position.consecutivePasses, 0);
  assert.equal(position.history.length, 1);
  assert.equal(position.history[0].board[1][1].color, 'white');
  assert.equal(api.state.readPosition(), position);
  assert.deepEqual(s.imported, [position], 'successful import must enter the game after the new position is committed');
});

test('CuteGo import replaces every position field before settings observers run', t => {
  const s = setup(t);
  let api = s.render();
  api.state.writePosition(capturePosition());
  const board = Array.from({ length: 13 }, () => Array(13).fill('.'));
  board[6][6] = 'W';
  api.imports.setImportKey(btoa(JSON.stringify({ board, size: 13, turn: 'white', type: 'Go', bCaps: 4, wCaps: 5 })));
  api = s.render();
  api.imports.handleImport();
  const position = s.observed[0];
  assert.equal(position.board.length, 13);
  assert.equal(position.board[6][6].color, 'white');
  assert.equal(position.currentPlayer, 'white');
  assert.equal(position.blackCaptures, 4);
  assert.equal(position.whiteCaptures, 5);
  assert.equal(position.lastMove, null);
  assert.equal(position.consecutivePasses, 0);
  assert.deepEqual(position.history, []);
  assert.equal(api.state.readPosition(), position);
});

test('an online click cannot enter a new position while its send is pending', async t => {
  const s = setup(t);
  let finish;
  Object.assign(s.online, { onlineStatus: 'connected', myColor: 'black',
    sendData: () => new Promise(resolve => { finish = resolve; }) });
  const api = s.render();
  const sending = api.input(1, 1);
  api.resetGame();
  finish(true);
  await sending;
  assert.deepEqual(s.moves, []);
});

test('an online send exception releases the click lock for a later retry', async t => {
  const s = setup(t);
  let calls = 0;
  Object.assign(s.online, { onlineStatus: 'connected', myColor: 'black',
    sendData: async () => { if (++calls === 1) throw new Error('offline'); return true; } });
  const api = s.render();
  await assert.rejects(api.input(1, 1), /offline/);
  await api.input(2, 2);
  assert.equal(calls, 2);
  assert.deepEqual(s.moves, [[2, 2, false]]);
});

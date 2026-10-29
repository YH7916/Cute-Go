import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { fromRoot } from '../../harness/paths.mjs';
import { loadTestModule } from '../helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);

test('Hard real ONNX: Worker move equals direct legal policy after captures, ko, pass and undo', { timeout: 120000 }, async t => {
  const replies = [];
  const worker = { postMessage: reply => replies.push(reply) };
  const previousSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { configurable: true, value: worker });
  t.after(() => {
    if (previousSelf) Object.defineProperty(globalThis, 'self', previousSelf);
    else Reflect.deleteProperty(globalThis, 'self');
  });
  const ortModule = pathToFileURL(require.resolve('onnxruntime-web')).href;
  const api = await loadTestModule({
    contents: `
      import './worker/ai.worker';
      export { OnnxEngine } from './core/inference/engine';
      export { replayHistoryForInference } from './core/inference/history';
      export { createInitialPosition, recordMove, recordPass, undoPosition } from './domains/game/positionState';
      export { attemptMove } from './core/go/rules';
      export { getBoardHash } from './core/board';
      export { getDefaultKomi } from './core/go/config';
      export { getAIConfig } from './utils/aiConfig';
      export * as ort from 'onnxruntime-web';
    `,
    registerCleanup: cleanup => t.after(cleanup),
    plugins: [{ name: 'real-onnxruntime-web', setup(build) {
      build.onResolve({ filter: /^onnxruntime-web$/ }, () => ({ path: ortModule, external: true }));
    } }],
  });
  api.ort.env.wasm.wasmPaths = `${fromRoot('public', 'wasm').replaceAll('\\', '/')}/`;
  const config = { modelPath: fromRoot('public', 'models', 'kata_dynamic.onnx'), gpuBackend: 'wasm', numThreads: 1 };
  const engine = new api.OnnxEngine(config);
  const send = data => worker.onmessage({ data });
  t.after(async () => {
    await send({ type: 'release', generation: 2 });
    await engine.dispose();
  });
  await engine.initialize();
  await send({ type: 'init', generation: 1, payload: config });
  assert.equal(replies.at(-1).type, 'init-complete');
  let requestId = 0;
  async function verify(position, label) {
    const size = position.board.length;
    const color = position.currentPlayer;
    const previous = position.history.at(-1);
    const previousHash = previous ? api.getBoardHash(previous.board) : null;
    const snapshot = structuredClone(position);
    const { board, historyMoves, failures } = api.replayHistoryForInference(position.history, size);
    assert.deepEqual(failures, []);
    const komi = api.getDefaultKomi(size);
    const result = await engine.analyze(board, color === 'black' ? 1 : -1, { history: historyMoves, komi, temperature: 0 });
    const best = result.moves.find(move => move.x === -1 || api.attemptMove(position.board, move.x, move.y, color, 'Go', previousHash));
    assert.ok(best);
    replies.length = 0;
    await send({ type: 'compute', generation: 1, requestId: ++requestId, data: {
      board: position.board, history: position.history, color, size, komi, gameType: 'Go', mode: 'play',
      difficulty: 'Hard', simulations: api.getAIConfig('Hard').simulations, temperature: 0,
    } });
    const responses = replies.filter(reply => reply.type === 'ai-response');
    assert.equal(responses.length, 1, JSON.stringify(replies));
    assert.equal(responses[0].requestId, requestId);
    assert.equal(responses[0].generation, 1);
    assert.deepEqual(responses[0].data.move, best.x === -1 ? null : { x: best.x, y: best.y }, label);
    const blackWinrate = color === 'black' ? result.rootInfo.winrate : 100 - result.rootInfo.winrate;
    assert.ok(Math.abs(responses[0].data.winRate - blackWinrate) < 1e-5);
    assert.deepEqual(position, snapshot, 'the complete position and undo history stay intact');
  }
  for (const size of [5, 9, 10, 13, 19]) {
    for (const initialPlayer of ['black', 'white']) {
      await t.test(`${size}/${initialPlayer}: captures, immediate ko, pass and undo preserve model policy`, async () => {
        let position = { ...api.createInitialPosition(size), currentPlayer: initialPlayer };
        const sequence = [[0, 1], [1, 1], [1, 0], [0, 2], [2, 1], [2, 2], [4, 4], [1, 3], [1, 2]];
        for (const [x, y] of sequence) {
          const previous = position.history.at(-1);
          const move = api.attemptMove(position.board, x, y, position.currentPlayer, 'Go', previous ? api.getBoardHash(previous.board) : null);
          assert.ok(move);
          position = api.recordMove(position, move.newBoard, { x, y }, move.captured, false);
        }
        assert.equal(position[`${initialPlayer}Captures`], 1);
        assert.equal(api.attemptMove(position.board, 1, 1, position.currentPlayer, 'Go', api.getBoardHash(position.history.at(-1).board)), null);
        await verify(position, 'after ko capture');
        await verify(api.recordPass(position), 'after pass clears simple ko');
        await verify(api.undoPosition(position, 1), 'undo restores the capture opportunity');
      });
    }
  }
});

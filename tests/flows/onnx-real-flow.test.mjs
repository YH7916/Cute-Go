import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { fromRoot } from '../../harness/paths.mjs';
import { loadTestModule } from '../helpers/loadTestModule.mjs';

const require = createRequire(import.meta.url);

function assertRealAnalysis(result, board, color) {
  const { winrate, lead, scoreStdev, ownership } = result.rootInfo;
  assert.ok(Number.isFinite(winrate) && winrate >= 0 && winrate <= 100);
  assert.ok(Number.isFinite(lead));
  assert.ok(Number.isFinite(scoreStdev)); // This model exports uncalibrated raw misc values.
  assert.ok(ownership instanceof Float32Array);
  assert.equal(ownership.length, board.size * board.size);
  assert.ok(ownership.every(value => Number.isFinite(value) && value >= -1 && value <= 1));
  assert.ok(ownership.some(value => Math.abs(value) > 1e-6), 'ownership must contain actual model output');
  assert.ok(result.moves.length > 1 && result.moves.length <= board.size * board.size + 1);
  const seen = new Set();
  let priorSum = 0;
  for (const move of result.moves) {
    const key = `${move.x},${move.y}`;
    assert.ok(!seen.has(key), `duplicate candidate ${key}`);
    seen.add(key);
    assert.ok(Number.isFinite(move.prior) && move.prior >= 0 && move.prior <= 1);
    priorSum += move.prior;
    assert.ok((move.x === -1 && move.y === -1) || board.isLegal(move.x, move.y, color),
      `model candidate ${key} must be legal for ${color}`);
  }
  assert.ok(Math.abs(priorSum - 1) < 1e-6, 'legal policy probabilities must be normalized');
}

test('真实 ONNX 流程：加载项目模型→多尺寸黑白推理→释放在途推理→重载', { timeout: 120000 }, async t => {
  const ortModule = pathToFileURL(require.resolve('onnxruntime-web')).href;
  const { OnnxEngine, MicroBoard, getDefaultKomi, ort } = await loadTestModule({
    contents: `
      export { OnnxEngine } from './core/inference/engine';
      export { MicroBoard } from './utils/micro-board';
      export { getDefaultKomi } from './core/go/config';
      export * as ort from 'onnxruntime-web';
    `,
    registerCleanup: cleanup => t.after(cleanup),
    // Keep the installed web runtime intact. Bundling it into a temporary module
    // loses its own file location; no Tensor, InferenceSession or run is replaced.
    plugins: [{
      name: 'real-onnxruntime-web',
      setup(build) {
        build.onResolve({ filter: /^onnxruntime-web$/ }, () => ({ path: ortModule, external: true }));
      },
    }],
  });
  // Node uses filesystem paths, so the browser cache-busting URL option is not
  // applicable here. Both model bytes and vanilla WASM are the shipped assets.
  ort.env.wasm.wasmPaths = `${fromRoot('public', 'wasm').replaceAll('\\', '/')}/`;
  const engine = new OnnxEngine({
    modelPath: fromRoot('public', 'models', 'kata_dynamic.onnx'),
    gpuBackend: 'wasm', numThreads: 1,
  });
  t.after(() => engine.dispose());
  await assert.rejects(engine.analyze(new MicroBoard(9), 1), /not initialized/);
  await engine.initialize();

  for (const size of [5, 9, 10, 13, 19]) {
    const board = new MicroBoard(size);
    const history = Object.freeze([
      Object.freeze({ x: Math.floor(size / 2), y: Math.floor(size / 2), color: 1 }),
      Object.freeze({ x: 1, y: 1, color: -1 }),
      Object.freeze({ x: size - 2, y: size - 2, color: 1 }),
    ]);
    for (const move of history) assert.equal(board.play(move.x, move.y, move.color), true);
    for (const color of [1, -1]) {
      await t.test(`${size} 路 / ${color === 1 ? '黑' : '白'}方：真实策略与形势，输入不变`, async () => {
        const snapshot = board.board.slice();
        const ko = board.ko;
        const result = await engine.analyze(board, color, {
          history, komi: getDefaultKomi(size), temperature: 0,
        });
        assertRealAnalysis(result, board, color);
        assert.deepEqual(board.board, snapshot, 'analysis cannot mutate the current position');
        assert.equal(board.ko, ko, 'analysis cannot change ko rights');
      });
    }
  }

  await t.test('在途真实推理完成后释放，重新加载同一模型还能继续', async () => {
    const board = new MicroBoard(9);
    assert.equal(board.play(4, 4, 1), true);
    const options = { history: [{ x: 4, y: 4, color: 1 }], komi: 3.5, temperature: 0 };
    const pending = engine.analyze(board, -1, options);
    const disposing = engine.dispose();
    await assert.rejects(engine.analyze(board, -1, options), /not initialized/);
    const before = await pending;
    assertRealAnalysis(before, board, -1);
    await disposing;
    await engine.initialize();
    const after = await engine.analyze(board, -1, options);
    assertRealAnalysis(after, board, -1);
    assert.deepEqual(after.moves.map(move => [move.x, move.y]), before.moves.map(move => [move.x, move.y]));
    assert.ok(Math.abs(after.rootInfo.winrate - before.rootInfo.winrate) < 1e-5);
    for (let index = 0; index < before.rootInfo.ownership.length; index++) {
      assert.ok(Math.abs(after.rootInfo.ownership[index] - before.rootInfo.ownership[index]) < 1e-5);
    }
    await engine.dispose();
    await engine.dispose();
    await assert.rejects(engine.analyze(board, -1, options), /not initialized/);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import type * as Ort from 'onnxruntime-web';
import { MicroBoard } from '../utils/micro-board';

// Load the real engine/Tensor classes; replace only the device and network boundary.
Object.assign(globalThis, { require: createRequire(import.meta.url) });
const ort = await import('onnxruntime-web');
const { OnnxEngine } = await import('../core/inference/engine');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function outputs(size = 9, value = [0, 0, 0]): Ort.InferenceSession.ReturnType {
  return {
    output_policy: new ort.Tensor('float32', new Float32Array(size * size + 1), [1, size * size + 1]),
    output_value: new ort.Tensor('float32', new Float32Array(value), [1, value.length]),
    output_miscvalue: new ort.Tensor('float32', new Float32Array([0, 1, 2, 0]), [1, 4]),
    output_ownership: new ort.Tensor('float32', new Float32Array(size * size).fill(0.5), [1, 1, size, size]),
  };
}

function session(run: Ort.InferenceSession['run'] = async () => outputs(), release = async () => {}): Ort.InferenceSession {
  return { inputNames: ['input_binary', 'input_global'],
    outputNames: ['output_policy', 'output_value', 'output_miscvalue', 'output_ownership'],
    run, release, startProfiling() {}, endProfiling() {} };
}

let wasmFlags = { ...ort.env.wasm };
test.beforeEach(() => { wasmFlags = { ...ort.env.wasm }; });
test.afterEach(() => {
  for (const key of Object.keys(ort.env.wasm)) Reflect.deleteProperty(ort.env.wasm, key);
  Object.assign(ort.env.wasm, wasmFlags);
});

test('split model fallback uses the downloaded bytes exactly once, even if the whole URL is absent', async t => {
  const buffers = [new Uint8Array([1, 2]), new Uint8Array([3, 4])];
  t.mock.method(globalThis, 'fetch', async (url: string) => new Response(buffers[url === '/one' ? 0 : 1]));
  const calls: unknown[] = [];
  t.mock.method(ort.InferenceSession, 'create', async (data: unknown) => {
    calls.push(data);
    if (calls.length === 1) throw new Error('WebGPU unavailable');
    if (typeof data === 'string') throw new Error('whole model is not deployed');
    return session();
  });
  const engine = new OnnxEngine({ modelPath: '/missing.onnx', modelParts: ['/one', '/two'] });
  await engine.initialize();
  assert.equal(calls.length, 2);
  assert.equal(calls[0], calls[1], 'fallback must reuse the same assembled buffer');
  assert.deepEqual(calls[1], new Uint8Array([1, 2, 3, 4]));
  await engine.dispose();
});

test('concurrent initialize shares one pending session creation', async t => {
  const pending = deferred<Ort.InferenceSession>();
  const create = t.mock.method(ort.InferenceSession, 'create', () => pending.promise);
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  const first = engine.initialize();
  const second = engine.initialize();
  pending.resolve(session());
  await Promise.all([first, second]);
  assert.equal(create.mock.callCount(), 1);
  await engine.dispose();
});

test('dispose invalidates an unfinished initialization and releases its late session', async t => {
  const pending = deferred<Ort.InferenceSession>();
  const started = deferred<void>();
  const release = t.mock.fn(async () => {});
  t.mock.method(ort.InferenceSession, 'create', () => { started.resolve(); return pending.promise; });
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  const initialization = engine.initialize();
  const rejected = assert.rejects(initialization, /disposed|cancel|abort/i);
  await started.promise;
  const disposal = engine.dispose();
  pending.resolve(session(undefined, release));
  await Promise.all([rejected, disposal]);
  assert.equal(release.mock.callCount(), 1);
  await assert.rejects(engine.analyze(new MicroBoard(9), 1), /not initialized/i);
});

test('dispose waits for active inference before releasing its session', async t => {
  const pending = deferred<Ort.InferenceSession.ReturnType>();
  const release = t.mock.fn(async () => {});
  t.mock.method(ort.InferenceSession, 'create', async () => session(() => pending.promise, release));
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  await engine.initialize();
  const analysis = engine.analyze(new MicroBoard(9), 1);
  const disposal = engine.dispose();
  assert.equal(release.mock.callCount(), 0, 'releasing a running WASM session risks memory faults');
  pending.resolve(outputs());
  await Promise.all([analysis, disposal]);
  assert.equal(release.mock.callCount(), 1);
});

test('dispose completes only after asynchronous session release finishes', async t => {
  const pending = deferred<void>();
  const release = t.mock.fn(() => pending.promise);
  t.mock.method(ort.InferenceSession, 'create', async () => session(undefined, release));
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  await engine.initialize();
  let completed = false;
  const disposal = Promise.resolve(engine.dispose()).then(() => { completed = true; });
  await Promise.resolve();
  assert.equal(completed, false);
  pending.resolve();
  await disposal;
  assert.equal(release.mock.callCount(), 1);
});

test('large finite value logits produce a finite normalized win rate', async t => {
  t.mock.method(ort.InferenceSession, 'create', async () => session(async () => outputs(9, [1000, 999, 998])));
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  await engine.initialize();
  const result = await engine.analyze(new MicroBoard(9), 1);
  assert.ok(Math.abs(result.rootInfo.winrate - 66.5241) < 0.001);
  await engine.dispose();
});

test('a policy for the wrong board size is rejected instead of silently truncating candidates', async t => {
  const tensors = outputs(5);
  const cleanup = t.mock.method(tensors.output_policy, 'dispose');
  t.mock.method(ort.InferenceSession, 'create', async () => session(async () => tensors));
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  await engine.initialize();
  await assert.rejects(engine.analyze(new MicroBoard(9), 1), /output_policy|policy.*shape/i);
  assert.equal(cleanup.mock.callCount(), 1, 'invalid outputs still need tensor cleanup');
  await engine.dispose();
});

test('non-finite value output is rejected before it can contaminate analysis', async t => {
  t.mock.method(ort.InferenceSession, 'create', async () => session(async () => outputs(9, [NaN, 1, 0])));
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  await engine.initialize();
  await assert.rejects(engine.analyze(new MicroBoard(9), 1), /output_value|finite/i);
  await engine.dispose();
});

for (const color of [1, -1] as const) {
  test(`raw ownership logits become bounded ownership in the absolute black perspective (${color})`, async t => {
    t.mock.method(ort.InferenceSession, 'create', async () => session(async () => {
      const tensors = outputs();
      (tensors.output_ownership.data as Float32Array).set([-3, -0.9, 0, 0.9, 3]);
      return tensors;
    }));
    const engine = new OnnxEngine({ modelPath: '/model.onnx' });
    await engine.initialize();
    const result = await engine.analyze(new MicroBoard(9), color);
    assert.ok(result.rootInfo.ownership);
    const expected = Float32Array.from([-3, -0.9, 0, 0.9, 3], raw => Math.tanh(Math.fround(raw)) * color);
    assert.deepEqual(result.rootInfo.ownership.slice(0, 5), expected);
    assert.ok(result.rootInfo.ownership.every(value => value >= -1 && value <= 1));
    await engine.dispose();
  });
}

test('mobile initialization keeps one vanilla WASM thread regardless of requested thread count', async t => {
  t.mock.getter(globalThis, 'navigator', () => ({ userAgent: 'Android Mobile', hardwareConcurrency: 8 }));
  t.mock.method(ort.InferenceSession, 'create', async () => session());
  const engine = new OnnxEngine({ modelPath: '/model.onnx', numThreads: 4 });
  await engine.initialize();
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.equal(ort.env.wasm.simd, false);
  assert.equal(ort.env.wasm.proxy, false);
  await engine.dispose();
});

test('configured thread count reaches the Web ORT environment when isolation and SAB are available', async t => {
  const oldSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { configurable: true, value: { crossOriginIsolated: true } });
  t.after(() => { if (oldSelf) Object.defineProperty(globalThis, 'self', oldSelf); else Reflect.deleteProperty(globalThis, 'self'); });
  t.mock.getter(globalThis, 'navigator', () => ({ userAgent: 'Desktop', hardwareConcurrency: 8 }));
  t.mock.method(ort.InferenceSession, 'create', async () => session());
  const engine = new OnnxEngine({ modelPath: '/model.onnx', numThreads: 2 });
  await engine.initialize();
  assert.equal(ort.env.wasm.numThreads, 2);
  await engine.dispose();
});

test('WASM asset URLs carry the bundled runtime version to avoid stale HTTP/SW cache entries', async t => {
  t.mock.method(ort.InferenceSession, 'create', async () => session());
  const engine = new OnnxEngine({ modelPath: '/model.onnx', wasmPath: 'https://example.test/wasm/' });
  await engine.initialize();
  assert.deepEqual(ort.env.wasm.wasmPaths, {
    'ort-wasm.wasm': `https://example.test/wasm/ort-wasm.wasm?ort=${ort.env.versions.web}`,
    'ort-wasm-simd-threaded.wasm': `https://example.test/wasm/ort-wasm-simd-threaded.wasm?ort=${ort.env.versions.web}`,
  });
  await engine.dispose();
});

test('isolated browsers without WASM thread instructions use the shipped vanilla binary', async t => {
  const oldSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  Object.defineProperty(globalThis, 'self', { configurable: true, value: { crossOriginIsolated: true } });
  t.after(() => { if (oldSelf) Object.defineProperty(globalThis, 'self', oldSelf); else Reflect.deleteProperty(globalThis, 'self'); });
  t.mock.getter(globalThis, 'navigator', () => ({ userAgent: 'Desktop', hardwareConcurrency: 8 }));
  t.mock.method(WebAssembly, 'validate', () => false);
  t.mock.method(ort.InferenceSession, 'create', async () => session());
  const engine = new OnnxEngine({ modelPath: '/model.onnx', numThreads: 2 });
  await engine.initialize();
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.equal(ort.env.wasm.simd, false);
  await engine.dispose();
});

test('a failed model-part download cancels siblings and can be retried', async t => {
  let firstAttempt = true;
  let siblingSignal: AbortSignal | null = null;
  const create = t.mock.method(ort.InferenceSession, 'create', async () => session());
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (!firstAttempt) return new Response(new Uint8Array([1, 2]));
    if (url === '/bad') return new Response('failure', { status: 503 });
    const signal = init?.signal;
    assert.ok(signal);
    siblingSignal = signal;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
  const engine = new OnnxEngine({ modelPath: '/model.onnx', modelParts: ['/bad', '/pending'] });
  await assert.rejects(engine.initialize(), /503/);
  assert.equal(create.mock.callCount(), 0);
  assert.equal((siblingSignal as AbortSignal | null)?.aborted, true);
  firstAttempt = false;
  await engine.initialize();
  assert.equal(create.mock.callCount(), 1);
  await engine.dispose();
});

test('reinitialization waits for old release, while repeated dispose releases only once', async t => {
  const pending = deferred<void>();
  const release = t.mock.fn(() => pending.promise);
  const create = t.mock.method(ort.InferenceSession, 'create', async () => session(undefined, release));
  const engine = new OnnxEngine({ modelPath: '/model.onnx' });
  await engine.initialize();
  const firstDispose = engine.dispose();
  const secondDispose = engine.dispose();
  const reinitialization = engine.initialize();
  await Promise.resolve();
  assert.equal(create.mock.callCount(), 1);
  pending.resolve();
  await Promise.all([firstDispose, secondDispose, reinitialization]);
  assert.equal(release.mock.callCount(), 1);
  assert.equal(create.mock.callCount(), 2);
  await engine.dispose();
});

for (const size of [9, 13, 19]) {
  for (const color of [1, -1] as const) {
    test(`${size}x${size}/${color}: preserve input stones, history, komi and absolute ownership`, async t => {
      const board = new MicroBoard(size);
      board.set(1, 1, 1);
      board.set(2, 2, -1);
      const before = board.clone();
      t.mock.method(ort.InferenceSession, 'create', async () => session(async feeds => {
        const binary = feeds.input_binary;
        const global = feeds.input_global;
        assert.deepEqual(binary.dims, [1, 22, size, size]);
        assert.deepEqual(global.dims, [1, 19]);
        assert.equal(global.data[0], 1, 'last move was pass');
        assert.equal(global.data[5], color === 1 ? -7.5 / 20 : 7.5 / 20);
        assert.equal(binary.data[size * size + (color === 1 ? size + 1 : 2 * size + 2)], 1);
        assert.equal(binary.data[10 * size * size + 3 * size + 3], 1, 'second-last move is unchanged');
        return outputs(size);
      }));
      const engine = new OnnxEngine({ modelPath: '/model.onnx' });
      await engine.initialize();
      const result = await engine.analyze(board, color, {
        komi: 7.5, history: [{ color: 1, x: 3, y: 3 }, { color: -1, x: -1, y: -1 }],
      });
      assert.deepEqual(board, before);
      assert.equal(result.rootInfo.ownership?.length, size * size);
      assert.equal(result.rootInfo.ownership?.[0], Math.fround(Math.tanh(0.5) * color));
      assert.ok(result.moves.some(move => move.x === -1 && move.y === -1));
      assert.ok(result.moves.every(move => move.x === -1 || board.isLegal(move.x, move.y, color)));
      await engine.dispose();
    });
  }
}

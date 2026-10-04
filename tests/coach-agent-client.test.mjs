import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { runCoachAgent, createInitialPosition } = await loadTestModule({ contents: `
  export { runCoachAgent } from './agent/coach/client';
  export { createInitialPosition } from './domains/game/positionState';
` });
const input = (kind = 'ask') => ({ kind, position: createInitialPosition(9), userColor: 'black',
  intent: 'hint', config: { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-private-key' } });
const result = text => ({ text, source: 'cloud', configured: true, hintPoints: [], moveNumber: 0 });
const response = () => new Response(JSON.stringify({ choices: [{ message: {
  content: JSON.stringify({ kind: 'explain', parts: [{ id: 'current', variant: 0 }] }),
}, finish_reason: 'stop' }] }));
const tick = () => new Promise(resolve => setImmediate(resolve));

function host(t, WorkerClass) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  Object.defineProperty(globalThis, 'Worker', { value: WorkerClass, writable: true, configurable: true });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'Worker', original);
    else Reflect.deleteProperty(globalThis, 'Worker');
  });
}
function workerHost(t) {
  const workers = [];
  class FakeWorker {
    constructor(url, options) { this.url = url; this.options = options; this.requests = []; this.terminated = false; workers.push(this); }
    postMessage(message) { this.requests.push(structuredClone(message)); }
    terminate() { this.terminated = true; }
    emit(data) { this.onmessage?.({ data }); }
    fail() { this.onerror?.({ preventDefault() {} }); }
  }
  host(t, FakeWorker);
  return workers;
}

test('agent bridge waits for ready before transferring key and isolates concurrent request IDs', async t => {
  const workers = workerHost(t);
  const first = runCoachAgent(input());
  const second = runCoachAgent(input());
  assert.equal(workers.length, 2);
  for (const worker of workers) {
    assert.equal(worker.requests.length, 0);
    assert.equal(worker.options.type, 'module');
    assert.equal(worker.options.name, 'cute-go-coach');
    assert.match(worker.url.pathname, /worker\.ts$/);
    worker.emit({ type: 'ready' });
    worker.emit({ type: 'ready' });
    assert.equal(worker.requests.length, 1, 'duplicate ready never sends another billable request');
  }
  const [a, b] = workers.map(worker => worker.requests[0]);
  assert.notEqual(a.requestId, b.requestId);
  workers[0].emit({ type: 'result', requestId: b.requestId, result: result('wrong') });
  assert.equal(workers[0].terminated, false);
  workers[1].emit({ type: 'result', requestId: b.requestId, result: result('second') });
  workers[0].emit({ type: 'result', requestId: a.requestId, result: result('first') });
  assert.equal((await first).text, 'first');
  assert.equal((await second).text, 'second');
  assert.ok(workers.every(worker => worker.terminated && worker.onmessage === null));
});

test('cancel terminates the teaching worker before or after ready and ignores captured late handlers', async t => {
  const workers = workerHost(t);
  for (const ready of [false, true]) {
    const controller = new AbortController();
    const pending = runCoachAgent(input(), controller.signal);
    const worker = workers.at(-1);
    if (ready) worker.emit({ type: 'ready' });
    const stale = worker.onmessage;
    const id = worker.requests[0]?.requestId;
    controller.abort();
    stale({ data: { type: 'result', requestId: id, result: result('old text') } });
    await assert.rejects(pending, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
  }
  const stopped = new AbortController();
  stopped.abort();
  await assert.rejects(runCoachAgent(input(), stopped.signal), { name: 'AbortError' });
  assert.equal(workers.length, 2);
});

test('missing Worker and constructor failure use the same runtime with provider configuration intact', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response());
  host(t, undefined);
  assert.equal((await runCoachAgent(input())).source, 'cloud');
  Object.defineProperty(globalThis, 'Worker', { value: class { constructor() { throw new Error('unsupported module worker'); } }, configurable: true });
  assert.match((await runCoachAgent(input())).text, /空旷角部.*两条边/);
  assert.equal(fetch.mock.callCount(), 2);
});

test('startup errors and message errors fall back before any request was sent', async t => {
  const workers = workerHost(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => response());
  for (const event of ['error', 'messageerror']) {
    const pending = runCoachAgent(input());
    const worker = workers.at(-1);
    if (event === 'error') worker.fail(); else worker.onmessageerror();
    assert.equal((await pending).source, 'cloud');
    assert.equal(worker.requests.length, 0);
    assert.equal(worker.terminated, true);
  }
  assert.equal(fetch.mock.callCount(), 2);
});

test('worker failure after dispatch restores local text without repeating a possibly billed request', async t => {
  const workers = workerHost(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => response());
  for (const event of ['error', 'response-error', 'messageerror']) {
    const pending = runCoachAgent(input());
    const worker = workers.at(-1);
    worker.emit({ type: 'ready' });
    if (event === 'error') worker.fail();
    else if (event === 'messageerror') worker.onmessageerror();
    else worker.emit({ type: 'error', requestId: worker.requests[0].requestId });
    const answer = await pending;
    assert.equal(answer.source, 'local');
    assert.match(answer.error, /本地提示/);
    assert.equal(worker.terminated, true);
  }
  assert.equal(fetch.mock.callCount(), 0);
});

test('stalled worker startup and execution have bounded lifetimes', async t => {
  const workers = workerHost(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => response());
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const starting = runCoachAgent(input('inspect'));
  t.mock.timers.tick(6000);
  assert.equal((await starting).source, 'local');
  const running = runCoachAgent(input());
  workers.at(-1).emit({ type: 'ready' });
  t.mock.timers.tick(36000);
  assert.equal((await running).source, 'local');
  assert.ok(workers.every(worker => worker.terminated));
  assert.equal(fetch.mock.callCount(), 0);
});

test('abort after startup fallback still cancels the shared provider request', async t => {
  const workers = workerHost(t);
  let providerSignal;
  let finish;
  t.mock.method(globalThis, 'fetch', (_url, init) => {
    providerSignal = init.signal;
    return new Promise(resolve => { finish = resolve; });
  });
  const controller = new AbortController();
  const pending = runCoachAgent(input(), controller.signal);
  workers[0].fail();
  await tick();
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(providerSignal.aborted, true);
  finish(response());
});

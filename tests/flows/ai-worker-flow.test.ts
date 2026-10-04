import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createBoard } from '../../core/board';
import { attemptMove } from '../../core/go/rules';
import type { AnalysisResult, OnnxEngine as Engine } from '../../core/inference/engine';
import type { WorkerInMessage, WorkerOutMessage } from '../../core/inference/protocol';
import { getAIConfig } from '../../utils/aiConfig';

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

function compute(requestId: number, generation: number, mode: 'play' | 'analyze' = 'play'): WorkerInMessage {
  return { type: 'compute', requestId, generation, data: {
    board: createBoard(9), history: [], color: 'black', size: 9,
    difficulty: 'Medium', gameType: 'Go', mode, simulations: 2,
    komi: 3.5, temperature: getAIConfig('Medium').temperature,
  } };
}

test('AI Worker 固定流程：加载失败 → 规则可用 → 重试 → 推理恢复 → 取消排队 → 释放重载', { timeout: 10000 }, async t => {
  // Production message handler, scheduler and engine lifecycle run together.
  // Only ONNX initialization/inference/disposal are substituted, not a real model test.
  const replies: WorkerOutMessage[] = [];
  const worker: {
    postMessage: (reply: WorkerOutMessage) => void;
    onmessage?: (event: { data: WorkerInMessage }) => Promise<void>;
  } = { postMessage: reply => replies.push(reply) };
  const previousSelf = Object.getOwnPropertyDescriptor(globalThis, 'self');
  const previousRequire = Object.getOwnPropertyDescriptor(globalThis, 'require');
  Object.defineProperty(globalThis, 'self', { configurable: true, value: worker });
  Object.defineProperty(globalThis, 'require', { configurable: true, value: createRequire(import.meta.url) });
  const operations: Promise<void>[] = [];
  const gates: Array<{ started: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> }> = [];
  const events: string[] = [];
  let nextHold: typeof gates[number] | undefined;
  let failNextRun = false;
  let initAttempts = 0;
  let analyzeCalls = 0;
  let activeRuns = 0;
  let peakRuns = 0;
  const instances = new Map<Engine, number>();
  const send = (data: WorkerInMessage) => {
    assert.ok(worker.onmessage, 'the real Worker entry installs the message handler');
    const pending = worker.onmessage({ data });
    operations.push(pending);
    return pending;
  };
  const responses = () => replies.filter(reply => reply.type === 'ai-response');
  const replyFor = (requestId: number) => {
    const matches = responses().filter(reply => reply.requestId === requestId);
    assert.equal(matches.length, 1, `request ${requestId} must publish exactly once`);
    return matches[0];
  };
  const holdNext = () => {
    const gate = { started: deferred(), release: deferred() };
    gates.push(gate);
    nextHold = gate;
    return gate;
  };
  const waitForStart = (gate: typeof gates[number], operation: Promise<void>) => Promise.race([
    gate.started.promise,
    operation.then(() => { assert.fail('the held inference must start before its request finishes'); }),
  ]);
  try {
    const { OnnxEngine } = await import('../../core/inference/engine');
    t.mock.method(OnnxEngine.prototype, 'initialize', async function (this: Engine) {
      const id = instances.size + 1;
      instances.set(this, id);
      events.push(`init:${id}`);
      if (++initAttempts === 1) throw new Error('synthetic model initialization failure');
    });
    t.mock.method(OnnxEngine.prototype, 'dispose', async function (this: Engine) {
      assert.equal(activeRuns, 0, 'an engine cannot be disposed during inference');
      events.push(`dispose:${instances.get(this)}`);
    });
    const result: AnalysisResult = {
      rootInfo: { winrate: 50, lead: 0, scoreStdev: 1, ownership: null },
      moves: [{ x: 2, y: 2, u: 0, prior: 1, winrate: 50, scoreMean: 0, scoreStdev: 1, lead: 0, vists: 1 }],
    };
    t.mock.method(OnnxEngine.prototype, 'analyze', async function (this: Engine, ...args: Parameters<Engine['analyze']>) {
      assert.equal(args[0].size, 9);
      assert.equal(args[2]?.komi, 3.5, 'the real Worker forwards the game komi');
      const call = ++analyzeCalls;
      events.push(`run:${call}`);
      peakRuns = Math.max(peakRuns, ++activeRuns);
      const held = nextHold;
      nextHold = undefined;
      try {
        held?.started.resolve();
        if (held) await held.release.promise;
        if (failNextRun) {
          failNextRun = false;
          throw new Error('synthetic inference failure');
        }
        return result;
      } finally {
        activeRuns--;
        events.push(`settled:${call}`);
      }
    });
    await import('../../worker/ai.worker');

    await send({ type: 'init', generation: 1, payload: { modelPath: 'synthetic-model.onnx', numThreads: 1 } });
    assert.deepEqual(events, ['init:1', 'dispose:1'], 'failed initialization cleans up its instance');
    assert.deepEqual(replies, [{ type: 'error', generation: 1, message: 'synthetic model initialization failure' }]);
    const rulesRequest = compute(1, 1);
    assert.equal(rulesRequest.type, 'compute');
    if (rulesRequest.type !== 'compute') throw new Error('Expected a compute request');
    rulesRequest.data.difficulty = 'Fun';
    await send(rulesRequest);
    const rulesMove = replyFor(1).data.move;
    assert.ok(rulesMove && attemptMove(rulesRequest.data.board, rulesMove.x, rulesMove.y, 'black'));
    assert.equal(analyzeCalls, 0, 'the rule-based opponent remains usable without a model');

    await send({ type: 'reinit', generation: 2 });
    assert.equal(initAttempts, 2);
    assert.deepEqual(replies.at(-1), { type: 'init-complete', generation: 2 });
    const firstCompute = compute(2, 2);
    const originalInput = structuredClone(firstCompute);
    await send(firstCompute);
    assert.deepEqual(replyFor(2).data.move, { x: 2, y: 2 });
    assert.equal(replyFor(2).generation, 2);
    assert.deepEqual(firstCompute, originalInput, 'inference and selection preserve the input position');

    failNextRun = true;
    await send(compute(3, 2));
    assert.deepEqual(replies.at(-1), { type: 'error', generation: 2, requestId: 3, message: 'synthetic inference failure' });
    assert.ok(!responses().some(reply => reply.requestId === 3));
    await send(compute(4, 2));
    assert.deepEqual(replyFor(4).data.move, { x: 2, y: 2 });
    assert.equal(initAttempts, 2, 'a recoverable computation failure does not require a new instance');

    const beforeCancelCalls = analyzeCalls;
    const cancelledGate = holdNext();
    const cancelled = send(compute(5, 2, 'analyze'));
    await waitForStart(cancelledGate, cancelled);
    await send({ type: 'stop', generation: 3 });
    const queued = send(compute(6, 3));
    assert.equal(activeRuns, 1);
    assert.equal(analyzeCalls, beforeCancelCalls + 1, 'the new request waits for the cancelled run to finish');
    assert.ok(!responses().some(reply => reply.requestId === 6));
    cancelledGate.release.resolve();
    await Promise.all([cancelled, queued]);
    assert.equal(analyzeCalls, beforeCancelCalls + 2, 'cancelled search performs no extra visits');
    assert.ok(!replies.some(reply => 'requestId' in reply && reply.requestId === 5), 'the cancelled request sends neither success nor error');
    assert.equal(replyFor(6).generation, 3);
    assert.equal(peakRuns, 1, 'ONNX inference is serialized even across cancellation');

    const releaseGate = holdNext();
    const duringRelease = send(compute(7, 3));
    await waitForStart(releaseGate, duringRelease);
    const beforeRelease = [...events];
    const released = send({ type: 'release', generation: 4 });
    const reinitialized = send({ type: 'reinit', generation: 5 });
    assert.deepEqual(events, beforeRelease, 'release and reinit must wait for the active run');
    const heldCall = analyzeCalls;
    releaseGate.release.resolve();
    await Promise.all([duringRelease, released, reinitialized]);
    assert.deepEqual(events.slice(beforeRelease.length), [`settled:${heldCall}`, 'dispose:2', 'init:3']);
    assert.ok(!replies.some(reply => 'requestId' in reply && reply.requestId === 7));
    assert.deepEqual(replies.at(-1), { type: 'init-complete', generation: 5 });
    await send(compute(8, 5));
    assert.deepEqual(replyFor(8).data.move, { x: 2, y: 2 });
    assert.equal(replyFor(8).generation, 5);
    assert.equal(peakRuns, 1);
    assert.equal(activeRuns, 0);
    assert.deepEqual(responses().map(reply => reply.requestId), [1, 2, 4, 6, 8]);
    await send({ type: 'release', generation: 6 });
    assert.equal(events.at(-1), 'dispose:3');
    assert.deepEqual(replies.at(-1), { type: 'released', generation: 6 });
  } finally {
    for (const gate of gates) gate.release.resolve();
    await Promise.allSettled(operations);
    try {
      if (worker.onmessage) await send({ type: 'release', generation: 100 });
    } finally {
      if (previousSelf) Object.defineProperty(globalThis, 'self', previousSelf);
      else Reflect.deleteProperty(globalThis, 'self');
      if (previousRequire) Object.defineProperty(globalThis, 'require', previousRequire);
      else Reflect.deleteProperty(globalThis, 'require');
    }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import type { AnalysisResult } from '../core/inference/engine';
import { createBoard } from '../core/board';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';

const replies: WorkerOutMessage[] = [];
const worker = {
  postMessage: (reply: WorkerOutMessage) => replies.push(reply),
  onmessage: null as unknown as (event: { data: WorkerInMessage }) => Promise<void>,
};
Object.assign(globalThis, { self: worker, require: createRequire(import.meta.url) });
const { OnnxEngine } = await import('../core/inference/engine');
await import('../worker/ai.worker');
const send = (data: WorkerInMessage) => worker.onmessage({ data });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const result: AnalysisResult = {
  rootInfo: { winrate: 50, lead: 0, scoreStdev: 1, ownership: null },
  moves: [{ x: 2, y: 2, u: 0, prior: 1, winrate: 50, scoreMean: 0, scoreStdev: 1, lead: 0, vists: 1 }],
};
function compute(requestId: number, generation: number, mode: 'play' | 'analyze' = 'play'): WorkerInMessage {
  return { type: 'compute', requestId, generation, data: {
    board: createBoard(9), history: [], color: 'black', size: 9,
    difficulty: 'Easy', gameType: 'Go', mode, simulations: 2,
  } };
}

test('real Worker: cancel A then B never overlaps inference or delivers A', async () => {
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  let runs = 0;
  let active = 0;
  let peak = 0;
  const original = { initialize: OnnxEngine.prototype.initialize, analyze: OnnxEngine.prototype.analyze, dispose: OnnxEngine.prototype.dispose };
  OnnxEngine.prototype.initialize = async () => {};
  OnnxEngine.prototype.dispose = async () => {};
  OnnxEngine.prototype.analyze = async () => {
    runs++;
    peak = Math.max(peak, ++active);
    if (runs === 1) await gate;
    active--;
    return result;
  };
  try {
    await send({ type: 'init', generation: 1, payload: { modelPath: 'unused' } });
    replies.length = 0;
    const a = send(compute(1, 1, 'analyze'));
    await tick();
    await send({ type: 'stop', generation: 2 });
    const b = send(compute(2, 2));
    await tick();
    assert.equal(peak, 1, 'B must wait for the in-flight ONNX run to settle');
    unblock();
    await Promise.all([a, b]);
    assert.equal(runs, 2, 'cancelled ownership search must not start another visit');
    assert.deepEqual(replies.filter(reply => reply.type === 'ai-response').map(reply => ({ requestId: reply.requestId, generation: reply.generation })), [{ requestId: 2, generation: 2 }]);
  } finally {
    unblock();
    await tick();
    Object.assign(OnnxEngine.prototype, original);
  }
});

test('real Worker: release waits for inference, then reinit runs in order', async () => {
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const events: string[] = [];
  const original = { initialize: OnnxEngine.prototype.initialize, analyze: OnnxEngine.prototype.analyze, dispose: OnnxEngine.prototype.dispose };
  OnnxEngine.prototype.initialize = async () => { events.push('init'); };
  OnnxEngine.prototype.dispose = async () => { events.push('dispose'); };
  OnnxEngine.prototype.analyze = async () => { events.push('run'); await gate; events.push('settled'); return result; };
  try {
    await send({ type: 'init', generation: 3, payload: { modelPath: 'unused' } });
    events.length = 0;
    replies.length = 0;
    const a = send(compute(3, 3));
    await tick();
    const release = send({ type: 'release', generation: 4 });
    const reinit = send({ type: 'reinit', generation: 5 });
    await tick();
    assert.deepEqual(events, ['run']);
    unblock();
    await Promise.all([a, release, reinit]);
    assert.deepEqual(events, ['run', 'settled', 'dispose', 'init']);
    assert.equal(replies.some(reply => reply.type === 'ai-response'), false);
  } finally {
    unblock();
    await tick();
    Object.assign(OnnxEngine.prototype, original);
  }
});

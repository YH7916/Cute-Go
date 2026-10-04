import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createAiScheduler } from '../core/inference/scheduler';
import { runOwnershipSearch } from '../core/inference/search';
import { MicroBoard } from '../utils/micro-board';
import { createBoard } from '../core/board';
import type { AnalysisResult } from '../core/inference/engine';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';

Object.assign(globalThis, { require: createRequire(import.meta.url) });
const { OnnxEngine } = await import('../core/inference/engine');
const { WorkerEngineLifecycle } = await import('../worker/engineLifecycle');

const analysis: AnalysisResult = {
  rootInfo: { winrate: 50, lead: 0, scoreStdev: 1, ownership: null },
  moves: [{ x: 2, y: 2, u: 0, prior: 1, winrate: 50, scoreMean: 0, scoreStdev: 1, lead: 0, vists: 1 }],
};
const compute = (requestId: number, generation: number): WorkerInMessage => ({
  type: 'compute', requestId, generation,
  data: { board: createBoard(9), history: [], color: 'black', size: 9, gameType: 'Go' },
});

for (const visits of [1, 16]) {
  test(`Worker event loop: timer cancellation interrupts ${visits === 1 ? 'single inference before reply' : 'multi-visit search'}`, {
    timeout: 2000,
  }, async t => {
    const lifecycle = new WorkerEngineLifecycle();
    const replies: WorkerOutMessage[] = [];
    const runs = new Map<number, number>();
    let requestId = 0;
    let deliverStop!: () => void;
    t.mock.method(OnnxEngine.prototype, 'initialize', async () => {});
    t.mock.method(OnnxEngine.prototype, 'dispose', async () => {});
    t.mock.method(OnnxEngine.prototype, 'analyze', () => {
      runs.set(requestId, (runs.get(requestId) ?? 0) + 1);
      // Match the synchronous-WASM behavior: the result settles as a microtask.
      // Stop is an event-loop task, never a direct scheduler call from this run.
      if (requestId === 1 && runs.get(1) === 1) setTimeout(deliverStop, 0);
      return Promise.resolve(analysis);
    });
    const schedule = createAiScheduler(async (message, task) => {
      if (message.type === 'init') return lifecycle.initialize(message.payload, task);
      if (message.type !== 'compute') return;
      requestId = message.requestId;
      const engine = lifecycle.forTask(task);
      if (requestId === 1 && visits > 1) {
        await runOwnershipSearch(engine, new MicroBoard(9), 1, [], 9, 7.5, 'Hard', 0, visits);
      } else {
        await engine.analyze(new MicroBoard(9), 1);
      }
      task.reply({ type: 'ai-response', data: { move: null, winRate: 50 } });
    }, reply => replies.push(reply));
    const cancellation = new Promise<void>((resolve, reject) => {
      deliverStop = () => {
        void Promise.all([
          schedule({ type: 'stop', generation: 2 }),
          schedule(compute(2, 2)),
        ]).then(() => resolve(), reject);
      };
    });
    try {
      await schedule({ type: 'init', generation: 1, payload: { modelPath: 'unused' } });
      replies.length = 0;
      await Promise.all([schedule(compute(1, 1)), cancellation]);
      assert.equal(runs.get(1), 1, 'stop must run before another ownership-search visit starts');
      assert.equal(runs.get(2), 1, 'the replacement request must still complete');
      assert.deepEqual(replies.filter(reply => reply.type === 'ai-response').map(reply => ({
        requestId: reply.requestId, generation: reply.generation,
      })), [{ requestId: 2, generation: 2 }]);
    } finally {
      await lifecycle.release();
    }
  });
}

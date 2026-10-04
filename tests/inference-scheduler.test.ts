import assert from 'node:assert/strict';
import test from 'node:test';
import { createAiScheduler } from '../core/inference/scheduler';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';

const compute = (requestId: number, generation = 1): WorkerInMessage => ({
  type: 'compute', requestId, generation,
  data: { board: [], color: 'black', history: [], size: 9 },
});

test('scheduler: queued superseded requests never start and obsolete generations cannot rewind it', async () => {
  let unblock!: () => void;
  const gate = new Promise<void>(resolve => { unblock = resolve; });
  const started: number[] = [];
  const replies: WorkerOutMessage[] = [];
  const schedule = createAiScheduler(async (message, task) => {
    if (message.type !== 'compute') return;
    started.push(message.requestId);
    if (message.requestId === 1) await gate;
    task.assertCurrent();
    task.reply({ type: 'ai-response', data: { move: null, winRate: 50 } });
  }, reply => replies.push(reply));
  const first = schedule(compute(1));
  await Promise.resolve();
  const obsolete = schedule(compute(2));
  await schedule({ type: 'stop', generation: 2 });
  const current = schedule(compute(3, 2));
  await schedule(compute(4, 1));
  unblock();
  await Promise.all([first, obsolete, current]);
  assert.deepEqual(started, [1, 3]);
  assert.deepEqual(replies, [{ type: 'ai-response', requestId: 3, generation: 2, data: { move: null, winRate: 50 } }]);
});

test('scheduler: a rejected task reports its identity and never poisons the queue', async () => {
  const replies: WorkerOutMessage[] = [];
  const schedule = createAiScheduler(async (message, task) => {
    if (message.type !== 'compute') return;
    if (message.requestId === 1) throw new Error('failure');
    task.reply({ type: 'ai-response', data: { move: null, winRate: 50 } });
  }, reply => replies.push(reply));
  await schedule(compute(1));
  await schedule(compute(2));
  assert.deepEqual(replies.map(reply => reply.type), ['error', 'ai-response']);
  assert.equal(replies[0].generation, 1);
  assert.equal(replies[0].type === 'error' && replies[0].requestId, 1);
});

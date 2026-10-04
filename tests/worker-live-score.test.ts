import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createRequire } from 'node:module';
import { createBoard } from '../core/board';
import type { AnalysisResult } from '../core/inference/engine';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';
import type { Player } from '../types';

// Real Worker entry/scheduler/response path; only model execution is substituted.
const replies: WorkerOutMessage[] = [];
const worker = {
  postMessage: (reply: WorkerOutMessage) => replies.push(reply),
  onmessage: null as unknown as (event: { data: WorkerInMessage }) => Promise<void>,
};
Object.assign(globalThis, { self: worker, require: createRequire(import.meta.url) });
const { OnnxEngine } = await import('../core/inference/engine');
await import('../worker/ai.worker');
let generation = 0;
let requestId = 0;

async function scoreReply(t: TestContext, {
  size = 9, komi = 6.5, color = 'black', ownership,
  mode = 'play', difficulty = 'Easy', captures = { black: 0, white: 0 }, purpose,
}: {
  size?: number; komi?: number; color?: Player; ownership: Float32Array | null;
  mode?: 'play' | 'analyze'; difficulty?: 'Easy' | 'Hard';
  captures?: { black: number; white: number };
  purpose?: 'coach';
}) {
  const result: AnalysisResult = {
    // Deliberately unrelated raw misc output must never become the displayed lead.
    rootInfo: { winrate: 37, lead: 999, scoreStdev: 1, ownership },
    moves: [{ x: 0, y: 0, u: 0, prior: 1, winrate: 37, scoreMean: 0, scoreStdev: 1, lead: 0, vists: 1 }],
  };
  t.mock.method(OnnxEngine.prototype, 'initialize', async () => {});
  t.mock.method(OnnxEngine.prototype, 'dispose', async () => {});
  t.mock.method(OnnxEngine.prototype, 'analyze', async () => result);
  const send = (data: WorkerInMessage) => worker.onmessage({ data });
  const board = createBoard(size);
  const center = Math.floor(size / 2);
  board[center][center] = { color, x: center, y: center, id: 'first' };
  const before = structuredClone(board);
  await send({ type: 'init', generation: ++generation, payload: { modelPath: 'unused' } });
  replies.length = 0;
  try {
    await send({ type: 'compute', generation, requestId: ++requestId, data: {
      board, size, komi, color: color === 'black' ? 'white' : 'black',
      gameType: 'Go', difficulty, mode, simulations: 1, purpose,
      history: [{
        board: createBoard(size), currentPlayer: color, move: { x: center, y: center },
        lastMove: null, blackCaptures: captures.black, whiteCaptures: captures.white, consecutivePasses: 0,
      }],
    } });
    const response = replies.find(reply => reply.type === 'ai-response');
    assert.ok(response, JSON.stringify(replies));
    assert.deepEqual(board, before);
    return response.data;
  } finally {
    await send({ type: 'release', generation: ++generation });
  }
}

for (const size of [9, 19]) {
  for (const difficulty of ['Easy', 'Hard'] as const) {
    test(`Worker ${size}/${difficulty}: a first stone cannot claim the entire open board as live territory`, async t => {
      const ownership = new Float32Array(size * size);
      ownership[Math.floor(size / 2) * size + Math.floor(size / 2)] = 1;
      const response = await scoreReply(t, { size, difficulty, ownership });
      assert.equal(response.lead, -6.5, 'uncertain empty points add no estimated territory; living stones do not score');
      assert.equal(response.winRate, 63, 'win probability keeps the current-player to black conversion');
    });
  }
}

test('Worker live lead uses fractional ownership, absolute color, prisoners, and the supplied komi', async t => {
  const ownership = new Float32Array(81).fill(-0.25);
  ownership[40] = -1;
  const response = await scoreReply(t, {
    color: 'white', ownership, captures: { black: 3, white: 1 }, komi: 3.5,
  });
  assert.equal(response.lead, -20 + 3 - 1 - 3.5);
  assert.equal(response.winRate, 37);
});

test('Worker does not invent a live lead when the optional ownership head is unavailable', async t => {
  const response = await scoreReply(t, { ownership: null });
  assert.equal(response.lead, undefined);
});

test('Worker endgame analysis retains existing territory scoring instead of the live estimate', async t => {
  const response = await scoreReply(t, { mode: 'analyze', ownership: new Float32Array(81) });
  assert.equal(response.lead, 73.5);
  assert.equal(response.move, null);
});

test('Coach analysis returns legal candidate points and a separate live estimate with black perspective', async t => {
  const response = await scoreReply(t, { mode: 'analyze', purpose: 'coach', ownership: new Float32Array(81) });
  assert.equal(response.purpose, 'coach');
  assert.equal(response.estimatedBlackLead, -6.5);
  assert.equal(response.winRate, 63);
  assert.equal(response.visits, 1);
  assert.deepEqual(response.candidates, [{ point: { x: 0, y: 0 }, visits: 0 }]);
  assert.equal(response.move, null, 'analysis must never place its suggested move');
});

test('Coach analysis refuses a board that cannot be reconstructed from its history', async t => {
  t.mock.method(OnnxEngine.prototype, 'initialize', async () => {});
  t.mock.method(OnnxEngine.prototype, 'dispose', async () => {});
  const analyze = t.mock.method(OnnxEngine.prototype, 'analyze', async () => { throw new Error('must not analyze the wrong board'); });
  const send = (data: WorkerInMessage) => worker.onmessage({ data });
  await send({ type: 'init', generation: ++generation, payload: { modelPath: 'unused' } });
  replies.length = 0;
  try {
    const board = createBoard(9);
    board[4][4] = { color: 'black', x: 4, y: 4, id: 'initial-stone' };
    await send({ type: 'compute', generation, requestId: ++requestId, data: {
      board, history: [], size: 9, color: 'white', gameType: 'Go', mode: 'analyze', purpose: 'coach', difficulty: 'Hard', simulations: 1,
    } });
    assert.equal(analyze.mock.callCount(), 0);
    assert.ok(replies.some(reply => reply.type === 'error' && /局面/.test(reply.message)));
    assert.equal(replies.some(reply => reply.type === 'ai-response'), false);
  } finally {
    await send({ type: 'release', generation: ++generation });
  }
});

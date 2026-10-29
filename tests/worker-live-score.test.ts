import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createRequire } from 'node:module';
import { createBoard } from '../core/board';
import type { AnalysisResult } from '../core/inference/engine';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';
import type { Player } from '../types';
import { extractPolicyMoves } from '../core/inference/policy';
import { attemptMove } from '../core/go/rules';
import { getBoardHash } from '../core/board';
import type { MicroBoard, Sign } from '../utils/micro-board';

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
  assert.deepEqual(response.candidates, [{ point: { x: 0, y: 0 }, visits: 0, prior: 1, variation: [] }]);
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

for (const color of ['black', 'white'] as const) {
  test(`real coach Worker returns evaluated focus and legal short variation for ${color}`, async t => {
    const focus = { x: 8, y: 8 };
    t.mock.method(OnnxEngine.prototype, 'initialize', async () => {});
    t.mock.method(OnnxEngine.prototype, 'dispose', async () => {});
    const analyze = t.mock.method(OnnxEngine.prototype, 'analyze', async (board: MicroBoard, toPlay: Sign) => {
      const policy = new Float32Array(82).fill(-5);
      policy[0] = 3;
      policy[80] = -30;
      return { rootInfo: { winrate: toPlay === 1 ? 80 : 20, lead: 999, scoreStdev: 777, ownership: null },
        moves: extractPolicyMoves(policy, 9, board, toPlay, 0) };
    });
    const send = (data: WorkerInMessage) => worker.onmessage({ data });
    await send({ type: 'init', generation: ++generation, payload: { modelPath: 'unused' } });
    replies.length = 0;
    try {
      await send({ type: 'compute', generation, requestId: ++requestId, data: {
        board: createBoard(9), history: [], size: 9, color, gameType: 'Go', difficulty: 'Hard',
        mode: 'analyze', purpose: 'coach', simulations: 8, coachFocusPoints: [focus],
      } });
      const response = replies.find(reply => reply.type === 'ai-response');
      assert.ok(response, JSON.stringify(replies));
      assert.equal(response.data.move, null);
      assert.equal(analyze.mock.callCount(), 8);
      const candidate = response.data.candidates?.find(move => move.point.x === focus.x && move.point.y === focus.y);
      assert.ok(candidate && candidate.visits >= 2);
      const recommendation = response.data.candidates?.[0];
      assert.ok(recommendation && recommendation.visits > candidate.visits,
        'retaining a requested low-prior comparison must not promote it over the searched recommendation');
      assert.notDeepEqual(recommendation.point, focus);
      assert.ok(response.data.candidates?.every((item, index, candidates) => index === 0 || candidates[index - 1].visits >= item.visits));
      assert.equal(candidate.winRateBlack, 80);
      assert.ok(candidate.prior !== undefined && candidate.prior > 0 && candidate.prior < 0.01);
      assert.ok(candidate.variation?.length && candidate.variation.length <= 4);
      assert.deepEqual(candidate.variation[0], focus);
      let board = createBoard(9), previousHash: string | null = null;
      let toPlay: Player = color;
      for (const point of candidate.variation) {
        const move = attemptMove(board, point.x, point.y, toPlay, 'Go', previousHash);
        assert.ok(move, 'reported search variations must replay through the game rules');
        previousHash = getBoardHash(board);
        board = move.newBoard;
        toPlay = toPlay === 'black' ? 'white' : 'black';
      }
      assert.equal(Object.hasOwn(candidate, 'lead'), false);
      assert.equal(Object.hasOwn(candidate, 'scoreMean'), false);
      replies.length = 0;
      await send({ type: 'compute', generation, requestId: ++requestId, data: {
        board: createBoard(9), history: [], size: 9, color, gameType: 'Go', difficulty: 'Hard',
        mode: 'play', simulations: 8, coachFocusPoints: [focus],
      } });
      const playing = replies.find(reply => reply.type === 'ai-response');
      assert.ok(playing);
      assert.deepEqual(playing.data.move, { x: 0, y: 0 }, 'a teaching focus must not alter the opponent model policy');
      assert.equal(playing.data.candidates, undefined);
      assert.equal(analyze.mock.callCount(), 9, 'eight coach visits followed by one policy inference');
    } finally { await send({ type: 'release', generation: ++generation }); }
  });
}

for (const color of ['black', 'white'] as const) for (const visits of [1, 8]) {
  test(`coach Worker forwards actual pass and normalized ownership for ${color}/${visits}`, async t => {
    t.mock.method(OnnxEngine.prototype, 'initialize', async () => {});
    t.mock.method(OnnxEngine.prototype, 'dispose', async () => {});
    const ownership = new Float32Array(81).fill(-0.25);
    const analyze = t.mock.method(OnnxEngine.prototype, 'analyze', async (board: MicroBoard, toPlay: Sign) => {
      const policy = new Float32Array(82).fill(-20);
      policy[81] = 20;
      return { rootInfo: { winrate: toPlay === 1 ? 80 : 20, lead: 999, scoreStdev: 777, ownership },
        moves: extractPolicyMoves(policy, 9, board, toPlay, 0) };
    });
    const send = (data: WorkerInMessage) => worker.onmessage({ data });
    await send({ type: 'init', generation: ++generation, payload: { modelPath: 'unused' } });
    replies.length = 0;
    try {
      await send({ type: 'compute', generation, requestId: ++requestId, data: {
        board: createBoard(9), history: [], size: 9, color, gameType: 'Go', difficulty: 'Hard',
        mode: 'analyze', purpose: 'coach', simulations: visits,
      } });
      const response = replies.find(reply => reply.type === 'ai-response');
      assert.ok(response, JSON.stringify(replies));
      assert.equal(analyze.mock.callCount(), visits);
      assert.equal(response.data.move, null, 'analysis is still forbidden from placing or passing');
      assert.ok(response.data.pass);
      assert.equal(response.data.pass.visits, visits - 1);
      assert.ok(response.data.pass.prior !== undefined && response.data.pass.prior > 0.99 && response.data.pass.prior <= 1);
      assert.equal(response.data.pass.winRateBlack, visits === 1 ? undefined : 80);
      assert.deepEqual(response.data.ownership, ownership);
    } finally { await send({ type: 'release', generation: ++generation }); }
  });
}

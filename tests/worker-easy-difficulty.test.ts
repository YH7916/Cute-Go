import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createRequire } from 'node:module';
import { createBoard } from '../core/board';
import { getBeginnerAIMove } from '../core/go/ai';
import { attemptMove } from '../core/go/rules';
import type { AnalysisResult } from '../core/inference/engine';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';
import type { BoardState, Difficulty, HistoryItem, Player } from '../types';
import { getAIConfig } from '../utils/aiConfig';

// Exercise the production Worker, scheduler and response; substitute only ONNX execution.
const replies: WorkerOutMessage[] = [];
const worker = {
  postMessage: (reply: WorkerOutMessage) => replies.push(reply),
  onmessage: null as unknown as (event: { data: WorkerInMessage }) => Promise<void>,
};
Object.assign(globalThis, { self: worker, require: createRequire(import.meta.url) });
const { OnnxEngine } = await import('../core/inference/engine');
await import('../worker/ai.worker');
const send = (data: WorkerInMessage) => worker.onmessage({ data });
let generation = 0;
let requestId = 0;

const modelMove = (x: number, y: number, prior = 1): AnalysisResult['moves'][number] => ({
  x, y, prior, u: 0, winrate: 50, scoreMean: 0, scoreStdev: 1, lead: 0, vists: 0,
});

function centerOpening(): { board: BoardState; history: HistoryItem[] } {
  const board = createBoard(9);
  board[4][4] = { x: 4, y: 4, color: 'black', id: 'opening' };
  return { board, history: [{ board: createBoard(9), currentPlayer: 'black', move: { x: 4, y: 4 },
    lastMove: null, blackCaptures: 0, whiteCaptures: 0, consecutivePasses: 0 }] };
}

async function compute(t: TestContext, {
  board, history, moves, difficulty = 'Easy', color = 'white', simulations = 1,
}: {
  board: BoardState; history: HistoryItem[]; moves: AnalysisResult['moves'];
  difficulty?: Difficulty; color?: Player; simulations?: number;
}) {
  let calls = 0;
  t.mock.method(OnnxEngine.prototype, 'initialize', async () => {});
  t.mock.method(OnnxEngine.prototype, 'dispose', async () => {});
  t.mock.method(OnnxEngine.prototype, 'analyze', async () => {
    calls++;
    return { rootInfo: { winrate: 50, lead: 0, scoreStdev: 1, ownership: null }, moves };
  });
  const before = structuredClone({ board, history });
  await send({ type: 'init', generation: ++generation, payload: { modelPath: 'unused' } });
  replies.length = 0;
  const id = ++requestId;
  try {
    await send({ type: 'compute', generation, requestId: id, data: {
      board, history, size: board.length, color, gameType: 'Go', difficulty, simulations, komi: 3.5,
      temperature: getAIConfig(difficulty).temperature,
    } });
    const responses = replies.filter(reply => reply.type === 'ai-response');
    assert.equal(responses.length, 1, JSON.stringify(replies));
    const response = responses[0];
    assert.equal(response.generation, generation);
    assert.equal(response.requestId, id);
    assert.deepEqual({ board, history }, before, 'selection must not mutate the input position');
    return { move: response.data.move, calls };
  } finally {
    await send({ type: 'release', generation: ++generation });
  }
}

test('Easy Worker: dominant distant model policy cannot bypass the beginner local candidates', async t => {
  t.mock.method(Math, 'random', () => 0.5);
  const position = centerOpening();
  const { move, calls } = await compute(t, { ...position, moves: [modelMove(0, 0)] });
  assert.equal(calls, 1);
  assert.ok(move);
  assert.ok(move.x >= 1 && move.x <= 7 && move.y >= 1 && move.y <= 7,
    `Easy must stay within three intersections of the opening stone, got ${JSON.stringify(move)}`);
  assert.ok(attemptMove(position.board, move.x, move.y, 'white', 'Go', null));
});

test('Easy Worker: an allowed model-first pass still ends the response with a pass', async t => {
  const position = centerOpening();
  position.history.push({ board: structuredClone(position.board), currentPlayer: 'white', move: null,
    lastMove: { x: 4, y: 4 }, blackCaptures: 0, whiteCaptures: 0, consecutivePasses: 0 });
  const { move, calls } = await compute(t, {
    ...position, color: 'black', moves: [modelMove(-1, -1), modelMove(3, 4, 0.1)],
  });
  assert.equal(move, null);
  assert.equal(calls, 1);
});

test('Easy Worker: empty beginner pool retains the legal fallback when early pass is disallowed', async t => {
  const board = createBoard(5);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    if ((x === 1 && y === 1) || (x === 3 && y === 3)) continue;
    board[y][x] = { x, y, color: 'black', id: `${x},${y}` };
  }
  assert.equal(getBeginnerAIMove(board, 'black'), null, 'both empty points are avoided own eyes');
  // Deliberately short history isolates the Worker's defensive no-early-pass branch.
  const { move } = await compute(t, { board, history: [], color: 'black', moves: [modelMove(1, 1)] });
  assert.deepEqual(move, { x: 1, y: 1 }, 'reuse the existing row-order legal fallback');
  assert.ok(attemptMove(board, 1, 1, 'black', 'Go', null));
});

test('Medium Worker: configured visits do not change its existing single-inference path', async t => {
  t.mock.method(Math, 'random', () => 0.5);
  const result = await compute(t, {
    ...centerOpening(), moves: [modelMove(0, 0)], difficulty: 'Medium', simulations: 4,
  });
  assert.equal(result.calls, 1);
  assert.deepEqual(result.move, { x: 0, y: 0 });
});

for (const simulations of [10, 25]) {
  test(`Hard Worker: retains its ${simulations}-visit search budget`, async t => {
    const result = await compute(t, {
      ...centerOpening(), moves: [modelMove(0, 0), modelMove(0, 1, 0.8)], difficulty: 'Hard', simulations,
    });
    assert.equal(result.calls, simulations);
    assert.ok(result.move);
    assert.ok(result.move.x === 0 && (result.move.y === 0 || result.move.y === 1));
  });
}

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { createBoard } from '../core/board';
import { getGomokuAIMove } from '../core/gomoku/ai';
import { getGomokuSearchProfile } from '../core/gomoku/profiles';
import { getGomokuCandidates, searchGomoku } from '../core/gomoku/search';
import { getCandidateMoves } from '../core/go/rules';
import type { WorkerInMessage, WorkerOutMessage } from '../core/inference/protocol';
import type { BoardState, Difficulty, Player } from '../types';

const replies: WorkerOutMessage[] = [];
const worker = {
  postMessage: (message: WorkerOutMessage) => replies.push(message),
  onmessage: null as ((event: { data: WorkerInMessage }) => Promise<void>) | null,
};
Object.assign(globalThis, { self: worker, require: createRequire(import.meta.url) });
await import('../worker/ai.worker');

function place(board: BoardState, x: number, y: number, color: Player) {
  board[y][x] = { x, y, color, id: `${x},${y}` };
}

function crowdedBoard() {
  const board = createBoard(4);
  const empty = new Set(['0,0', '1,2', '2,1', '3,3']);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    if (!empty.has(`${x},${y}`)) place(board, x, y, (x + y) % 2 ? 'white' : 'black');
  }
  return board;
}

async function workerMove(board: BoardState, difficulty: Difficulty, now: () => number) {
  replies.length = 0;
  const before = structuredClone(board);
  const originalNow = performance.now;
  performance.now = now;
  try {
    assert.ok(worker.onmessage);
    await worker.onmessage({ data: {
      type: 'compute', generation: 0, requestId: 1,
      data: { board, history: [], color: 'black', size: board.length, difficulty, gameType: 'Gomoku' },
    } });
  } finally {
    performance.now = originalNow;
  }
  assert.deepEqual(board, before, 'worker search must restore input');
  const reply = replies.find(message => message.type === 'ai-response');
  assert.ok(reply?.type === 'ai-response', JSON.stringify(replies));
  return reply.data;
}

test('preserve observed synchronous choices and worker ties across all difficulties', async () => {
  const corner = createBoard(9);
  place(corner, 0, 0, 'black');
  const center = createBoard(9);
  place(center, 4, 4, 'white');
  const fixtures = [
    { name: 'empty', board: createBoard(9), sync: [[4, 4], [4, 4], [4, 4]], worker: [4, 4], ticks: [0, 0, 0] },
    { name: 'corner', board: corner, sync: [[2, 0], [2, 1], [2, 2]], worker: [2, 2], ticks: [4, 4, 4] },
    { name: 'center', board: center, sync: [[4, 2], [4, 3], [4, 3]], worker: [2, 2], ticks: [4, 4, 4] },
    { name: 'crowded', board: crowdedBoard(), sync: [[2, 1], [2, 1], [2, 1]], worker: [0, 0], ticks: [6, 11, 21] },
  ];
  for (const fixture of fixtures) {
    const { name, board } = fixture;
    for (const [index, difficulty] of (['Easy', 'Medium', 'Hard'] as const).entries()) {
      const before = structuredClone(board);
      const sync = getGomokuAIMove(board, 'black', difficulty);
      assert.deepEqual(board, before);
      let ticks = 0;
      const response = await workerMove(board, difficulty, () => {
        ticks++;
        return name === 'crowded' ? 0 : ticks < 3 ? 0 : 10000;
      });
      const label = `${name}/${difficulty}`;
      assert.deepEqual(sync, { x: fixture.sync[index][0], y: fixture.sync[index][1] }, label);
      assert.deepEqual(response, { move: { x: fixture.worker[0], y: fixture.worker[1] }, winRate: 0.5, lead: 0 }, label);
      assert.equal(ticks, fixture.ticks[index], `${label}: retain iteration and timeout boundaries`);
      let sharedTicks = 0;
      const shared = searchGomoku(board, 'black', getGomokuSearchProfile('worker', difficulty), () => {
        sharedTicks++;
        return name === 'crowded' ? 0 : sharedTicks < 3 ? 0 : 10000;
      });
      assert.deepEqual(shared.move, response.move, `${label}: extracted search matches the Worker`);
      assert.equal(sharedTicks, ticks, `${label}: extracted search preserves the iteration budget`);
      assert.deepEqual(board, before, 'shared search must restore input');
    }
  }
});

test('worker profile preserves Go candidate insertion order without depending on Go rules', () => {
  for (const size of [4, 9, 13, 15, 19]) {
    const board = createBoard(size);
    for (const occupied of [false, true]) {
      if (occupied) place(board, 0, 0, 'black');
      assert.deepEqual(getGomokuCandidates(board, getGomokuSearchProfile('worker', 'Hard')), getCandidateMoves(board, size, 2));
    }
  }
});

test('unknown worker difficulty retains Easy budgets while synchronous Fun retains Medium', () => {
  const workerEasy = getGomokuSearchProfile('worker', 'Easy');
  assert.deepEqual(getGomokuSearchProfile('worker', 'Fun'), workerEasy);
  assert.deepEqual(getGomokuSearchProfile('worker'), workerEasy);
  assert.deepEqual(getGomokuSearchProfile('synchronous', 'Fun'), getGomokuSearchProfile('synchronous', 'Medium'));
});

test('worker deadlines retain 100/800/3000 ms budgets and allow equality at the boundary', async () => {
  const board = createBoard(9);
  place(board, 4, 4, 'white');
  for (const [difficulty, budget] of [['Easy', 100], ['Medium', 800], ['Hard', 3000]] as const) {
    let workerTicks = 0;
    const response = await workerMove(board, difficulty, () => {
      workerTicks++;
      return workerTicks === 1 ? 0 : workerTicks === 2 ? budget : budget + 1;
    });
    let sharedTicks = 0;
    const before = structuredClone(board);
    const result = searchGomoku(board, 'black', getGomokuSearchProfile('worker', difficulty), () => {
      sharedTicks++;
      return sharedTicks === 1 ? 0 : sharedTicks === 2 ? budget : budget + 1;
    });
    assert.equal(workerTicks, 4, `${difficulty}: evaluate one root move at the exact deadline`);
    assert.equal(sharedTicks, 4, `${difficulty}: keep the same deadline boundary`);
    assert.deepEqual(result.move, response.move);
    assert.deepEqual(board, before);
  }
});

test('search remains deterministic without consuming randomness', () => {
  const board = crowdedBoard();
  const before = structuredClone(board);
  const originalRandom = Math.random;
  Math.random = () => { throw new Error('Gomoku search must not introduce random selection'); };
  try {
    for (const mode of ['synchronous', 'worker'] as const) {
      for (const difficulty of ['Easy', 'Medium', 'Hard']) {
        const profile = getGomokuSearchProfile(mode, difficulty);
        assert.deepEqual(searchGomoku(board, 'black', profile, () => 0), searchGomoku(board, 'black', profile, () => 0));
        assert.deepEqual(board, before);
      }
    }
  } finally {
    Math.random = originalRandom;
  }
});

test('full board returns no Worker move and preserves the legacy synchronous fallback', () => {
  const board = createBoard(4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) place(board, x, y, (x + y) % 2 ? 'white' : 'black');
  const before = structuredClone(board);
  assert.deepEqual(searchGomoku(board, 'black', getGomokuSearchProfile('worker', 'Hard')), { move: null, reason: 'no-moves' });
  assert.deepEqual(getGomokuAIMove(board, 'black', 'Hard'), { x: 2, y: 2 });
  assert.deepEqual(board, before);
});

test('legacy synchronous difficulty labels retain their original mapping', () => {
  const board = createBoard(9);
  place(board, 0, 0, 'black');
  for (const [alias, difficulty] of [['15k', 'Easy'], ['2d', 'Hard'], ['Fun', 'Medium'], ['unknown', 'Easy'], ['other', 'Medium']]) {
    assert.deepEqual(getGomokuAIMove(board, 'black', alias), getGomokuAIMove(board, 'black', difficulty));
  }
});

for (const mode of ['synchronous', 'worker'] as const) {
  for (const failAtDepth of [1, 3]) {
    test(`${mode} search restores every simulated stone when a read throws at depth ${failAtDepth}`, () => {
      const original = crowdedBoard();
      const before = structuredClone(original);
      let simulationDepth = 0;
      let injected = false;
      const failure = new Error('Injected read failure after a simulated placement');
      const board = original.map(row => new Proxy(row, {
        set(target, property, value: unknown) {
          if (typeof property === 'string' && /^\d+$/.test(property)) {
            if (value !== null && typeof value === 'object' && 'id' in value && value.id === 'sim') {
              simulationDepth++;
            } else if (value === null && target[Number(property)]?.id === 'sim') {
              simulationDepth--;
            }
          }
          return Reflect.set(target, property, value);
        },
        get(target, property, receiver) {
          if (!injected && simulationDepth === failAtDepth && typeof property === 'string' && /^\d+$/.test(property)) {
            injected = true;
            throw failure;
          }
          return Reflect.get(target, property, receiver);
        },
      }));

      assert.throws(
        () => searchGomoku(board, 'black', getGomokuSearchProfile(mode, 'Hard'), () => 0),
        error => error === failure,
      );
      assert.equal(injected, true, 'the failure must happen after the intended simulation depth');
      assert.equal(simulationDepth, 0, 'all active recursive placements must unwind');
      assert.deepEqual(original, before, 'existing stones, their IDs, and empty cells must survive');
    });
  }
}

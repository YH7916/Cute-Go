import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { createBoard } from '../core/board/index';
import { getGomokuAIMove, getGomokuScore } from '../core/gomoku/ai';
import { checkGomokuWin } from '../core/gomoku/rules';
import type { BoardState, Player, Point } from '../types';

function put(board: BoardState, color: Player, x: number, y: number) {
  board[y][x] = { color, x, y, id: `${x},${y}` };
}

// Former root smoke script: assertions now fail the one official test runner.
test('Hard synchronous AI blocks the isolated horizontal open three', () => {
  const board = createBoard(15);
  for (const x of [7, 8, 9]) put(board, 'black', x, 7);
  const move = getGomokuAIMove(board, 'white', 'Hard');
  assert.ok(move && move.y === 7 && [6, 10].includes(move.x));
});

test('Hard synchronous AI completes its horizontal four immediately', () => {
  const board = createBoard(15);
  for (const x of [7, 8, 9, 10]) put(board, 'white', x, 7);
  const move = getGomokuAIMove(board, 'white', 'Hard');
  assert.ok(move && move.y === 7 && [6, 11].includes(move.x));
});

// Run the real worker message handler without loading a Go model.
type Reply = { type: string; data?: { move: Point; winRate: number; lead: number } };
const replies: Reply[] = [];
const worker = {
  postMessage: (reply: Reply) => replies.push(reply),
  onmessage: null as unknown as (event: { data: unknown }) => Promise<void>,
};
// ONNX's Node bundle uses CommonJS built-ins even though tests are bundled as ESM.
Object.assign(globalThis, { self: worker, require: createRequire(import.meta.url) });
await import('../worker/ai.worker');

async function workerMove(board: BoardState, color: Player, difficulty: string) {
  replies.length = 0;
  const before = structuredClone(board);
  await worker.onmessage({ data: {
    type: 'compute', requestId: 1, generation: 0, data: { board, color, difficulty, size: board.length, history: [], gameType: 'Gomoku' },
  } });
  assert.deepEqual(board, before, 'search must restore the board');
  const response = replies.find(reply => reply.type === 'ai-response');
  assert.ok(response?.data, JSON.stringify(replies));
  return response.data;
}

for (const color of ['black', 'white'] as const) {
  const opponent = color === 'black' ? 'white' : 'black';
  for (const difficulty of ['Easy', 'Medium', 'Hard']) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      for (const gap of [2, 4]) {
        test(`${color}/${difficulty}: block five (${dx},${dy}, gap ${gap}) before making four`, async () => {
          const board = createBoard(15);
          // AI attack appears first in candidate order, reproducing the score tie.
          for (let x = 2; x <= 4; x++) put(board, color, x, 2);
          const start = { x: 7, y: 9 };
          put(board, color, start.x - dx, start.y - dy);
          for (let i = 0; i < 5; i++) {
            if (i !== gap) put(board, opponent, start.x + i * dx, start.y + i * dy);
          }
          const block = { x: start.x + gap * dx, y: start.y + gap * dy };
          assert.ok(getGomokuScore(board, block.x, block.y, color, opponent, false)
            > getGomokuScore(board, 5, 2, color, opponent, false));
          assert.deepEqual(getGomokuAIMove(board, color, difficulty), block);
          const response = await workerMove(board, color, difficulty);
          assert.deepEqual(response.move, block);
          assert.notEqual(response.winRate, 1, 'blocking is not an immediate victory');
        });
      }
    }

    test(`${color}/${difficulty}: take a real win before defending`, async () => {
      const board = createBoard(15);
      for (let x = 2; x <= 5; x++) {
        put(board, opponent, x, 2);
        put(board, color, x, 9);
      }
      const response = await workerMove(board, color, difficulty);
      put(board, color, response.move.x, response.move.y);
      assert.ok(checkGomokuWin(board, response.move));
    });
  }
}

test('forming an open four uses search and is not reported as an immediate win', async () => {
  const board = createBoard(15);
  for (let x = 2; x <= 4; x++) put(board, 'white', x, 2);
  const response = await workerMove(board, 'white', 'Easy');
  assert.notEqual(response.winRate, 1);
  put(board, 'white', response.move.x, response.move.y);
  assert.equal(checkGomokuWin(board, response.move), false);
});

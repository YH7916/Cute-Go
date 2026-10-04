import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sgf from '@sabaki/sgf';
import { loadTestModule } from '../tests/helpers/loadTestModule.mjs';

// Read-only source audit. Reuse the repository loader and real rules instead of
// adding a second build setup, board implementation, or legality algorithm.
execFileSync(process.execPath, ['--experimental-strip-types',
  fileURLToPath(new URL('./import-go-game-guru.mjs', import.meta.url)), '--check'], { stdio: 'inherit' });
const base = new URL('../third_party/go-game-guru/', import.meta.url);
const { problems } = JSON.parse(await readFile(new URL('problems.json', base), 'utf8'));
const cleanups = [];
const rules = await loadTestModule({
  contents: `
    export { inspectMove } from './core/go/rules';
    export { getBoardHash } from './core/board';
    export { createInitialPosition, recordMove } from './domains/game/positionState';
  `,
  registerCleanup: cleanup => cleanups.push(cleanup),
});

try {
  let moves = 0;
  let correctNodes = 0;
  let wrongNodes = 0;
  let unknownLeaves = 0;
  for (const problem of problems) {
    const original = await readFile(new URL(`sgf/${problem.id}.sgf`, base), 'utf8');
    const [independent] = sgf.parse(original);
    function compare(node, other) {
      assert.deepEqual(node.properties, other.data, `${problem.id}/${node.id}: properties lost`);
      assert.equal(node.children.length, other.children.length, `${problem.id}/${node.id}: branches lost`);
      if (node.correct) correctNodes++;
      if (node.wrong) wrongNodes++;
      if (!node.children.length && !node.correct && !node.wrong) unknownLeaves++;
      node.children.forEach((child, index) => compare(child, other.children[index]));
    }
    compare(problem.root, independent);
    const initial = rules.createInitialPosition(problem.boardSize);
    for (const stone of problem.initialStones) {
      initial.board[stone.y][stone.x] = { ...stone, id: `setup-${stone.x}-${stone.y}` };
    }
    function replay(node, position) {
      for (const child of node.children) {
        moves++;
        assert.equal(child.color, position.currentPlayer, `${problem.id}/${child.id}: wrong turn`);
        assert.ok(child.point, `${problem.id}/${child.id}: unexpected pass in selected source`);
        const prior = position.history.at(-1);
        const result = rules.inspectMove(position.board, child.point.x, child.point.y,
          child.color, 'Go', prior ? rules.getBoardHash(prior.board) : null);
        assert.equal(result.legal, true, `${problem.id}/${child.id}: illegal ${result.reason ?? ''}`);
        replay(child, rules.recordMove(position, result.result.newBoard, child.point,
          result.result.captured, false));
      }
    }
    replay(problem.root, initial);
  }
  const firstCorrectWithContinuation = problems.find(problem => problem.id === 'ggg-easy-74').root.children[0];
  assert.equal(firstCorrectWithContinuation.correct, true);
  assert.ok(firstCorrectWithContinuation.children.length > 0, 'Do not discard post-answer demonstration');
  assert.ok(unknownLeaves > 0, 'Do not convert all unmarked leaves into success or failure');
  console.log(JSON.stringify({ problems: problems.length, moves, correctNodes, wrongNodes, unknownLeaves,
    independentParser: 'all original properties and branches preserved', illegalMoves: 0 }));
} finally {
  for (const cleanup of cleanups) await cleanup();
}

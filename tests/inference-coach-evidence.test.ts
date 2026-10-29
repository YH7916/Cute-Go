import assert from 'node:assert/strict';
import test from 'node:test';
import { MicroBoard, type Sign } from '../utils/micro-board';
import { extractPolicyMoves } from '../core/inference/policy';
import { runOwnershipSearch } from '../core/inference/search';

const focus = { x: 8, y: 8 };
function engineFor(winner: Sign) {
  return { async analyze(board: MicroBoard, color: Sign) {
    const policy = new Float32Array(82).fill(-5);
    policy[0] = 3;
    policy[80] = -30; // Legal, but outside the ordinary ten-child policy beam.
    return {
      rootInfo: { winrate: color === winner ? 80 : 20, lead: 999, scoreStdev: 777, ownership: null },
      moves: extractPolicyMoves(policy, 9, board, color, 0),
    };
  } };
}

for (const color of [1, -1] as const) {
  test(`coach evidence uses visited child Q and black perspective for ${color}`, async () => {
    const result = await runOwnershipSearch(engineFor(1), new MicroBoard(9), color, [], 9, 3.5, 'Hard', 0, 8, [focus]);
    const candidate = result.coachCandidates.find(move => move.point.x === focus.x && move.point.y === focus.y);
    assert.ok(candidate, 'a requested legal move outside the normal beam must actually be considered');
    assert.ok(candidate.visits >= 2, 'a policy suggestion is not a measured candidate');
    assert.equal(candidate.winRateBlack, 80, 'do not return the policy record placeholder or the opponent perspective');
    assert.ok(candidate.prior > 0 && candidate.prior < 0.01);
    assert.ok(candidate.variation.length >= 1 && candidate.variation.length <= 4);
    assert.deepEqual(candidate.variation[0], focus);
    const replay = new MicroBoard(9);
    let toPlay: Sign = color;
    for (const point of candidate.variation) {
      assert.equal(replay.play(point.x, point.y, toPlay), true);
      toPlay = toPlay === 1 ? -1 : 1;
    }
    assert.equal(Object.hasOwn(candidate, 'lead'), false);
    assert.equal(Object.hasOwn(candidate, 'scoreMean'), false);
  });
}

test('unvisited policy candidates have no fabricated win rate or variation', async () => {
  const result = await runOwnershipSearch(engineFor(1), new MicroBoard(9), 1, [], 9, 3.5, 'Hard', 0, 1);
  assert.ok(result.coachCandidates.length);
  for (const candidate of result.coachCandidates) {
    assert.equal(candidate.visits, 0);
    assert.equal(candidate.winRateBlack, undefined);
    assert.deepEqual(candidate.variation, []);
  }
});

test('focus is capped, rejects illegal points, and leaves unfocused analysis search unchanged', async () => {
  const initial = new MicroBoard(9);
  initial.play(8, 7, 1);
  const normal = await runOwnershipSearch(engineFor(1), initial, -1, [], 9, 3.5, 'Hard', 0, 8);
  const emptyFocus = await runOwnershipSearch(engineFor(1), initial, -1, [], 9, 3.5, 'Hard', 0, 8, []);
  assert.deepEqual(emptyFocus.rankedMoves, normal.rankedMoves);
  assert.deepEqual(emptyFocus.move, normal.move);
  const focused = await runOwnershipSearch(engineFor(1), initial, -1, [], 9, 3.5, 'Hard', 0, 8,
    [{ x: -1, y: 0 }, { x: 8, y: 7 }, focus, focus, { x: 7, y: 8 }, { x: 6, y: 8 }, { x: 5, y: 8 }]);
  assert.equal(focused.visits, 8);
  assert.equal(focused.coachCandidates.some(move => move.point.x === 8 && move.point.y === 7), false);
  for (const point of [focus, { x: 7, y: 8 }, { x: 6, y: 8 }]) {
    assert.ok(focused.coachCandidates.some(move => move.point.x === point.x && move.point.y === point.y && move.visits >= 2));
  }
});

test('a searched pass ends a candidate variation instead of inventing a further placement', async () => {
  const engine = { async analyze(board: MicroBoard, color: Sign) {
    const policy = new Float32Array(82).fill(-20);
    policy[81] = 20;
    return { rootInfo: { winrate: 50, lead: 0, scoreStdev: 0, ownership: null },
      moves: extractPolicyMoves(policy, 9, board, color, 0) };
  } };
  const result = await runOwnershipSearch(engine, new MicroBoard(9), 1, [], 9, 3.5, 'Hard', 0, 8, [focus]);
  const candidate = result.coachCandidates.find(move => move.point.x === focus.x && move.point.y === focus.y);
  assert.ok(candidate && candidate.visits >= 2);
  assert.deepEqual(candidate.variation, [focus]);
});

for (const color of [1, -1] as const) for (const visits of [1, 8]) {
  test(`pass evidence preserves actual visits and black value for ${color}/${visits}`, async () => {
    let calls = 0;
    const engine = { async analyze(board: MicroBoard, toPlay: Sign) {
      calls++;
      const policy = new Float32Array(82).fill(-20);
      policy[81] = 20;
      return { rootInfo: { winrate: toPlay === 1 ? 80 : 20, lead: 999, scoreStdev: 777,
        ownership: new Float32Array(81).fill(calls / 16) },
      moves: extractPolicyMoves(policy, 9, board, toPlay, 0) };
    } };
    const result = await runOwnershipSearch(engine, new MicroBoard(9), color, [], 9, 3.5, 'Hard', 0, visits);
    assert.equal(calls, visits, 'exposing evidence must not perform an additional inference');
    assert.ok(result.coachPass, 'the searched root pass is distinct from analysis move:null');
    assert.equal(result.coachPass.visits, visits - 1);
    assert.equal(result.coachPass.prior, result.rootAnalysis.moves.find(move => move.x === -1)?.prior);
    assert.equal(result.coachPass.winRateBlack, visits === 1 ? undefined : 80);
    assert.equal(Object.hasOwn(result.coachPass, 'winRateBlack'), visits > 1, 'no value for an unvisited pass');
    assert.deepEqual(result.ownership, new Float32Array(81).fill((visits + 1) / 32),
      'ownership retains its existing mean across visited nodes, not only the root');
  });
}

test('a null best move without a root pass child is not pass evidence', async () => {
  const engine = { async analyze() {
    return { rootInfo: { winrate: 50, lead: 0, scoreStdev: 0, ownership: null }, moves: [] };
  } };
  const result = await runOwnershipSearch(engine, new MicroBoard(9), 1, [], 9, 3.5, 'Hard', 0, 1);
  assert.equal(result.move, null);
  assert.equal(result.coachPass, undefined);
});

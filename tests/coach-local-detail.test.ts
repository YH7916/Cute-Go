import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCoachAgent } from '../agent/coach/runtime';
import { getBoardHash, getGroup } from '../core/board';
import { attemptMove } from '../core/go/rules';
import { buildCoachEvidence, getLocalCoachMessage } from '../domains/coach/evidence';
import { createInitialPosition, recordMove, type GamePosition } from '../domains/game/positionState';
import type { Player } from '../types';

function put(position: GamePosition, color: Player, x: number, y: number) {
  position.board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
}

function play(position: GamePosition, x: number, y: number) {
  const before = position.history.at(-1);
  const moved = attemptMove(position.board, x, y, position.currentPlayer, 'Go', before ? getBoardHash(before.board) : null);
  assert.ok(moved, 'fixture must be a legal move');
  return recordMove(position, moved.newBoard, { x, y }, moved.captured, false);
}

function compact(message: string) {
  assert.ok(message.length <= 80, `teaching must fit 80 characters: ${message}`);
  assert.ok(message.split(/[。！？]/).filter(Boolean).length <= 2);
  assert.doesNotMatch(message, /最佳|必胜|已经做活|已经安全|救活了/);
}

for (const color of ['black', 'white'] as const) {
  const opponent = color === 'black' ? 'white' : 'black';

  test(`${color}: connecting teaches the resulting group's exact liberties and shared counting`, () => {
    const before = createInitialPosition(5);
    before.currentPlayer = color;
    put(before, color, 1, 2);
    put(before, color, 3, 2);
    const position = play(before, 2, 2);
    assert.equal(getGroup(position.board, { x: 2, y: 2 })?.liberties, 8);
    const message = getLocalCoachMessage(buildCoachEvidence(position, color, 7.5), 'explain-last-move');
    compact(message);
    assert.match(message, /8\s*口气/);
    assert.match(message, /共用|同一.*空点|重复.*一次/);
    assert.match(message, /不能.*相加|不.*直接相加/);
  });

  test(`${color}: filling an own liberty identifies the actual before-and-after count`, () => {
    const before = createInitialPosition(5);
    before.currentPlayer = color;
    for (const [x, y] of [[1, 1], [2, 1], [3, 1], [1, 2], [3, 2], [1, 3], [2, 3], [3, 3]]) put(before, color, x, y);
    assert.equal(getGroup(before.board, { x: 1, y: 1 })?.liberties, 13);
    const position = play(before, 2, 2);
    assert.equal(getGroup(position.board, { x: 2, y: 2 })?.liberties, 12);
    const message = getLocalCoachMessage(buildCoachEvidence(position, color, 7.5), 'explain-last-move');
    compact(message);
    assert.match(message, /13.*12/);
    assert.match(message, /填.*气|占.*气/);
  });

  test(`${color}: reducing opposing liberties points to that group and explains the change`, () => {
    const before = createInitialPosition(5);
    before.currentPlayer = color;
    put(before, opponent, 1, 1);
    put(before, color, 0, 1);
    assert.equal(getGroup(before.board, { x: 1, y: 1 })?.liberties, 3);
    const position = play(before, 1, 0);
    assert.equal(getGroup(position.board, { x: 1, y: 1 })?.liberties, 2);
    const message = getLocalCoachMessage(buildCoachEvidence(position, color, 7.5), 'explain-last-move');
    compact(message);
    assert.match(message, /B4/);
    assert.match(message, /3.*2/);
    assert.doesNotMatch(message, /打吃|只剩一口气/);
  });

  test(`${color}: a pressured group is named from the learner's perspective rather than the last mover's`, () => {
    const before = createInitialPosition(5);
    before.currentPlayer = color;
    put(before, opponent, 1, 1);
    put(before, color, 0, 1);
    const position = play(before, 1, 0);
    for (const userColor of [color, opponent] as const) {
      const message = getLocalCoachMessage(buildCoachEvidence(position, userColor, 7.5), 'explain-last-move');
      compact(message);
      assert.match(message, /B4.*3.*2/);
      assert.match(message, userColor === opponent ? /你的\s*B4/ : /对手的\s*B4/);
      assert.doesNotMatch(message, userColor === opponent ? /对手的\s*B4|对方\s*B4/ : /你的\s*B4/);
    }
  });

  test(`${color}: an opponent-turn capture hint explicitly says the opponent can capture`, () => {
    const position = createInitialPosition(5);
    position.currentPlayer = opponent;
    put(position, color, 1, 1);
    for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(position, opponent, x, y);
    const evidence = buildCoachEvidence(position, color, 7.5);
    assert.equal(evidence.candidates[0].point.label, 'B3');
    assert.equal(evidence.candidates[0].capturedStones, 1);
    assert.equal(evidence.candidates[0].savedStones, 0);
    const message = getLocalCoachMessage(evidence, 'hint');
    compact(message);
    assert.match(message, /B3/);
    assert.match(message, new RegExp(`${color === 'black' ? '黑棋' : '白棋'}的最后一口气`));
    assert.match(message, /对手[^。；]*(提子|吃掉)/);
    assert.doesNotMatch(message, /你[^。；]*(提子|吃掉)/);
  });

  test(`${color}: an escape hint names the point and the verified extra liberties`, () => {
    const position = createInitialPosition(5);
    position.currentPlayer = color;
    put(position, color, 1, 1);
    for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(position, opponent, x, y);
    const original = structuredClone(position);
    const message = getLocalCoachMessage(buildCoachEvidence(position, color, 7.5), 'hint');
    compact(message);
    assert.match(message, /B3/);
    assert.match(message, /3\s*口气/);
    assert.match(message, /解除打吃|解.*打吃/);
    assert.deepEqual(position, original);
  });

  for (const mover of [color, opponent] as const) {
    test(`${color}, ${mover} to play: a quiet hint identifies the learner's two-liberty group and both exits`, () => {
      const position = createInitialPosition(5);
      position.currentPlayer = mover;
      put(position, color, 1, 1);
      put(position, opponent, 0, 1);
      put(position, opponent, 1, 0);
      const evidence = buildCoachEvidence(position, color, 7.5);
      assert.equal(evidence.atariGroups.length, 0);
      assert.equal(evidence.candidates.length, 0);
      const message = getLocalCoachMessage(evidence, 'hint');
      compact(message);
      assert.match(message, /B4/);
      assert.match(message, /C4/);
      assert.match(message, /B3/);
      assert.match(message, /2\s*口气|两口气/);
      assert.match(message, /你的|你.*棋/);
      assert.doesNotMatch(message, /已经被打吃|只剩一口气|必死/);
      if (mover !== color) assert.doesNotMatch(message, /现在.*落|现在.*下|直接落|请落|你先下/);
    });
  }
}

test('capturing to rescue a separate group does not attribute the new stone group liberties to it', () => {
  const position = createInitialPosition(5);
  for (const [x, y] of [[1, 2], [2, 1], [3, 2]]) put(position, 'black', x, y);
  for (const [x, y] of [[0, 2], [1, 1], [2, 2]]) put(position, 'white', x, y);
  const next = play(position, 2, 3);
  assert.equal(getGroup(next.board, { x: 1, y: 2 })?.liberties, 2);
  assert.equal(getGroup(next.board, { x: 2, y: 3 })?.liberties, 4);
  const evidence = buildCoachEvidence(position, 'black', 7.5);
  assert.equal(evidence.candidates[0].point.label, 'C2');
  const message = getLocalCoachMessage(evidence, 'hint');
  compact(message);
  assert.match(message, /C2/);
  assert.match(message, /提|吃/);
  assert.doesNotMatch(message, /B3[^。；]*4\s*口气/);
});

test('offline runtime teaches the concrete escape without a provider request or position mutation', async t => {
  const position = createInitialPosition(5);
  put(position, 'black', 1, 1);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) put(position, 'white', x, y);
  const original = structuredClone(position);
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline teaching must not request a provider'); });
  const result = await executeCoachAgent({ kind: 'ask', position, userColor: 'black', intent: 'hint',
    config: { endpoint: 'https://coach.example/v1', model: 'coach', apiKey: '' } });
  assert.equal(result.source, 'local');
  assert.equal(result.configured, false);
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(result.hintPoints, [{ x: 1, y: 2, label: 'B3' }]);
  assert.match(result.text, /圈出的这里/);
  assert.match(result.text, /3\s*口气/);
  compact(result.text);
  assert.deepEqual(position, original);
});

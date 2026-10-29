import assert from 'node:assert/strict';
import test from 'node:test';
import { attemptMove } from '../core/go/rules';
import { buildCoachEvidence, getLocalCoachMessage } from '../domains/coach/evidence';
import { explainPosition, explainRejectedMove } from '../domains/coach/teaching';
import { createInitialPosition, recordMove, type GamePosition } from '../domains/game/positionState';
import type { Player } from '../types';

function put(position: GamePosition, color: Player, points: number[][]) {
  for (const [x, y] of points) position.board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
}

for (const userColor of ['black', 'white'] as const) {
  const opponent = userColor === 'black' ? 'white' : 'black';

  test(`${userColor}: a quiet hint gives direction without pointing at an unrelated healthy group`, () => {
    const position = createInitialPosition(9);
    position.currentPlayer = userColor;
    put(position, userColor, [[4, 4]]);
    const before = structuredClone(position);
    const message = getLocalCoachMessage(buildCoachEvidence(position, userColor, 3.5), 'hint');
    assert.match(message, /空旷.*角边/);
    assert.doesNotMatch(message, /[A-HJ-T]\d|口气|暂未|安全|打吃/);
    assert.ok(message.length <= 40);
    assert.deepEqual(position, before);
  });

  test(`${userColor}: an escape hint gives its verified action and purpose without a routine counting tail`, () => {
    const position = createInitialPosition(9);
    position.currentPlayer = userColor;
    put(position, userColor, [[1, 1]]);
    put(position, opponent, [[0, 1], [1, 0], [2, 1]]);
    const evidence = buildCoachEvidence(position, userColor, 3.5);
    assert.equal(evidence.candidates[0].point.label, 'B7');
    assert.equal(evidence.candidates[0].savedStones, 1);
    const message = getLocalCoachMessage(evidence, 'hint');
    assert.match(message, /你.*在 B7 接长/);
    assert.match(message, /解除打吃/);
    assert.doesNotMatch(message, /\d口气|做活|不等于/);
    assert.ok(message.length <= 40);
  });

  test(`${userColor}: a weak group has a natural location phrase and retains both exits`, () => {
    const position = createInitialPosition(9);
    position.currentPlayer = userColor;
    put(position, userColor, [[1, 1]]);
    put(position, opponent, [[0, 1], [1, 0]]);
    const message = getLocalCoachMessage(buildCoachEvidence(position, userColor, 3.5), 'hint');
    assert.match(message, /你在 B8 的棋/);
    assert.match(message, /2口气.*C8.*B7/);
    assert.match(message, /接长/);
    assert.doesNotMatch(message, /你的 B8 这块/);
  });

  test(`${userColor}: position teaching keeps the endangered side and focuses on escaping atari`, () => {
    const position = createInitialPosition(9);
    put(position, userColor, [[1, 1]]);
    put(position, opponent, [[0, 1], [1, 0], [2, 1]]);
    const message = explainPosition(buildCoachEvidence(position, userColor, 3.5), 30);
    assert.match(message, /你在 B8 的棋只剩一口气.*B7/);
    assert.match(message, /接长|解围/);
    assert.doesNotMatch(message, /再比围空|稍占先|不等于/);
    assert.ok(message.length <= 55);
  });
}

test('short capture teaching preserves the real countercapture risk', () => {
  const position = createInitialPosition(5);
  put(position, 'black', [[0, 1], [1, 0], [1, 2]]);
  put(position, 'white', [[1, 1], [2, 0], [3, 1], [2, 2]]);
  const evidence = buildCoachEvidence(position, 'black', 3.5);
  assert.equal(evidence.candidates[0].point.label, 'C4');
  assert.equal(evidence.candidates[0].capturedStones, 1);
  assert.equal(evidence.candidates[0].libertiesAfter, 1);
  const message = getLocalCoachMessage(evidence, 'hint');
  assert.match(message, /C4.*(提子|吃子)/);
  assert.match(message, /只剩一口气.*反提/);
});

test('short rejected-move teaching preserves no-liberty and ko conditions', () => {
  const suicide = createInitialPosition(5);
  put(suicide, 'white', [[0, 1], [1, 0], [2, 1], [1, 2]]);
  const rejected = explainRejectedMove(suicide, { x: 1, y: 1 });
  assert.match(rejected.text, /在这里.*没有气.*吃不到.*不能下/);
  assert.deepEqual(rejected.hintPoints, [{ x: 1, y: 1, label: 'B4' }]);

  const before = createInitialPosition(5);
  put(before, 'black', [[0, 1], [1, 0], [1, 2]]);
  put(before, 'white', [[1, 1], [2, 0], [3, 1], [2, 2]]);
  const moved = attemptMove(before.board, 2, 1, 'black');
  assert.ok(moved);
  const ko = recordMove(before, moved.newBoard, { x: 2, y: 1 }, moved.captured, false);
  const recapture = explainRejectedMove(ko, { x: 1, y: 1 });
  assert.match(recapture.text, /劫/);
  assert.match(recapture.text, /回到上一手之前/);
  assert.match(recapture.text, /先在别处.*对方回应.*再看/);
  assert.deepEqual(recapture.hintPoints, [{ x: 1, y: 1, label: 'B4' }]);
});

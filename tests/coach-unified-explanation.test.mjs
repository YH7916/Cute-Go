import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { executeCoachAgent, createInitialPosition, recordMove, recordPass, attemptMove } = await loadTestModule({
  contents: `export { executeCoachAgent } from './agent/coach/runtime';
    export { createInitialPosition, recordMove, recordPass } from './domains/game/positionState';
    export { attemptMove } from './core/go/rules';`,
});
const offline = { endpoint: '', model: '', apiKey: '' };
const input = position => ({ kind: 'inspect', position, userColor: 'black', intent: 'explain-position', config: offline });
function put(position, color, points) {
  for (const [x, y] of points) position.board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
}
function play(position, x, y) {
  const result = attemptMove(position.board, x, y, position.currentPlayer);
  assert.ok(result, 'the teaching fixture must be a legal move');
  return recordMove(position, result.newBoard, { x, y }, result.captured, false);
}
function capturedPosition(endangered = false) {
  const before = createInitialPosition(9);
  put(before, 'white', [[1, 1]]);
  put(before, 'black', [[0, 1], [1, 0], [2, 1]]);
  if (endangered) {
    put(before, 'black', [[6, 6]]);
    put(before, 'white', [[5, 6], [6, 5], [7, 6]]);
  }
  return play(before, 1, 2);
}
function escapedPosition() {
  const before = createInitialPosition(9);
  put(before, 'black', [[1, 1]]);
  put(before, 'white', [[0, 1], [1, 0], [2, 1]]);
  return play(before, 1, 2);
}
function connectedPosition() {
  const before = createInitialPosition(9);
  put(before, 'black', [[1, 2], [3, 2]]);
  return play(before, 2, 2);
}

for (const [name, create, expected] of [
  ['capture', capturedPosition, /最后一口气.*整块提走/],
  ['escape', escapedPosition, /多出了出口.*解了打吃.*不等于已经做活/],
  ['connection', connectedPosition, /2块棋连成一块.*共用8口气/],
  ['pass', () => recordPass(createInitialPosition(9)), /停了一手.*不等于认输/],
]) {
  test(`the unified explanation retains the verified ${name} lesson offline`, async () => {
    const position = create();
    const before = structuredClone(position);
    const result = await executeCoachAgent(input(position));
    assert.match(result.text, expected);
    assert.doesNotMatch(result.text, /刚开局|稍占先|胜率|(?<!不等于)已经做活/);
    assert.ok(result.hintPoints.length <= 3);
    assert.equal(result.source, 'local');
    assert.deepEqual(position, before);
  });
}

test('an endangered group takes priority over a simultaneous capture lesson from either learner view', async () => {
  for (const [userColor, relationship] of [['black', '你'], ['white', '对手']]) {
    const result = await executeCoachAgent({ ...input(capturedPosition(true)), userColor });
    assert.match(result.text, new RegExp(`^${relationship}有一块棋只剩一口气`));
    assert.doesNotMatch(result.text, /整块提走/);
    assert.equal(result.hintPoints.length, 2);
    assert.deepEqual(result.hintPoints.map(({ x, y }) => [x, y]), [[6, 6], [6, 7]]);
  }
});

test('an opponent in atari prompts a legal capture check rather than rescuing the opponent', async () => {
  const result = await executeCoachAgent({ ...input(capturedPosition(true)), userColor: 'white' });
  assert.match(result.text, /^对手有一块棋只剩一口气/);
  assert.match(result.text, /检查.*合法.*提子/);
  assert.match(result.text, /不等于.*能吃到/);
  assert.doesNotMatch(result.text, /先看能否连接或逃出|一定能提走|必吃/);
  assert.deepEqual(result.hintPoints.map(({ x, y }) => [x, y]), [[6, 6], [6, 7]]);
});

test('ordinary placement, ordinary extension and unverified history keep current-position teaching', async () => {
  const first = play(createInitialPosition(9), 2, 2);
  const extension = createInitialPosition(9);
  put(extension, 'black', [[2, 2]]);
  const unverified = capturedPosition();
  unverified.blackCaptures++;
  for (const position of [first, play(extension, 2, 3), unverified]) {
    const result = await executeCoachAgent(input(position));
    assert.match(result.text, /刚开局.*照应.*发展/);
    assert.doesNotMatch(result.text, /红点|这手|提走|共用|稍占先/);
    assert.deepEqual(result.hintPoints, []);
  }
});

test('the cloud request asks for recent verified changes as well as current priorities', async t => {
  let question;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    question = JSON.parse(init.body).messages[1].content.split('\n玩家问题：')[1];
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      kind: 'explain', parts: [{ id: 'current', variant: 0 }],
    }) }, finish_reason: 'stop' }] }));
  });
  const result = await executeCoachAgent({ ...input(capturedPosition()), kind: 'ask',
    config: { endpoint: 'http://localhost:1234/v1', model: 'test', apiKey: '' } });
  assert.match(question, /弱棋/);
  assert.match(question, /上一手.*提子.*解围.*连接.*停着/);
  assert.match(question, /没有.*变化/);
  assert.match(result.text, /最后一口气.*整块提走/);
  assert.equal(result.source, 'cloud');
  assert.ok(result.hintPoints.length <= 3);
});

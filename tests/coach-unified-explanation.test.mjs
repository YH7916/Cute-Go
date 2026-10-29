import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { executeCoachAgent, createInitialPosition, recordMove, recordPass, attemptMove } = await loadTestModule({
  contents: `export { executeCoachAgent } from './agent/coach/runtime';
    export { createInitialPosition, recordMove, recordPass } from './domains/game/positionState';
    export { attemptMove } from './core/go/rules';`,
});
const offline = { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' };
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
  ['capture', capturedPosition, /最后一口气.*提走了这里的整块棋/],
  ['escape', escapedPosition, /增加了气.*解除了打吃/],
  ['connection', connectedPosition, /2块棋连成一块.*共用周围的气/],
  ['pass', () => recordPass(createInitialPosition(9)), /停着.*不等于认输/],
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
    assert.match(result.text, new RegExp(`^${relationship}在①的棋只剩一口气（②）`));
    assert.doesNotMatch(result.text, /提走/);
    assert.equal(result.hintPoints.length, 2);
    assert.deepEqual(result.hintPoints.map(({ x, y }) => [x, y]), [[6, 6], [6, 7]]);
  }
});

test('an opponent in atari prompts a legal capture check rather than rescuing the opponent', async () => {
  const result = await executeCoachAgent({ ...input(capturedPosition(true)), userColor: 'white' });
  assert.match(result.text, /^对手在①的棋只剩一口气（②）/);
  assert.match(result.text, /先检查能否合法占住这口气提子/);
  assert.doesNotMatch(result.text, /先看能否接长或吃子解围|先看能否连接或逃出|一定能提走|必吃/);
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
    assert.match(result.text, /刚开局.*角边发展.*互相照应/);
    assert.doesNotMatch(result.text, /红点|这手|提走|共用|稍占先/);
    assert.deepEqual(result.hintPoints, []);
  }
});

test('the cloud request provides recent verified changes and asks for the current priority', async t => {
  let question, evidence;
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    ({ question, evidence } = JSON.parse(init.body));
    return new Response(JSON.stringify({ text: JSON.stringify({
      kind: 'explain', parts: [{ id: 'current', variant: 0 }],
    }) }));
  });
  const result = await executeCoachAgent({ ...input(capturedPosition()), kind: 'ask',
    config: { endpoint: 'http://localhost:1234/v1', provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-model-key' } });
  assert.equal(evidence.teachingRequest.intent, 'explain-position');
  assert.ok(evidence.teachingChoices.some(choice => choice.id === 'last-action'));
  assert.ok(evidence.teachingChoices.some(choice => choice.id === 'current'));
  assert.equal(question, '只讲当前最需要理解的一点及原因。');
  assert.match(result.text, /最后一口气.*提走了这里的整块棋/);
  assert.equal(result.source, 'cloud');
  assert.ok(result.hintPoints.length <= 3);
});

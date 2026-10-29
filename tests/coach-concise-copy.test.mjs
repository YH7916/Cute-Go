import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { executeCoachAgent, createInitialPosition, renderCoachBoardReferences, renderCoachReviewSummary } = await loadTestModule({
  contents: `export { executeCoachAgent } from './agent/coach/runtime';
    export { createInitialPosition } from './domains/game/positionState';
    export { renderCoachBoardReferences, renderCoachReviewSummary } from './domains/coach/response';`,
});
const config = { endpoint: 'http://localhost:1234/v1', provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-model-key' };
const reply = parts => new Response(JSON.stringify({ text: JSON.stringify({ kind: 'explain', parts }) }));

test('board references fit ordinary Chinese word order without injected phrases or spaces', () => {
  const single = renderCoachBoardReferences('先看 B8 的黑棋，整块有4口气。', 9);
  assert.equal(single.text, '先看这里的黑棋，整块有4口气。');
  assert.deepEqual(single.hintPoints, [{ x: 1, y: 1, label: 'B8' }]);
  const multiple = renderCoachBoardReferences('B8 的黑棋只剩 C8 一口气。', 9);
  assert.equal(multiple.text, '①的黑棋只剩②一口气。');
  assert.deepEqual(multiple.hintPoints, [{ x: 1, y: 1, label: 'B8' }, { x: 2, y: 1, label: 'C8' }]);
  for (const text of ['圈出的这里的黑棋有4口气。', single.text]) {
    const reviewed = renderCoachReviewSummary(text, single.hintPoints, 9);
    assert.match(reviewed.text, /这里的黑棋/);
    assert.doesNotMatch(reviewed.text, /圈出的这里|B8/);
    assert.deepEqual(reviewed.hintPoints, single.hintPoints);
  }
});

test('an explicit group question gets the count without stock warnings or redundant stone counts', async t => {
  t.mock.method(globalThis, 'fetch', async () => reply([{ id: 'group.E5', variant: 0 }]));
  const position = createInitialPosition(9);
  position.board[4][4] = { color: 'black', x: 4, y: 4, id: 'black' };
  const result = await executeCoachAgent({ kind: 'ask', position, userColor: 'black', intent: 'hint', config,
    question: '这颗黑棋有几口气？' });
  assert.equal(result.text, '这里的黑棋有4口气。');
  assert.equal(result.source, 'cloud');
  assert.deepEqual(result.hintPoints, [{ x: 4, y: 4, label: 'E5' }]);
});

test('default guidance rejects a stitched lecture, while a specific rule question may combine necessary material', async t => {
  const sentLimits = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    const evidence = JSON.parse(init.body).evidence;
    sentLimits.push(evidence.teachingRequest.maxParts);
    return reply([{ id: 'current', variant: 0 }, { id: 'concept.liberties', variant: 0 }]);
  });
  const input = { kind: 'ask', position: createInitialPosition(9), userColor: 'black', intent: 'hint', config };
  const fallback = await executeCoachAgent({ ...input, kind: 'inspect' });
  const unsolicitedLecture = await executeCoachAgent(input);
  assert.equal(unsolicitedLecture.source, 'local');
  assert.equal(unsolicitedLecture.text, fallback.text, 'keep the complete short lesson rather than truncate conditions or marks');
  const answer = await executeCoachAgent({ ...input, question: '从哪里开局，气又该怎么算？' });
  assert.equal(answer.source, 'cloud');
  assert.match(answer.text, /上下左右/);
  assert.equal(answer.text.split('\n').length, 2);
  assert.ok(answer.text.split('\n').every(part => part.startsWith('- ')), 'independent answers use an unordered list');
  assert.deepEqual(sentLimits, [1, 3]);
});

for (const [id, question, expected] of [
  ['go.tactics.snapback', '倒扑是什么？再看看 E5 黑棋几口气。', /倒扑.*不是劫/],
  ['go.rules.place-turn', '能把棋子放在格子里吗？再看看 E5 黑棋几口气。', /不能放在格子里.*不能覆盖已有棋子/],
  ['go.rules.territory-dead', '数地时棋子算分吗？再看看 E5 黑棋几口气。', /地和提子计分.*盘上棋子不再加分/],
]) {
  test(`${id}: review omits the point belonging only to the later group explanation`, async t => {
    t.mock.method(globalThis, 'fetch', async () => reply([
      { id: `course.${id}`, variant: 1 }, { id: 'group.E5', variant: 0 },
    ]));
    const position = createInitialPosition(9);
    position.board[4][4] = { color: 'black', x: 4, y: 4, id: 'black' };
    const result = await executeCoachAgent({ kind: 'ask', position, userColor: 'black', intent: 'hint', config, question });
    assert.equal(result.source, 'cloud');
    assert.deepEqual(result.hintPoints, [{ x: 4, y: 4, label: 'E5' }]);
    assert.match(result.text, /\n- 这里的黑棋有4口气/);
    const review = renderCoachReviewSummary(result.text, result.hintPoints, 9);
    assert.match(review.text, expected);
    assert.doesNotMatch(review.text, /黑棋有4口气/);
    assert.deepEqual(review.hintPoints, [], 'a general concept has no location on this board');
  });
}

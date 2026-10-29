import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCoachResponse, renderCoachReviewSummary, type CoachTeachingChoice } from '../domains/coach/response';

// Selected short responses from the real-model capture; no request logs or credentials.
const cases = [
  { id: 'A1c', text: 'D4的黑棋有4口气：C4、E4、D5、D3，斜对角不算气。',
    choice: { id: 'group.D4', kind: 'position', variants: ['D4的黑棋有4口气。'], coordinates: ['D4'] },
    labels: ['D4', 'C4', 'E4', 'D5', 'D3'], displayed: '①的黑棋有4口气：②、③、④、⑤，斜对角不算气。' },
  { id: 'C2', text: '不用数两次：连在一起的棋子共用气，同一空点只算一次。',
    choice: { id: 'group.H8', kind: 'position', variants: ['H8的白棋有7口气。', '重复的空点只算一次。'] },
    labels: [], displayed: '不用数两次：连在一起的棋子共用气，同一空点只算一次。' },
  { id: 'D1', text: 'D4的黑棋只有1口气，就是D5。',
    choice: { id: 'group.D4', kind: 'position', variants: ['D4的黑棋有1口气。'], coordinates: ['D4'] },
    labels: ['D4', 'D5'], displayed: '①的黑棋只有1口气，就是②。' },
  { id: 'D2', text: '不在了：白棋D5填住最后一口气，把D4那颗黑棋提走了。',
    choice: { id: 'last-action', kind: 'position', variants: ['这手填住最后一口气，提走了D4的整块棋。'] },
    labels: ['D5', 'D4'], displayed: '不在了：白棋①填住最后一口气，把②那颗黑棋提走了。' },
] as const;

for (const sample of cases) {
  test(`real cloud prose ${sample.id} is presented without a phrase or coordinate whitelist`, () => {
    const choice: CoachTeachingChoice = { id: sample.choice.id, kind: sample.choice.kind,
      variants: [...sample.choice.variants],
      ...('coordinates' in sample.choice ? { coordinates: [...sample.choice.coordinates] } : {}) };
    const result = renderCoachResponse(JSON.stringify({ kind: 'explain', text: sample.text, refs: [choice.id] }), [choice], false, 9);
    assert.equal(result?.kind, 'explain');
    if (result?.kind !== 'explain') return;
    assert.equal(result.text, sample.displayed);
    assert.deepEqual(result.hintPoints.map(point => point.label), sample.labels);
    assert.deepEqual(renderCoachReviewSummary(result.text, result.hintPoints, 9),
      { text: result.text, hintPoints: result.hintPoints }, 'review retains every bound point including fourth and fifth markers');
  });
}

test('five legal cloud points render completely while legacy selections keep their three-point limit', () => {
  const choices: CoachTeachingChoice[] = [{ id: 'rule', kind: 'concept', variants: ['先看A1、B2、C3、D4和E5。'] }];
  const text = '先看A1、B2、C3、D4和E5，再回看A1。';
  const result = renderCoachResponse(JSON.stringify({ kind: 'explain', text, refs: ['rule'] }), choices, false, 9);
  assert.equal(result?.kind, 'explain');
  if (result?.kind === 'explain') {
    assert.equal(result.text, '先看①、②、③、④和⑤，再回看①。');
    assert.equal(result.hintPoints.length, 5);
  }
  assert.equal(renderCoachResponse(JSON.stringify({ kind: 'explain', parts: [{ id: 'rule', variant: 0 }] }), choices, false, 9), null);
});

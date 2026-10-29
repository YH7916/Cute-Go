import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoachEvidence, coachPositionKey, getLocalCoachMessage } from '../domains/coach/evidence';
import { buildCoachTeachingChoices, renderCoachResponse } from '../domains/coach/response';
import { buildCompactCoachContext } from '../domains/coach/context';
import { createInitialPosition } from '../domains/game/positionState';
import { engineTeachingChoices, verifiedCoachEngine } from '../agent/coach/engineEvidence';

const reply = (text: string, id: string) => JSON.stringify({ kind: 'explain', text, refs: [id] });

test('default and explicit questions share one sentence and fifty characters for new prose', () => {
  const evidence = buildCoachEvidence(createInitialPosition(9), 'black', 3.5);
  const choices = buildCoachTeachingChoices(evidence, { text: getLocalCoachMessage(evidence, 'hint') });
  for (const [question, maxParts] of [[undefined, 1], ['怎么数气？', 3]] as const) {
    const { payload } = buildCompactCoachContext({ evidence, choices, question, intent: 'hint', hintPoints: [] });
    assert.deepEqual(payload.teachingRequest, { proactive: false, intent: 'hint', maxParts,
      maxTextChars: 50, maxSentences: 1, maxRefs: 3, maxBoardPoints: 3 });
    assert.ok(JSON.stringify(payload).length <= 6000);
  }
});

test('new prose accepts fifty characters, rejects fifty-one and has no lower length bound', () => {
  const boundary = '先检查能否提走对方棋子；若自己的整块棋仍没有气，就不能下，同时检查是否立即恢复上一手之前的完整棋盘。';
  const overlong = boundary.replace('同时检查', '同时再检查');
  assert.equal(boundary.length, 50);
  assert.equal(overlong.length, 51);
  const choices = [{ id: 'rule', kind: 'concept' as const, variants: [boundary] }];
  for (const maxParts of [1, 3] as const) {
    assert.deepEqual(renderCoachResponse(reply(boundary, 'rule'), choices, false, 9, maxParts),
      { kind: 'explain', text: boundary, hintPoints: [] });
    assert.equal(renderCoachResponse(reply(overlong, 'rule'), choices, false, 9, maxParts), null);
    const short = '先检查整块棋的气。';
    assert.deepEqual(renderCoachResponse(reply(short, 'rule'), choices, false, 9, maxParts),
      { kind: 'explain', text: short, hintPoints: [] });
  }
});

test('new prose rejects a second sentence without deleting conditions', () => {
  const choices = [{ id: 'rule', kind: 'concept' as const,
    variants: ['先检查能否提走对方棋子；若自己的整块棋仍没有气，就不能下。'] }];
  for (const maxParts of [1, 3] as const) {
    assert.equal(renderCoachResponse(reply('先检查能否提子。自己的棋仍没有气就不能下。', 'rule'), choices, false, 9, maxParts), null);
    assert.equal(renderCoachResponse(reply('Check the capture first. Then check liberties.', 'rule'), choices, false, 9, maxParts), null);
    const text = choices[0].variants[0];
    assert.deepEqual(renderCoachResponse(reply(text, 'rule'), choices, false, 9, maxParts),
      { kind: 'explain', text, hintPoints: [] });
  }
});

test('legacy selections preserve complete multi-sentence rule conditions', () => {
  const text = '先检查能否提走对方棋子。若自己的整块棋仍没有气，就不能下。';
  const choices = [{ id: 'rule', kind: 'concept' as const, variants: [text] }];
  assert.deepEqual(renderCoachResponse(JSON.stringify({ kind: 'explain', parts: [{ id: 'rule', variant: 0 }] }), choices, false, 9, 1),
    { kind: 'explain', text, hintPoints: [] });
});

test('engine facts can be expressed within the short answer contract and cite a verified continuation', () => {
  const position = createInitialPosition(9);
  const engine = verifiedCoachEngine({ kind: 'ask', position, userColor: 'black', intent: 'hint',
    config: { endpoint: '', provider: 'deepseek' as const, model: 'deepseek-flash', apiKey: '' }, engineEvidence: {
      positionKey: coachPositionKey(position, 'black', 3.5), source: 'local-katago', perspective: 'black', visits: 8,
      candidates: [{ point: { x: 3, y: 3 }, visits: 7,
        variation: [{ x: 3, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 5 }] }],
    } }, 3.5);
  const choices = engineTeachingChoices(engine);
  assert.ok(renderCoachResponse(reply(choices[0].variants[0], 'engine.D6'), choices, false, 9, 1),
    'our own evidence wording must fit the default protocol');
  const result = renderCoachResponse(reply('本地搜索的一种示例是D6、E5，再到F4；对手也可能选择其他应法。', 'engine.D6'), choices, false, 9, 1);
  assert.equal(result?.kind, 'explain');
  if (result?.kind === 'explain') assert.deepEqual(result.hintPoints.map(point => point.label), ['D6', 'E5', 'F4']);
  const otherPoint = renderCoachResponse(reply('本地搜索示例是D6、A1。', 'engine.D6'), choices, false, 9, 1);
  assert.equal(otherPoint?.kind, 'explain');
  if (otherPoint?.kind === 'explain') assert.deepEqual(otherPoint.hintPoints.map(point => point.label), ['D6', 'A1']);
  assert.equal(renderCoachResponse(reply('本地搜索示例是D6、T19。', 'engine.D6'), choices, false, 9, 1), null,
    'model-authored coordinates must still be on this board');
});

test('a named non-anchor stone and other legal points can be referenced without changing reusable choices', () => {
  const position = createInitialPosition(19);
  for (const y of [17, 18]) position.board[y][18] = { x: 18, y, color: 'white', id: `white-${y}` };
  const evidence = buildCoachEvidence(position, 'white', 7.5);
  const choices = buildCoachTeachingChoices(evidence, { text: getLocalCoachMessage(evidence, 'hint') });
  const original = structuredClone(choices);
  const context = buildCompactCoachContext({ evidence, choices, question: 'T1的白棋有几口气？', intent: 'hint', hintPoints: [] });
  const result = renderCoachResponse(reply('T1的白棋有3口气。', 'group.T2'), context.choices, false, 19, 3);
  assert.equal(result?.kind, 'explain');
  if (result?.kind === 'explain') assert.deepEqual(result.hintPoints.map(point => point.label), ['T1']);
  const otherPoint = renderCoachResponse(reply('A1的白棋有3口气。', 'group.T2'), context.choices, false, 19, 3);
  assert.equal(otherPoint?.kind, 'explain');
  if (otherPoint?.kind === 'explain') assert.deepEqual(otherPoint.hintPoints, [{ x: 0, y: 18, label: 'A1' }]);
  assert.equal(renderCoachResponse(reply('U1的白棋有3口气。', 'group.T2'), context.choices, false, 19, 3), null);
  assert.deepEqual(choices, original, 'per-request references do not mutate reusable teaching items');
});

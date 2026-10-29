import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCoachTeachingChoices, renderCoachResponse } from '../domains/coach/response';
import { executeCoachAgent } from '../agent/coach/runtime';
import { buildCoachEvidence, coachPositionKey } from '../domains/coach/evidence';
import { createInitialPosition } from '../domains/game/positionState';

const choices = [{ id: 'engine.D6', kind: 'position' as const,
  variants: ['D6是本地搜索候选。落子后有4口气。'] }];
const encode = (text: string, refs = ['engine.D6']) => JSON.stringify({ kind: 'explain', text, refs });

test('short cloud prose can explain referenced engine evidence and bind its board point', () => {
  assert.deepEqual(renderCoachResponse(encode('可以试下D6，给这颗棋留出向外发展的空间。'), choices, false, 9, 1), {
    kind: 'explain', text: '可以试下这里，给这颗棋留出向外发展的空间。',
    hintPoints: [{ x: 3, y: 3, label: 'D6' }],
  });
});

test('short cloud prose preserves model wording without inferring certainty from strings', () => {
  const evidence = [{ ...choices[0], variants: ['D6是本地搜索候选，不保证后续安全。'] }];
  const response = renderCoachResponse(encode('D6是本地搜索候选，不保证后续安全。'), evidence, false, 9, 1);
  assert.equal(response?.kind, 'explain');
  assert.equal(response?.text, '这里是本地搜索候选，不保证后续安全。');
  assert.equal(renderCoachResponse(encode('D6不保证吃子，但保证后续安全。'), evidence, false, 9, 1)?.kind, 'explain');
});

for (const [fact, reply] of [
  ['D6有4口气。', 'D6有四口气。'],
  ['D6有4口气。', 'D6有4.0口气。'],
  ['D6有2口气。', 'D6有两口气。'],
  ['D6有两口气。', 'D6有2口气。'],
  ['D6可提走12颗棋子。', 'D6可提走十二颗棋子。'],
  ['D6可提走一百零四颗棋子。', 'D6可提走104颗棋子。'],
  ['D6可提走0颗棋子。', 'D6可提走零颗棋子。'],
] as const) {
  test(`cloud prose preserves the model's quantity spelling: ${reply}`, () => {
    const result = renderCoachResponse(encode(reply), [{ ...choices[0], variants: [fact] }], false, 9, 1);
    assert.equal(result?.kind, 'explain');
    assert.equal(result?.text, reply.replace('D6', '这里'));
  });
}

for (const text of [
  '可以从空旷角部开始，下一步观察向外发展的空间。',
  '可以从空旷角部开始，一步步观察向外发展的空间。',
]) {
  test(`navigation wording does not invent a step count: ${text}`, () => {
    const evidence = buildCoachEvidence(createInitialPosition(9), 'black', 3.5);
    const authored = buildCoachTeachingChoices(evidence, { text: '' });
    const opening = authored.filter(choice => choice.id === 'concept.opening');
    assert.equal(opening.length, 1);
    const result = renderCoachResponse(encode(text, ['concept.opening']), opening, false, 9, 1);
    assert.deepEqual(result, { kind: 'explain', text, hintPoints: [] });
  });
}

for (const text of ['先下1步。', '先走一步。', '先走两步。', '下一步先走一步。', '一步步观察，先走两步。']) {
  test(`cloud prose can describe steps beyond the cited variant wording: ${text}`, () => {
    const evidence = buildCoachEvidence(createInitialPosition(9), 'black', 3.5);
    const authored = buildCoachTeachingChoices(evidence, { text: '' });
    const reading = authored.filter(choice => choice.id === 'concept.reading');
    assert.equal(reading.length, 1);
    assert.deepEqual(renderCoachResponse(encode(text, ['concept.reading']), reading, false, 9, 1),
      { kind: 'explain', text, hintPoints: [] });
  });
}

for (const text of [
  'D6不能保证必活，也不一定最优。',
  'D6无法确保必胜。',
  'D6不能证明必死。',
  '不能保证D6必活。',
  'D6未必是最优。',
]) {
  test(`explicit uncertainty does not become a forbidden positive claim: ${text}`, () => {
    const result = renderCoachResponse(encode(text), choices, false, 9, 1);
    assert.equal(result?.kind, 'explain');
    assert.equal(result?.text, text.replace('D6', '这里'));
  });
}

for (const text of [
  'D6不能保证必活，但保证最优。',
  'D6不是不能保证必活。',
  'D6不能不保证必活。',
  'D6并非无法确保必胜。',
  'D6不一定最优，但它绝对安全。',
  'D6有两口气。',
  'D6有四十口气。',
  'D6有-4口气。',
  'D6有负四口气。',
  'D6有四万口气。',
]) {
  test(`cloud prose does not use variant numbers or certainty wording as a semantic judge: ${text}`, () => {
    const result = renderCoachResponse(encode(text), choices, false, 9, 1);
    assert.equal(result?.kind, 'explain');
    assert.equal(result?.text, text.replace('D6', '这里'));
  });
}

test('a single JSON fence and ordinary prose line breaks normalize without discarding content', () => {
  const json = encode('D6有四口气；\r\n不能保证必活。');
  const result = renderCoachResponse(` \n\`\`\`json\n${json}\n\`\`\`\n `, choices, false, 9, 1);
  assert.deepEqual(result, { kind: 'explain', text: '这里有四口气； 不能保证必活。',
    hintPoints: [{ x: 3, y: 3, label: 'D6' }] });
});

for (const wrap of [
  (json: string) => `这是结果：\n\`\`\`json\n${json}\n\`\`\``,
  (json: string) => `\`\`\`json\n${json}\n${json}\n\`\`\``,
  (json: string) => `\`\`\`json\n${json}\n\`\`\`\n\`\`\`json\n${json}\n\`\`\``,
  (json: string) => `\`\`\`javascript\n${json}\n\`\`\``,
  (json: string) => `${json}\n${json}`,
]) {
  test('JSON normalization never extracts an object from extra prose, multiple objects or another language', () => {
    assert.equal(renderCoachResponse(wrap(encode('可以试下D6。')), choices, false, 9, 1), null);
  });
}

test('normalization keeps coordinate, reference, field and dangerous-body validation active inside a fence', () => {
  for (const payload of [
    encode('可以试下T19。'),
    encode('可以试下D6。', ['unknown']),
    encode('<b>D6</b>有4口气。'),
    encode('D6不能保证必活。\nD6必胜。'),
    JSON.stringify({ kind: 'explain', text: '可以试下D6。', refs: ['engine.D6'], coordinates: ['A1'] }),
  ]) assert.equal(renderCoachResponse(`\`\`\`json\n${payload}\n\`\`\``, choices, false, 9, 1), null);
});

for (const [label, text, refs] of [
  ['unknown evidence', '可以试下D6。', ['engine.A1']],
  ['off-board point', '可以试下T19。', ['engine.D6']],
  ['unbound mark', '先下①。', ['engine.D6']],
  ['HTML', '<b>D6</b>可以试下。', ['engine.D6']],
  ['overlong reply', '先观察空点再比较变化。'.repeat(12), ['engine.D6']],
  ['too many sentences', '可以试下D6。看看气。再看连接。', ['engine.D6']],
  ['two sentences with certainty wording', 'D6不能保证必活。D6必胜。', ['engine.D6']],
] as const) {
  test(`cloud prose rejects ${label} instead of truncating or inventing evidence`, () => {
    assert.equal(renderCoachResponse(encode(text, [...refs]), choices, false, 9, 1), null);
  });
}

for (const text of ['可以试下A1。', 'D6有8口气。', 'D6能确保必胜。']) {
  test(`existing source ids permit model-authored prose: ${text}`, () => {
    const result = renderCoachResponse(encode(text), choices, false, 9, 1);
    assert.equal(result?.kind, 'explain');
    assert.equal(result?.text, text.replace(/A1|D6/, '这里'));
  });
}

test('validated engine branch and actual settings reach the cloud in one request', async t => {
  const position = createInitialPosition(13);
  const config = { endpoint: 'http://localhost:1234/v1', provider: 'deepseek' as const, model: 'deepseek-flash', apiKey: 'test-model-key' };
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const sent = body.evidence;
    assert.equal(sent.boardSize, 13);
    assert.equal(sent.difficulty, 'Hard');
    assert.equal(sent.userColor, 'white');
    assert.equal(sent.engineAnalysis.candidates[0].prior, 0.4);
    assert.equal(sent.engineAnalysis.candidates[0].winRateBlack, 58);
    assert.equal(sent.engineAnalysis.candidates[0].variation.length, 2);
    assert.ok(sent.teachingChoices.some((choice: { id: string }) => choice.id === 'engine.D10'));
    assert.deepEqual(Object.keys(body).sort(), ['evidence', 'model', 'provider', 'question']);
    return new Response(JSON.stringify({ text: encode('可以观察D10附近的空点。', ['engine.D10']) }));
  });
  const answer = await executeCoachAgent({ kind: 'ask', position, userColor: 'white', difficulty: 'Hard',
    intent: 'hint', question: 'D10怎么样？', config, engineEvidence: {
      positionKey: coachPositionKey(position, 'black', 7.5), source: 'local-katago', perspective: 'black', visits: 8,
      candidates: [{ point: { x: 3, y: 3 }, visits: 5, prior: 0.4, winRateBlack: 58,
        variation: [{ x: 3, y: 3 }, { x: 4, y: 4 }] }],
    } });
  assert.equal(answer.source, 'cloud');
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(answer.text, '可以观察这里附近的空点。');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCoachAgent } from '../agent/coach/runtime';
import { createInitialPosition } from '../domains/game/positionState';
import { renderCoachResponse, renderCoachReviewSummary } from '../domains/coach/response';
import { coachPositionKey } from '../domains/coach/evidence';
import { sanitizeCoachHistory } from '../domains/coach/conversation';

const config = { endpoint: 'http://localhost:1234/v1', provider: 'deepseek' as const, model: 'deepseek-flash', apiKey: 'test-model-key' };
const request = () => ({ kind: 'ask' as const, position: createInitialPosition(9),
  userColor: 'black' as const, intent: 'hint' as const, config });
const response = (text: string) => new Response(JSON.stringify({ text }));

for (const text of ['A1 有十颗黑棋，黑方已经必胜。', '白棋在 K19 只剩两口气。',
  '{"kind":"explain","parts":[{"id":"invented-fact","variant":0}]}',
  '{"kind":"explain","parts":[{"id":"current","variant":0}],"text":"黑棋必胜"}']) {
  test(`unverified provider claims cannot be published: ${text}`, async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => response(text));
    const input = request();
    const before = structuredClone(input.position);
    const reply = await executeCoachAgent(input);
    assert.equal(reply.source, 'local');
    assert.equal(reply.error, undefined);
    assert.equal(reply.cacheable, false);
    assert.notEqual(reply.text, text);
    assert.doesNotMatch(reply.text, /十颗|必胜|K19|两口气|invented-fact/);
    assert.match(reply.text, /空旷角部/);
    assert.deepEqual(input.position, before);
    assert.equal(fetch.mock.callCount(), 1, 'validation failure must not trigger a paid repair');
  });
}

test('a bounded selection renders only locally verified teaching, never model prose', async t => {
  t.mock.method(globalThis, 'fetch', async () => response(JSON.stringify({ kind: 'explain',
    parts: [{ id: 'current', variant: 0 }, { id: 'concept.liberties', variant: 0 }] })));
  const result = await executeCoachAgent({ ...request(), question: '开局从哪里下，气又是什么？' });
  assert.equal(result.source, 'cloud');
  assert.match(result.text, /空旷角部/);
  assert.match(result.text, /上下左右|空点/);
  assert.doesNotMatch(result.text, /"parts"|"variant"/);
});

test('the teacher can answer about a quiet group with a different expression and no invented markers', async t => {
  t.mock.method(globalThis, 'fetch', async () => response(JSON.stringify({ kind: 'explain',
    parts: [{ id: 'group.E5', variant: 1 }, { id: 'concept.connection', variant: 0 }] })));
  const input = request();
  input.position.board[4][4] = { color: 'black', x: 4, y: 4, id: 'quiet-stone' };
  const result = await executeCoachAgent({ ...input, question: 'E5 这里的气怎么算？斜对角连接吗？' });
  assert.equal(result.source, 'cloud');
  assert.match(result.text, /这里.*黑棋.*4口气/);
  assert.match(result.text, /斜对角.*不算连接/);
  assert.deepEqual(result.hintPoints, [{ x: 4, y: 4, label: 'E5' }]);
});

test('choice validation rejects extra data, stale references, repeated parts and invalid variants', () => {
  const choices = [{ id: 'group.E5', kind: 'position' as const, variants: ['这块黑棋有4口气。'] }];
  const invalid = [
    { kind: 'explain', parts: [] },
    { kind: 'explain', parts: [{ id: 'group.D4', variant: 0 }] },
    { kind: 'explain', parts: [{ id: 'group.E5', variant: -1 }] },
    { kind: 'explain', parts: [{ id: 'group.E5', variant: 0.5 }] },
    { kind: 'explain', parts: [{ id: 'group.E5', variant: 1 }] },
    { kind: 'explain', parts: [{ id: 'group.E5', variant: 0, text: '白棋已死' }] },
    { kind: 'explain', parts: Array.from({ length: 2 }, () => ({ id: 'group.E5', variant: 0 })) },
    { kind: 'silent', text: 'hidden claim' },
    { kind: 'unavailable', text: 'hidden claim' },
  ];
  for (const value of invalid) assert.equal(renderCoachResponse(JSON.stringify(value), choices, true, 9), null);
  assert.equal(renderCoachResponse('{"kind":"silent"}', choices, false, 9), null);
  assert.deepEqual(renderCoachResponse('{"kind":"silent"}', choices, true, 9), { kind: 'silent' });
});

test('authored multiline material remains one complete teaching item with its limits and ordered references', () => {
  const choices = [
    { id: 'first', kind: 'position' as const, variants: ['- B8只剩一口气。\n- 还要检查能否合法提子，不能只凭气数判断。'] },
    { id: 'second', kind: 'position' as const, variants: ['D6有两口气。'] },
  ];
  const selected = renderCoachResponse(JSON.stringify({ kind: 'explain', parts: [
    { id: 'first', variant: 0 }, { id: 'second', variant: 0 },
  ] }), choices, false, 9);
  assert.ok(selected && selected.kind === 'explain');
  assert.equal(selected.text, '- ①只剩一口气。还要检查能否合法提子，不能只凭气数判断。\n- ②有两口气。');
  assert.deepEqual(selected.hintPoints, [{ x: 1, y: 1, label: 'B8' }, { x: 3, y: 3, label: 'D6' }]);
  assert.deepEqual(renderCoachReviewSummary(selected.text, selected.hintPoints, 9), {
    text: '这里只剩一口气。还要检查能否合法提子，不能只凭气数判断。',
    hintPoints: [{ x: 1, y: 1, label: 'B8' }],
  });
});

test('an unsupported question explicitly reports missing evidence without spending a repair request', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response('{"kind":"unavailable"}'));
  const result = await executeCoachAgent({ ...request(), question: '证明黑棋能赢几目' });
  assert.match(result.text, /还无法确认/);
  assert.deepEqual(result.hintPoints, []);
  assert.equal(result.error, undefined);
  assert.equal(fetch.mock.callCount(), 1);
});

test('a specific question receives the last three turns with earlier-position labels and no local identities or secrets', async t => {
  const input = request();
  const key = coachPositionKey(input.position, 'black', 3.5);
  const secret = 'private-conversation-key';
  const history = Array.from({ length: 8 }, (_, index) => ({
    positionKey: index === 7 ? key : `old-private-position-${index}`,
    question: `问题 ${index} ${secret}`, answer: `回答 ${index} ${secret}`,
  }));
  const original = structuredClone(history);
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = String(init?.body);
    const sent = JSON.parse(body).evidence;
    assert.equal(sent.conversation.length, 3);
    assert.match(sent.conversation[0].question, /问题 5/);
    assert.deepEqual(sent.conversation.map((turn: { position: string }) => turn.position),
      ['earlier', 'earlier', 'current']);
    assert.doesNotMatch(body, /private-conversation-key|old-private-position|positionKey/);
    return response('{"kind":"explain","text":"数气要看整块棋相邻的空点，斜对角不算相邻。","refs":["concept.liberties"]}');
  });
  const result = await executeCoachAgent({ ...input, config: { ...config, apiKey: secret }, history, question: '刚才说的气怎么算？' });
  assert.equal(result.source, 'cloud');
  assert.deepEqual(history, original);
});

test('conversation sanitization excludes malformed entries and bounds user-controlled text', () => {
  assert.deepEqual(sanitizeCoachHistory(null), []);
  assert.deepEqual(sanitizeCoachHistory([{ positionKey: 'p', question: '', answer: 'answer' }, null,
    { positionKey: 4, question: 'question', answer: 'answer' }]), []);
  const [turn] = sanitizeCoachHistory([{ positionKey: 'p', question: '\u0000' + '问'.repeat(1000),
    answer: '\u0001' + '答'.repeat(2000) }]);
  assert.equal(turn.question.length, 500);
  assert.equal(turn.answer.length, 1200);
  assert.doesNotMatch(turn.question + turn.answer, /[\u0000\u0001]/);
});

test('course questions reuse authored definitions without forwarding exercise solutions as board facts', async t => {
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = String(init?.body);
    const sent = JSON.parse(body).evidence;
    assert.equal(sent.teachingChoices.find((choice: { id: string }) => choice.id === 'course.go.rules.place-turn').kind,
      'course-concept', 'authored course definitions stay labelled separately from current board facts');
    assert.doesNotMatch(body, /correctChoiceId|"exercises"|"solution"|"demonstration"|board-1/);
    return response('{"kind":"explain","parts":[{"id":"course.go.rules.place-turn","variant":1}]}');
  });
  const result = await executeCoachAgent({ ...request(), question: '能把自己的棋子挪到旁边吗？' });
  assert.equal(result.source, 'cloud');
  assert.match(result.text, /交叉点/);
  assert.match(result.text, /不能挪动/);
  assert.deepEqual(result.hintPoints, []);
});

test('a full-size board with many quiet groups still fits the bounded teaching request', async t => {
  const input = request();
  input.position = createInitialPosition(19);
  for (let y = 0; y < 19; y += 2) for (let x = 0; x < 19; x += 2) {
    input.position.board[y][x] = { color: (x + y) % 4 === 0 ? 'black' : 'white', x, y, id: `${x}-${y}` };
  }
  const fetch = t.mock.method(globalThis, 'fetch', async () => response(
    '{"kind":"explain","parts":[{"id":"group.A19","variant":0}]}'));
  const history = Array.from({ length: 6 }, () => ({ positionKey: 'earlier-board',
    question: '问'.repeat(500), answer: '答'.repeat(1200) }));
  const result = await executeCoachAgent({ ...input, history, question: '角上的 A19 有几口气？' });
  assert.equal(fetch.mock.callCount(), 1);
  assert.equal(result.source, 'cloud');
  assert.match(result.text, /这里.*黑棋.*2口气/);
  assert.deepEqual(result.hintPoints, [{ x: 0, y: 0, label: 'A19' }]);
  assert.equal(result.error, undefined);
});

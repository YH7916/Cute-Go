import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCoachAgent } from '../agent/coach/runtime';
import type { CoachAgentInput } from '../agent/coach/contract';
import { attemptMove } from '../core/go/rules';
import { createInitialPosition, recordMove, recordPass } from '../domains/game/positionState';
import { coachPositionKey } from '../domains/coach/evidence';

const config = { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-private-key' };
function input(kind: CoachAgentInput['kind'] = 'inspect'): CoachAgentInput {
  const first = createInitialPosition(9);
  const move = attemptMove(first.board, 0, 4, 'black', 'Go', null);
  assert.ok(move);
  return { kind, position: recordMove(first, move.newBoard, { x: 0, y: 4 }, move.captured, false),
    userColor: 'white', intent: 'explain-last-move', config };
}
const response = () => new Response(JSON.stringify({ choices: [{ message: {
  content: JSON.stringify({ kind: 'explain', parts: [{ id: 'current', variant: 0 }] }),
}, finish_reason: 'stop' }] }));

test('agent inspection computes local facts without network and leaves the full position unchanged', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => response());
  const request = input();
  const original = structuredClone(request);
  const result = await executeCoachAgent(request);
  assert.equal(result.source, 'local');
  assert.equal(result.configured, true);
  assert.equal(result.moveNumber, 1);
  assert.match(result.text, /边线外没有气.*出口/);
  assert.doesNotMatch(result.text, /全局第|左起第|上起第/);
  assert.deepEqual(result.hintPoints, []);
  assert.equal(fetch.mock.callCount(), 0);
  assert.deepEqual(request, original);
});

test('agent ask rebuilds evidence and intent prompt, omitting history identity and private configuration', async t => {
  const bodies: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body));
    return response();
  });
  for (const intent of ['hint', 'explain-last-move'] as const) {
    const result = await executeCoachAgent({ ...input('ask'), intent });
    assert.equal(result.source, 'cloud');
    assert.match(result.text, intent === 'hint' ? /空旷角部/ : /边线外没有气.*出口/);
  }
  const hint = JSON.parse(bodies[0]);
  const explain = JSON.parse(bodies[1]);
  assert.match(hint.messages[1].content, /观察的重点.*说明为什么/);
  assert.match(explain.messages[1].content, /上一手.*说清为什么.*观察什么/);
  assert.match(explain.messages[1].content, /"location":"左边线正中/);
  const guide = JSON.parse(explain.messages[1].content.split('\n')[1]).boardGuide;
  assert.deepEqual(guide, { lastMove: { marker: 'red-dot', point: { x: 0, y: 4, label: 'A5' } }, markers: [] });
  assert.deepEqual(explain.thinking, { type: 'disabled' });
  for (const body of bodies) {
    assert.ok(!body.includes('positionKey'));
    assert.ok(!body.includes(config.apiKey));
    assert.ok(!body.includes('"history"'));
  }
});

test('missing credentials and provider errors preserve local explanations', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response('do not expose this body', { status: 401 }));
  const noKey = await executeCoachAgent({ ...input('ask'), config: { ...config, apiKey: '' } });
  assert.equal(noKey.configured, false);
  assert.equal(noKey.source, 'local');
  assert.equal(noKey.error, undefined);
  assert.equal(fetch.mock.callCount(), 0);
  const failed = await executeCoachAgent(input('ask'));
  assert.equal(failed.source, 'local');
  assert.match(failed.error ?? '', /未授权/);
  assert.match(failed.text, /边线外没有气.*出口/);
  assert.ok(!JSON.stringify(failed).includes('do not expose'));
});

test('pass and legal hint candidates use the shared rules for the requested player', async () => {
  const request = input();
  request.position = recordPass(request.position);
  const passed = await executeCoachAgent(request);
  assert.match(passed.text, /停.*不等于认输.*连续停着/);
  const position = createInitialPosition(9);
  position.board[1][1] = { color: 'black', x: 1, y: 1, id: 'black' };
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) position.board[y][x] = { color: 'white', x, y, id: `${x}-${y}` };
  const hint = await executeCoachAgent({ ...request, position, intent: 'hint', userColor: 'black' });
  assert.match(hint.text, /你的棋.*解除打吃/);
  assert.doesNotMatch(hint.text, /轮到/);
  assert.deepEqual(hint.hintPoints, [{ x: 1, y: 2, label: 'B7' }]);
});

test('agent cancellation rejects instead of publishing fallback or late cloud text', async t => {
  const controller = new AbortController();
  let finish!: (value: Response) => void;
  let providerSignal: AbortSignal | null | undefined;
  t.mock.method(globalThis, 'fetch', (_url: unknown, init?: RequestInit) => {
    providerSignal = init?.signal;
    return new Promise<Response>(resolve => { finish = resolve; });
  });
  const task = executeCoachAgent(input('ask'), controller.signal);
  controller.abort();
  await assert.rejects(task, { name: 'AbortError' });
  assert.equal(providerSignal?.aborted, true);
  finish(response());
  await assert.rejects(executeCoachAgent(input(), controller.signal), { name: 'AbortError' });
});

test('agent forwards only bounded engine estimates and currently legal candidates as labelled hints', async t => {
  let requestBody = '';
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    requestBody = String(init?.body); return response();
  });
  const request = { ...input('ask'), intent: 'hint' as const };
  const key = coachPositionKey(request.position, request.position.currentPlayer, 3.5);
  const engine = { positionKey: key, source: 'local-katago' as const, perspective: 'black' as const,
    visits: 8, winRateBlack: 62, estimatedBlackLead: -2.5,
    candidates: [{ point: { x: 0, y: 4 }, visits: 8 }, { point: { x: 3, y: 3 }, visits: 5 },
      { point: { x: 3, y: 3 }, visits: 4 }, { point: { x: 99, y: 0 }, visits: 3 },
      { point: { x: 4, y: 4 }, visits: 2 }, { point: { x: 1, y: 1 }, visits: 0 }],
    ownership: Array(81).fill(1), secret: 'not part of the contract' };
  const result = await executeCoachAgent({ ...request, engineEvidence: engine });
  assert.deepEqual(result.hintPoints, [{ x: 3, y: 3, label: 'D6' }], 'only the explained candidate is circled');
  assert.match(result.text, /圈出的这里/);
  assert.doesNotMatch(result.text, /[①②③]|D6/);
  const body = JSON.parse(requestBody);
  assert.match(body.messages[1].content, /"engineAnalysis"/);
  assert.match(body.messages[1].content, /"winRateBlack":62/);
  assert.match(body.messages[1].content, /"estimatedBlackLead":-2.5/);
  assert.match(body.messages[1].content, /"label":"D6"/);
  const sentEvidence = JSON.parse(body.messages[1].content.split('\n')[1]);
  assert.deepEqual(sentEvidence.boardGuide.markers, [{ number: null, point: { x: 3, y: 3, label: 'D6' } }]);
  assert.deepEqual(sentEvidence.engineAnalysis.candidates.map((candidate: { point: { label: string } }) => candidate.point.label),
    ['D6', 'E5', 'B8'], 'the complete verified engine evidence remains available without drawing unmentioned points');
  assert.ok(!requestBody.includes('ownership'));
  assert.ok(!requestBody.includes('not part of the contract'));
  assert.ok(!requestBody.includes('positionKey'));
  assert.ok(!requestBody.includes('99'));
});

test('stale or malformed engine evidence is omitted while rule-only teaching still works', async t => {
  const bodies: string[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    bodies.push(String(init?.body)); return response();
  });
  const request = input('ask');
  for (const fields of [{ positionKey: 'old-position', visits: 8 },
    { positionKey: coachPositionKey(request.position, request.position.currentPlayer, 3.5), visits: NaN }]) {
    const answer = await executeCoachAgent({ ...request, engineEvidence: {
      ...fields, source: 'local-katago', perspective: 'black', winRateBlack: Infinity,
      estimatedBlackLead: NaN, candidates: [{ point: { x: 3, y: 3 }, visits: 8 }],
    } });
    assert.equal(answer.source, 'cloud');
    assert.deepEqual(answer.hintPoints, []);
  }
  assert.ok(bodies.every(body => !body.includes('engineAnalysis')));
});

test('engine hints recheck ko against the full position history before showing a marker', async () => {
  const before = createInitialPosition(9);
  for (const [x, y] of [[0, 1], [1, 0], [1, 2]]) before.board[y][x] = { color: 'black', x, y, id: `b-${x}-${y}` };
  for (const [x, y] of [[1, 1], [2, 0], [3, 1], [2, 2]]) before.board[y][x] = { color: 'white', x, y, id: `w-${x}-${y}` };
  const moved = attemptMove(before.board, 2, 1, 'black', 'Go', null);
  assert.ok(moved);
  const position = recordMove(before, moved.newBoard, { x: 2, y: 1 }, moved.captured, false);
  assert.ok(attemptMove(position.board, 1, 1, 'white'), 'without history this recapture appears playable');
  const result = await executeCoachAgent({ ...input(), position, intent: 'hint', engineEvidence: {
    positionKey: coachPositionKey(position, position.currentPlayer, 3.5), source: 'local-katago', perspective: 'black', visits: 8,
    candidates: [{ point: { x: 1, y: 1 }, visits: 6 }, { point: { x: 4, y: 4 }, visits: 1 }],
  } });
  assert.deepEqual(result.hintPoints, [{ x: 3, y: 0, label: 'D9' }],
    'the verified escape elsewhere takes priority over an unexplained engine point');
  assert.ok(result.hintPoints.every(point => point.x !== 1 || point.y !== 1), 'immediate ko recapture remains excluded');
  assert.match(result.text, /圈出的这里.*解除打吃/);
  assert.doesNotMatch(result.text, /立即提回|已经安全|最佳/);
});

for (const tactic of ['escape', 'capture'] as const) {
  test(`engine candidate gets a ${tactic} explanation only when the rule evidence verifies the same point`, async () => {
    const position = createInitialPosition(9);
    const surrounded = tactic === 'escape' ? 'black' : 'white';
    const surrounding = tactic === 'escape' ? 'white' : 'black';
    position.board[1][1] = { color: surrounded, x: 1, y: 1, id: 'target' };
    for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) position.board[y][x] = { color: surrounding, x, y, id: `${x}-${y}` };
    const result = await executeCoachAgent({ ...input(), position, userColor: 'black', intent: 'hint', engineEvidence: {
      positionKey: coachPositionKey(position, 'black', 3.5), source: 'local-katago', perspective: 'black', visits: 8,
      candidates: [{ point: { x: 1, y: 2 }, visits: 8 }],
    } });
    assert.deepEqual(result.hintPoints, [{ x: 1, y: 2, label: 'B7' }]);
    assert.match(result.text, tactic === 'escape' ? /圈出的这里.*多出出口.*解除打吃/ : /圈出的这里.*最后一口气/);
    assert.doesNotMatch(result.text, /最佳|已经安全|全局第/);
  });
}

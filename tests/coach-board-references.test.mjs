import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { executeCoachAgent, createInitialPosition, coachPositionKey, buildCoachEvidence,
  renderCoachResponse, CoachMarkers, createElement, renderToStaticMarkup } = await loadTestModule({
  contents: `export { executeCoachAgent } from './agent/coach/runtime';
    export { createInitialPosition } from './domains/game/positionState';
    export { coachPositionKey, buildCoachEvidence } from './domains/coach/evidence';
    export { renderCoachResponse } from './domains/coach/response';
    export { CoachMarkers } from './components/board/CoachMarkers';
    export { createElement } from 'react';
    export { renderToStaticMarkup } from 'react-dom/server';`,
});
const offline = { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' };
const configured = { endpoint: 'http://localhost:1234/v1', provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-model-key' };
const input = position => ({ kind: 'inspect', position, userColor: 'black', intent: 'hint', config: offline });
function put(position, color, x, y) {
  position.board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
}
function threatenedGroups() {
  const position = createInitialPosition(9);
  for (const [x, y] of [[1, 1], [5, 1], [1, 5]]) {
    put(position, 'black', x, y);
    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0]]) put(position, 'white', x + dx, y + dy);
  }
  return position;
}
function markup(points, boardSize = 9, board = createInitialPosition(boardSize).board) {
  return renderToStaticMarkup(createElement('svg', null, createElement(CoachMarkers, { points, board })));
}
const numbers = svg => [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(match => match[1]);
function singleReference(reply, point) {
  assert.deepEqual(reply.hintPoints, [point]);
  assert.match(reply.text, /这里/);
  assert.doesNotMatch(reply.text, /圈出的这里|[A-HJ-T]\d{1,2}|[①②③]/);
  const svg = markup(reply.hintPoints);
  assert.deepEqual(numbers(svg), [], 'one referenced point needs a ring, not an artificial first step');
  assert.match(svg, /<circle\b/, 'the textual reference must have an actual board marker');
}

test('a local hint circles only its explained rescue even when three legal candidates exist', async () => {
  const position = threatenedGroups();
  assert.equal(buildCoachEvidence(position, 'black', 3.5).candidates.length, 3);
  const reply = await executeCoachAgent(input(position));
  singleReference(reply, { x: 1, y: 2, label: 'B7' });
  assert.match(reply.text, /解除打吃/);
});

test('one illegal point and one engine suggestion each use a visible unnumbered ring', async () => {
  const position = createInitialPosition(9);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) put(position, 'white', x, y);
  const illegal = await executeCoachAgent({ ...input(position), intent: 'explain-illegal-move', attemptedPoint: { x: 1, y: 1 } });
  singleReference(illegal, { x: 1, y: 1, label: 'B8' });
  assert.match(illegal.text, /没有气.*不能下/);
  const empty = createInitialPosition(9);
  const engine = await executeCoachAgent({ ...input(empty), engineEvidence: {
    positionKey: coachPositionKey(empty, 'black', 3.5), source: 'local-katago', perspective: 'black', visits: 8,
    candidates: [{ point: { x: 2, y: 2 }, visits: 6 }, { point: { x: 6, y: 6 }, visits: 2 }],
  } });
  singleReference(engine, { x: 2, y: 2, label: 'C7' });
});

test('a group with two liberties naturally gets three ordered board references', async () => {
  const position = createInitialPosition(9);
  put(position, 'black', 1, 1);
  put(position, 'white', 0, 1);
  put(position, 'white', 1, 0);
  const reply = await executeCoachAgent(input(position));
  assert.match(reply.text, /①.*2口气.*②.*③/);
  assert.doesNotMatch(reply.text, /[A-HJ-T]\d{1,2}/);
  assert.equal(reply.hintPoints.length, 3);
  assert.deepEqual(reply.hintPoints[0], { x: 1, y: 1, label: 'B8' });
  assert.deepEqual(new Set(reply.hintPoints.slice(1).map(point => point.label)), new Set(['C8', 'B7']));
  const svg = markup(reply.hintPoints, 9, position.board);
  assert.deepEqual(numbers(svg), ['1', '2', '3']);
  assert.match(svg, /fill="(?:none|transparent)"/, 'a circle on a group must not paint over its stone color');
});

test('cloud choices are renumbered by final prose order and repeated points keep the same reference', async t => {
  const response = JSON.stringify({ kind: 'explain', parts: [
    { id: 'candidate.F7', variant: 0 }, { id: 'current', variant: 0 }, { id: 'candidate.B7', variant: 0 },
  ] });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ text: response })));
  const reply = await executeCoachAgent({ ...input(threatenedGroups()), kind: 'ask', config: configured,
    question: '比较 F7 和 B7 的解围办法，再说明当前提示为何优先 B7。' });
  assert.equal(reply.source, 'cloud');
  assert.deepEqual(reply.hintPoints, [{ x: 5, y: 2, label: 'F7' }, { x: 1, y: 2, label: 'B7' }]);
  assert.deepEqual(reply.text.match(/[①②③]/g), ['①', '②', '②']);
  assert.doesNotMatch(reply.text, /[A-HJ-T]\d{1,2}/);
  assert.deepEqual(numbers(markup(reply.hintPoints)), ['1', '2']);
});

test('more than three distinct references reject a legacy selection instead of orphaning its text', () => {
  const choices = [{ id: 'many', kind: 'position', variants: ['先看 A1、B2、C3，再比较 D4。'] }];
  const selected = JSON.stringify({ kind: 'explain', parts: [{ id: 'many', variant: 0 }] });
  assert.equal(renderCoachResponse(selected, choices, false, 9), null);
});

test('a four-point cloud combination preserves the complete local three-point explanation', async t => {
  const position = createInitialPosition(9);
  put(position, 'black', 1, 1);
  put(position, 'white', 0, 1);
  put(position, 'white', 1, 0);
  const response = JSON.stringify({ kind: 'explain', parts: [
    { id: 'current', variant: 0 }, { id: 'group.A8', variant: 0 },
  ] });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ text: response })));
  const local = await executeCoachAgent(input(position));
  const reply = await executeCoachAgent({ ...input(position), kind: 'ask', config: configured,
    question: 'B8 这块有哪些出口？再看看 A8 白棋有几口气。' });
  assert.equal(reply.source, 'local');
  assert.equal(reply.error, undefined);
  assert.equal(reply.cacheable, false);
  assert.equal(reply.text, local.text);
  assert.deepEqual(reply.hintPoints, local.hintPoints);
  assert.equal(reply.hintPoints.length, 3);
  assert.ok(reply.hintPoints.every(point => point.label !== 'A8'));
});

test('repeated full-size coordinates use one stable point and never expose coordinate jargon', () => {
  const choices = [{ id: 'repeat', kind: 'position', variants: ['先看 J19，再回到 J19。'] }];
  const reply = renderCoachResponse(JSON.stringify({ kind: 'explain', parts: [{ id: 'repeat', variant: 0 }] }), choices, false, 19);
  assert.deepEqual(reply, { kind: 'explain', text: '先看这里，再回到这里。',
    hintPoints: [{ x: 8, y: 0, label: 'J19' }] });
  assert.deepEqual(numbers(markup(reply.hintPoints, 19)), []);
});

test('synthesized coordinates bind the same rings across case and full-width variants', () => {
  const choices = [{ id: 'points', kind: 'position', variants: ['先观察D4，再比较E4。'] }];
  for (const text of ['先观察d4，再比较e4和D4。', '先观察Ｄ４，再比较ｅ４和ｄ４。']) {
    const reply = renderCoachResponse(JSON.stringify({ kind: 'explain', text, refs: ['points'] }), choices, false, 9);
    assert.deepEqual(reply, { kind: 'explain', text: '先观察①，再比较②和①。',
      hintPoints: [{ x: 3, y: 5, label: 'D4' }, { x: 4, y: 5, label: 'E4' }] });
    assert.deepEqual(numbers(markup(reply.hintPoints)), ['1', '2']);
  }
});

test('unbound here and model-written circle numbers never appear without verified board marks', () => {
  const choices = [{ id: 'point', kind: 'position', variants: ['可以观察D4。'] }];
  for (const text of ['可以观察这里。', '可以观察此处。', '可以观察①。', '可以观察④。', '可以观察❶。']) {
    assert.equal(renderCoachResponse(JSON.stringify({ kind: 'explain', text, refs: ['point'] }), choices, false, 9), null, text);
  }
});

test('coordinate normalization accepts legal model points and rejects invalid or off-board points', () => {
  const choices = [{ id: 'point', kind: 'position', variants: ['D4有4口气。'], coordinates: ['T19'] }];
  for (const point of ['a4', 'ａ４']) {
    assert.deepEqual(renderCoachResponse(JSON.stringify({ kind: 'explain', text: `观察${point}。`, refs: ['point'] }), choices, false, 9),
      { kind: 'explain', text: '观察这里。', hintPoints: [{ x: 0, y: 5, label: 'A4' }] });
  }
  for (const point of ['ｉ４', 'd04', 'd0', 'd40', 'ｔ１９']) {
    assert.equal(renderCoachResponse(JSON.stringify({ kind: 'explain', text: `观察${point}。`, refs: ['point'] }), choices, false, 9), null, point);
  }
});

test('empty-point numbers sit in their rings while stone numbers use the stone surface directly', () => {
  const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
  for (const size of [9, 13, 19]) {
    const svg = markup(points, size);
    const ringLayers = [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="[\d.]+" fill="none"/g)];
    // A marker's outline and main ring share one intersection.
    const rings = [...new Map(ringLayers.map(ring => [`${ring[1]},${ring[2]}`, ring])).values()];
    const labels = [...svg.matchAll(/<text x="([\d.]+)" y="([\d.]+)"[^>]*>([^<]*)<\/text>/g)];
    assert.equal(rings.length, 3);
    assert.equal(labels.length, 3);
    for (let index = 0; index < rings.length; index++) {
      assert.equal(labels[index][1], rings[index][1]);
      assert.equal(labels[index][2], rings[index][2]);
      assert.equal(labels[index][3], String(index + 1));
    }
    const position = createInitialPosition(size);
    put(position, 'black', 0, 0); put(position, 'white', 1, 0);
    const stoneSvg = markup(points.slice(0, 2), size, position.board);
    assert.deepEqual(numbers(stoneSvg), ['1', '2']);
    assert.doesNotMatch(stoneSvg, /<circle/, 'numbered stones have no separate circular badge or background');
  }
});

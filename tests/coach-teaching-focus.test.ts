import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCoachAgent } from '../agent/coach/runtime';
import { coachPositionKey } from '../domains/coach/evidence';
import { createInitialPosition, recordMove } from '../domains/game/positionState';
import { attemptMove } from '../core/go/rules';
import type { Player } from '../types';

const config = { endpoint: 'https://coach.example/v1', model: 'coach', apiKey: 'test-key' };
const response = (text: string) => new Response(JSON.stringify({ choices: [
  { message: { content: text }, finish_reason: 'stop' },
] }));

function newDanger(userColor: Player) {
  const position = createInitialPosition(9);
  position.currentPlayer = userColor === 'black' ? 'white' : 'black';
  position.board[1][1] = { x: 1, y: 1, color: userColor, id: 'learner' };
  for (const [x, y] of [[0, 1], [1, 0]]) {
    position.board[y][x] = { x, y, color: position.currentPlayer, id: `${x}-${y}` };
  }
  const result = attemptMove(position.board, 2, 1, position.currentPlayer);
  assert.ok(result);
  return recordMove(position, result.newBoard, { x: 2, y: 1 }, result.captured, false);
}

for (const userColor of ['black', 'white'] as const) {
  test(`${userColor}: automatic cloud commentary can decline repetition without showing its control marker`, async t => {
    let content = '';
    t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
      content = String(init?.body); return response('[SILENT]');
    });
    const position = newDanger(userColor);
    const original = structuredClone(position);
    const result = await executeCoachAgent({ kind: 'ask', proactive: true,
      position, userColor, intent: 'explain-last-move', config });
    assert.equal(result.text, '');
    assert.deepEqual(result.hintPoints, []);
    assert.equal(result.shouldAutoExplain, false);
    assert.equal(result.source, 'cloud');
    const request = JSON.parse(content);
    const evidence = JSON.parse(request.messages[1].content.split('\n')[1]);
    assert.deepEqual(evidence.teachingRequest, { proactive: true, intent: 'explain-last-move' });
    assert.deepEqual(position, original);
  });
}

test('a manual question still receives local teaching when a provider incorrectly returns the silence marker', async t => {
  t.mock.method(globalThis, 'fetch', async () => response('[SILENT]'));
  const result = await executeCoachAgent({ kind: 'ask', position: newDanger('black'), userColor: 'black',
    intent: 'explain-last-move', question: '我该注意什么？', config });
  assert.ok(result.text.length > 0);
  assert.doesNotMatch(result.text, /SILENT/);
  assert.match(result.text, /只剩一口气/);
  assert.equal(result.source, 'local');
});

test('a malformed silence marker falls back to teaching instead of leaking internal control text', async t => {
  for (const proactive of [true, false]) {
    for (const text of ['```text\n[SILENT]\n```', '[silent] 这一手无需补充']) {
      const fetch = t.mock.method(globalThis, 'fetch', async () => response(text));
      const result = await executeCoachAgent({ kind: 'ask', proactive,
        position: newDanger('black'), userColor: 'black', intent: 'explain-last-move', config });
      assert.ok(result.text.length > 0);
      assert.doesNotMatch(result.text, /silent/i);
      assert.equal(result.source, 'local');
      fetch.mock.restore();
    }
  }
});

test('a concrete escape stays the teaching hint when the engine suggests an unrelated point', async () => {
  const position = newDanger('black');
  const result = await executeCoachAgent({ kind: 'inspect', position, userColor: 'black', intent: 'hint', config,
    engineEvidence: { source: 'local-katago', perspective: 'black', visits: 8,
      positionKey: coachPositionKey(position, position.currentPlayer, 3.5),
      candidates: [{ point: { x: 6, y: 6 }, visits: 8 }] } });
  assert.deepEqual(result.hintPoints, [{ x: 1, y: 2, label: 'B7' }]);
  assert.match(result.text, /圈出的这里/);
  assert.doesNotMatch(result.text, /多一个出口？/);
  assert.ok(result.text.length <= 80);
});

test('manual quiet-move teaching does not force a diagonal lesson without a diagonal friendly stone', async () => {
  for (const diagonal of [false, true]) {
    const before = createInitialPosition(9);
    if (diagonal) before.board[3][3] = { color: 'black', x: 3, y: 3, id: 'diagonal' };
    const moved = attemptMove(before.board, 4, 4, 'black');
    assert.ok(moved);
    const position = recordMove(before, moved.newBoard, { x: 4, y: 4 }, moved.captured, false);
    const result = await executeCoachAgent({ kind: 'inspect', position,
      userColor: 'black', intent: 'explain-last-move', config });
    if (diagonal) assert.match(result.text, /斜对角.*不算连接/);
    else {
      assert.ok(result.text.length > 0 && result.text.length <= 30);
      assert.doesNotMatch(result.text, /斜对角|数气|切断/);
    }
  }
});

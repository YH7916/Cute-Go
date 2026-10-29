import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCoachAgent } from '../agent/coach/runtime';
import type { CoachAgentInput } from '../agent/coach/contract';
import { createInitialPosition } from '../domains/game/positionState';

function request(intent: CoachAgentInput['intent']): CoachAgentInput {
  const position = createInitialPosition(9);
  position.board[1][1] = { color: 'black', x: 1, y: 1, id: 'endangered' };
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) {
    position.board[y][x] = { color: 'white', x, y, id: `surround-${x}-${y}` };
  }
  return { kind: 'ask', intent, position, userColor: 'black',
    config: { endpoint: 'http://localhost:1234/v1', provider: 'deepseek' as const, model: 'deepseek-flash', apiKey: 'test-model-key' } };
}

for (const intent of ['hint', 'explain-position'] as const) {
  test(`${intent}: invalid cloud content silently retains verified local text and board marks without caching or repair`, async t => {
    const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
      text: JSON.stringify({ kind: 'explain', text: 'A1的黑棋有99口气。', refs: ['missing-evidence'] }),
    })));
    const input = request(intent);
    const before = structuredClone(input.position);
    const preview = await executeCoachAgent({ ...input, kind: 'inspect' });
    assert.equal(fetch.mock.callCount(), 0);
    assert.ok(preview.text.length > 0);
    assert.deepEqual(preview.hintPoints, intent === 'hint'
      ? [{ x: 1, y: 2, label: 'B7' }] : [{ x: 1, y: 1, label: 'B8' }, { x: 1, y: 2, label: 'B7' }]);

    const fallback = await executeCoachAgent(input);
    assert.equal(fallback.source, 'local');
    assert.equal(fallback.text, preview.text);
    assert.deepEqual(fallback.hintPoints, preview.hintPoints);
    assert.equal(fallback.error, undefined, 'rejected content must not add a user-facing validation warning');
    assert.equal(fallback.cacheable, false, 'the caller must be able to request a fresh explanation manually');
    assert.equal(fallback.configured, true);
    assert.deepEqual(input.position, before);
    assert.equal(fetch.mock.callCount(), 1, 'validation rejection must not start a second paid repair request');
  });
}

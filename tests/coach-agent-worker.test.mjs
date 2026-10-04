import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { bundleTestSource } from './helpers/loadTestModule.mjs';

const source = await bundleTestSource({ entryPoint: 'agent/coach/worker.ts', format: 'iife', platform: 'browser' });
function worker() {
  const replies = [];
  let calls = 0;
  const scope = {
    postMessage: message => replies.push(structuredClone(message)),
    fetch: async () => { calls += 1; return new Response(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify({ kind: 'explain', parts: [{ id: 'concept.liberties', variant: 1 }] }),
    }, finish_reason: 'stop' }] })); },
    AbortController, DOMException, URL, Response, TextDecoder, setTimeout, clearTimeout,
  };
  vm.runInNewContext(source, scope);
  return { scope, replies, calls: () => calls };
}
const input = (kind = 'inspect') => ({ kind, position: {
  board: Array.from({ length: 9 }, () => Array(9).fill(null)), currentPlayer: 'black',
  blackCaptures: 0, whiteCaptures: 0, lastMove: null, consecutivePasses: 0, history: [],
}, userColor: 'white', intent: 'hint', config: { endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', apiKey: 'test-private-key' } });

test('actual teaching worker entry announces ready, computes local facts and ignores duplicate dispatch', async () => {
  const host = worker();
  assert.deepEqual(host.replies, [{ type: 'ready' }]);
  await host.scope.onmessage({ data: { type: 'run', requestId: 7, input: input() } });
  await host.scope.onmessage({ data: { type: 'run', requestId: 8, input: input('ask') } });
  assert.equal(host.replies.length, 2);
  assert.equal(host.replies[1].requestId, 7);
  assert.equal(host.replies[1].result.source, 'local');
  assert.ok(host.replies[1].result.text.length > 0 && host.replies[1].result.text.length <= 80);
  assert.match(host.replies[1].result.text, /等对手/);
  assert.doesNotMatch(host.replies[1].result.text, /轮到黑棋|自己最容易被切断的棋/);
  assert.equal(host.calls(), 0);
});

test('actual teaching worker entry uses provider client and only posts presentation results', async () => {
  const host = worker();
  await host.scope.onmessage({ data: { type: 'run', requestId: 9, input: input('ask') } });
  assert.equal(host.calls(), 1);
  assert.equal(host.replies[1].result.source, 'cloud');
  assert.equal(host.replies[1].result.text, '数气要看整块棋旁边的空点；斜对角不算相邻，重复的空点只算一次。');
  assert.ok(!JSON.stringify(host.replies).includes('test-private-key'));
  assert.ok(!JSON.stringify(host.replies).includes('positionKey'));
});

test('worker failures have a bounded nonsecret error envelope', async () => {
  const host = worker();
  await host.scope.onmessage({ data: { type: 'unrelated', requestId: 10 } });
  await host.scope.onmessage({ data: { type: 'run', requestId: 11, input: { ...input(), position: null } } });
  assert.deepEqual(host.replies, [{ type: 'ready' }, { type: 'error', requestId: 11 }]);
  assert.equal(host.calls(), 0);
});

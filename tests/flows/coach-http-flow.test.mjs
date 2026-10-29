import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { loadTestModule } from '../helpers/loadTestModule.mjs';

const { executeCoachAgent, createInitialPosition, recordMove, attemptMove } = await loadTestModule({
  contents: `
    export { executeCoachAgent } from './agent/coach/runtime';
    export { createInitialPosition, recordMove } from './domains/game/positionState';
    export { attemptMove } from './core/go/rules';
  `,
});

// Run the actual agent, JSON encoder, fetch, HTTP and response parser. Only the
// backend is a local fixture: no browser, external service or saved token is used.
test('讲解接口完整流程：真实 HTTP 成功 → 鉴权失败 → 格式错误 → 取消 → 恢复', { timeout: 15000 }, async t => {
  const requests = [];
  const serverErrors = [];
  let responseMode = 'success';
  let notifyHeld;
  const heldStarted = new Promise(resolve => { notifyHeld = resolve; });
  const server = createServer(async (request, response) => {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push({ url: request.url, method: request.method, headers: request.headers, body: JSON.parse(body) });
      if (responseMode === 'held') { notifyHeld(); return; }
      response.setHeader('Content-Type', 'application/json');
      if (responseMode === 'unauthorized') {
        response.writeHead(401).end('upstream-private-error-body');
      } else if (responseMode === 'malformed') {
        response.end('{not-json');
      } else {
        response.end(JSON.stringify({
          text: JSON.stringify({ kind: 'explain', text: '可以从空旷角部开始，借两条边围空。', refs: ['concept.opening'] }),
        }));
      }
    } catch (error) {
      serverErrors.push(String(error));
      response.writeHead(500).end();
    }
  });
  server.listen(0, '127.0.0.1');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const config = { endpoint: `http://127.0.0.1:${address.port}/api/coach`, provider: 'deepseek', model: 'deepseek-flash', apiKey: 'synthetic-flow-token' };
  let position = createInitialPosition(9);
  for (const [x, y] of [[2, 2], [6, 6]]) {
    const move = attemptMove(position.board, x, y, position.currentPlayer);
    assert.ok(move);
    position = recordMove(position, move.newBoard, { x, y }, move.captured, false);
  }
  const input = { kind: 'ask', position, config, userColor: 'black', intent: 'hint', question: '为什么可以从空旷角部开局？' };
  const originalPosition = structuredClone(position);

  await t.test('局面证据经真实 HTTP 发出，收到简洁正文', async () => {
    const result = await executeCoachAgent(input);
    assert.equal(result.source, 'cloud');
    assert.equal(result.error, undefined);
    assert.match(result.text, /角部.*两条边/);
    assert.ok(result.text.length <= 50);
    assert.equal(requests.length, 1);
    const request = requests[0];
    assert.equal(request.url, '/api/coach');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.authorization, `Bearer ${config.apiKey}`);
    assert.deepEqual(Object.keys(request.body).sort(), ['evidence', 'model', 'provider', 'question']);
    assert.equal(request.body.question, input.question);
    const evidence = request.body.evidence;
    assert.equal(evidence.boardSize, 9);
    assert.equal(evidence.moveNumber, 2);
    assert.equal(evidence.boardRows.join('').replaceAll('.', '').length, 2);
    assert.equal(evidence.boardRows[2][2], 'B');
    assert.equal(evidence.boardRows[6][6], 'W');
    assert.deepEqual(evidence.boardGuide.lastMove.point, { x: 6, y: 6, label: 'G3' });
    assert.ok(!JSON.stringify(request.body).includes(config.apiKey));
    assert.ok(!JSON.stringify(request.body).includes('positionKey'));
  });

  await t.test('服务拒绝与坏响应保留本地教学，错误不会污染棋局', async () => {
    responseMode = 'unauthorized';
    const denied = await executeCoachAgent(input);
    assert.equal(denied.source, 'local');
    assert.match(denied.error, /未授权/);
    assert.ok(denied.text.length > 0);
    assert.ok(!JSON.stringify(denied).includes('upstream-private-error-body'));
    responseMode = 'malformed';
    const malformed = await executeCoachAgent(input);
    assert.equal(malformed.source, 'local');
    assert.match(malformed.error, /格式无法识别/);
    assert.deepEqual(position, originalPosition);
  });

  await t.test('取消未完成的 HTTP 请求后，下一次讲解仍正常', async () => {
    responseMode = 'held';
    const controller = new AbortController();
    const pending = executeCoachAgent(input, controller.signal);
    const cancelled = assert.rejects(pending, { name: 'AbortError' });
    await heldStarted;
    controller.abort();
    await cancelled;
    responseMode = 'success';
    const recovered = await executeCoachAgent(input);
    assert.equal(recovered.source, 'cloud');
    assert.equal(recovered.error, undefined);
    assert.equal(recovered.moveNumber, 2);
    assert.deepEqual(position, originalPosition);
    assert.equal(requests.length, 5, 'one request per action; cancellation must not trigger a retry');
    assert.deepEqual(serverErrors, []);
  });
});

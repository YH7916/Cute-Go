import assert from 'node:assert/strict';
import test from 'node:test';
import { requestCoachReply } from '../services/coach/client';
import { normalizeCoachEndpoint, validateCoachConfig } from '../services/coach/settings';

const config = { endpoint: 'https://coach.example/api/coach', provider: 'deepseek' as const, model: 'deepseek-flash', apiKey: 'private-test-token' };
const evidence = { boardSize: 9, facts: [{ color: 'black', liberties: 2 }] };
const reply = (text = '先保护只有两口气的黑棋。') => Response.json({ text });

test('backend URLs require HTTPS except localhost and never contain embedded credentials', () => {
  assert.equal(normalizeCoachEndpoint(' https://coach.example/api/coach/ '), config.endpoint);
  for (const endpoint of ['http://localhost:8787/api/coach', 'http://127.0.0.1:8787/api/coach', 'http://[::1]:8787/api/coach']) {
    assert.doesNotThrow(() => validateCoachConfig({ ...config, endpoint }, true));
  }
  for (const endpoint of ['http://remote.example', 'https://user:secret@example.com', 'https://example.com/?key=secret', 'https://example.com/#token', 'https://example.com/?', 'file:///api', '//example.com', '/api/coach']) {
    assert.throws(() => validateCoachConfig({ ...config, endpoint }, true));
  }
  assert.throws(() => validateCoachConfig({ ...config, endpoint: '' }, true), /后台地址/);
  assert.throws(() => validateCoachConfig({ ...config, apiKey: '' }, true), /API key/);
});

test('frontend sends the chosen model and evidence only to the backend; the user key stays in Authorization', async t => {
  let request: RequestInit | undefined;
  let address: unknown;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => { address = url; request = init; return reply(); });
  assert.deepEqual(await requestCoachReply({ config, evidence, question: '现在应注意什么？' }), { text: '先保护只有两口气的黑棋。' });
  assert.equal(address, config.endpoint);
  assert.equal(request?.method, 'POST');
  assert.equal(request?.redirect, 'error');
  assert.equal(request?.credentials, 'omit');
  assert.equal(request?.cache, 'no-store');
  assert.deepEqual(request?.headers, { 'Content-Type': 'application/json', Authorization: 'Bearer private-test-token' });
  assert.deepEqual(JSON.parse(String(request?.body)), { evidence, question: '现在应注意什么？',
    provider: 'deepseek', model: 'deepseek-flash' });
  assert.ok(!String(request?.body).includes(config.apiKey));
});

test('a missing model key or backend address cannot start a request, including localhost', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => reply());
  await assert.rejects(requestCoachReply({ config: { ...config, apiKey: '' }, evidence }), /API key/);
  await assert.rejects(requestCoachReply({ config: { ...config, endpoint: 'http://localhost:8787/api/coach', apiKey: '' }, evidence }), /API key/);
  await assert.rejects(requestCoachReply({ config: { ...config, endpoint: '' }, evidence }), /后台地址/);
  assert.equal(fetch.mock.callCount(), 0);
});

test('choosing OpenAI changes only the submitted model configuration, never the backend destination', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => reply());
  await requestCoachReply({ config: { ...config, provider: 'openai', model: 'custom-model', apiKey: 'openai-user-key' }, evidence });
  const call = fetch.mock.calls[0] as unknown as { arguments: [string, RequestInit] };
  assert.equal(call.arguments[0], config.endpoint);
  assert.deepEqual(JSON.parse(String(call.arguments[1].body)), { evidence, question: '', provider: 'openai', model: 'custom-model' });
  assert.equal(new Headers(call.arguments[1].headers).get('Authorization'), 'Bearer openai-user-key');
  assert.ok(!String(call.arguments[1].body).includes('openai-user-key'));
});

test('HTTP failures expose only local messages and never read server error details', async t => {
  for (const status of [401, 403, 424, 429, 500, 502]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(`server leaked ${config.apiKey}`, { status }));
    await assert.rejects(requestCoachReply({ config, evidence }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(config.apiKey));
      assert.ok(!error.message.includes('server leaked'));
      if (status === 424 || status === 502) assert.equal(error.message, '模型服务暂不可用，请检查模型、API key 和额度后重试。');
      return true;
    });
  }
});

test('network errors explain browser CORS and arbitrary errors cannot leak a key', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError(`secret: ${config.apiKey}`); });
  await assert.rejects(requestCoachReply({ config, evidence }), /CORS/);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error(`服务 leaked ${config.apiKey}`); });
  await assert.rejects(requestCoachReply({ config, evidence }), error => error instanceof Error && error.message === '讲解请求失败，请检查服务配置后重试。');
});

test('malformed response bodies are rejected, bounded and never rendered as error text', async t => {
  for (const payload of [null, [], {}, { choices: [] }, { choices: [{ message: { content: null } }] }, { choices: [{ message: { content: ' ' } }] }, { choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(payload)));
    await assert.rejects(requestCoachReply({ config, evidence }));
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>private-test-key</html>'));
  await assert.rejects(requestCoachReply({ config, evidence }), /格式/);
  t.mock.method(globalThis, 'fetch', async () => reply('字'.repeat(70000)));
  await assert.rejects(requestCoachReply({ config, evidence }), /响应过大/);
  t.mock.method(globalThis, 'fetch', async () => reply(`echo ${config.apiKey}`));
  assert.equal((await requestCoachReply({ config, evidence })).text, 'echo [密钥已隐藏]');
  t.mock.method(globalThis, 'fetch', async () => reply('棋'.repeat(1500)));
  assert.equal((await requestCoachReply({ config, evidence })).text, '棋'.repeat(1500), 'complete bounded responses must not be silently cut mid-answer');
});

test('caller cancellation settles even when a service does not settle its fetch promise', async t => {
  let requestSignal: AbortSignal | null | undefined;
  const fetch = t.mock.method(globalThis, 'fetch', (_url: unknown, init?: RequestInit) => {
    requestSignal = init?.signal;
    return new Promise<Response>(() => {});
  });
  const controller = new AbortController();
  const pending = requestCoachReply({ config, evidence, signal: controller.signal });
  const assertion = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await assertion;
  assert.equal(requestSignal?.aborted, true);
  await assert.rejects(requestCoachReply({ config, evidence, signal: controller.signal }), { name: 'AbortError' });
  assert.equal(fetch.mock.callCount(), 1);
});

test('30 second timeout covers fetch and cancels pending response readers', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let canceled = false;
  const stream = new ReadableStream<Uint8Array>({ cancel() { canceled = true; } });
  t.mock.method(globalThis, 'fetch', async () => new Response(stream));
  const pending = requestCoachReply({ config, evidence });
  const assertion = assert.rejects(pending, /30 秒/);
  await Promise.resolve();
  t.mock.timers.tick(30000);
  await assertion;
  assert.equal(canceled, true);
});

test('invalid, cyclic and oversized evidence is rejected before sending', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => reply());
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  for (const data of [cyclic, new Date(), { invalid: NaN }, { invalid: undefined }, { text: '字'.repeat(50001) }]) {
    await assert.rejects(requestCoachReply({ config, evidence: data }), /局面数据/);
  }
  await assert.rejects(requestCoachReply({ config, evidence, question: '字'.repeat(501) }), /500/);
  assert.equal(fetch.mock.callCount(), 0);
});

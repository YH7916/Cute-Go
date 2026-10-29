import assert from 'node:assert/strict';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { createCoachHttpServer } = await loadTestModule({ entryPoint: 'server/coach/http.ts' });
const { readCoachServerConfig } = await loadTestModule({ entryPoint: 'server/coach/main.ts', plugins: [{
  name: 'configuration-only-runtime', setup(build) {
    build.onResolve({ filter: /^\.\/runtime$/ }, () => ({ path: 'configuration-only-runtime', namespace: 'test-runtime' }));
    build.onLoad({ filter: /.*/, namespace: 'test-runtime' }, () => ({ contents: 'export const createPiCoachRunner = () => { throw new Error("Unexpected runner startup"); };', loader: 'js' }));
  },
}] });

const userKey = 'synthetic-user-model-key';
const input = { evidence: { boardSize: 9, boardRows: ['.........'] }, question: '应该观察哪里？', provider: 'deepseek', model: 'deepseek-flash' };
const post = (url, body = input, headers = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey}`, ...headers }, body: JSON.stringify(body) });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function listen(t, options) {
  const server = createCoachHttpServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  return `http://127.0.0.1:${server.address().port}/api/coach`;
}

function rawPost(url, chunks, headers = {}, end = true) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey}`, ...headers } }, response => {
      let body = '';
      response.setEncoding('utf8'); response.on('data', chunk => { body += chunk; });
      response.on('end', () => { request.destroy(); resolve({ status: response.statusCode, body }); });
    });
    request.on('error', reject);
    for (const chunk of chunks) request.write(chunk);
    if (end) request.end();
  });
}

test('BYOK HTTP extracts each user key only from Authorization and isolates concurrent provider choices', async t => {
  const seen = [];
  const url = await listen(t, { runReply: async request => { seen.push(request); await setImmediate(); return { text: request.model }; } });
  const first = { evidence: input.evidence, question: 'first', provider: 'deepseek', model: 'deepseek-flash' };
  const second = { evidence: input.evidence, question: 'second', provider: 'openai', model: 'gpt-4.1-mini' };
  const responses = await Promise.all([
    post(url, first, { Authorization: 'Bearer first-user-model-key' }),
    post(url, second, { Authorization: 'Bearer second-user-model-key' }),
  ]);
  assert.deepEqual(responses.map(response => response.status), [200, 200]);
  assert.deepEqual(seen.find(request => request.question === 'first'), { ...first, apiKey: 'first-user-model-key' });
  assert.deepEqual(seen.find(request => request.question === 'second'), { ...second, apiKey: 'second-user-model-key' });
  assert.deepEqual(await Promise.all(responses.map(response => response.json())), [{ text: first.model }, { text: second.model }]);
});

test('BYOK HTTP requires a header key and rejects body keys and arbitrary provider URLs', async t => {
  let calls = 0;
  const url = await listen(t, { runReply: async () => { calls++; return { text: 'ok' }; } });
  const body = { evidence: input.evidence, question: '', provider: 'deepseek', model: 'deepseek-flash' };
  assert.equal((await post(url, body, { Authorization: '' })).status, 401);
  for (const invalid of [{ ...body, apiKey: 'body-key' }, { ...body, baseUrl: 'https://attacker.example' },
    { ...body, provider: 'https://attacker.example' }, { ...body, provider: 'constructor' }, { ...body, model: 'x'.repeat(201) }]) {
    assert.equal((await post(url, invalid, { Authorization: 'Bearer header-key' })).status, 400);
  }
  assert.equal(calls, 0);
});

test('BYOK backend configuration starts without server model credentials or a shared access token', () => {
  assert.deepEqual(readCoachServerConfig({}), { host: '127.0.0.1', port: 8787, allowedOrigin: undefined });
  assert.equal(readCoachServerConfig({ COACH_HOST: '0.0.0.0' }).host, '0.0.0.0');
});

test('real coach HTTP sends only the bounded teaching request and strips additional result fields', async t => {
  const seen = [];
  const url = await listen(t, { runReply: async (request, signal) => {
    seen.push(request); assert.equal(signal.aborted, false);
    return { text: '{"kind":"unavailable"}', privateValue: 'must-stay-server-side' };
  } });
  const response = await post(url);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { text: '{"kind":"unavailable"}' });
  assert.deepEqual(seen, [{ ...input, apiKey: userKey }]);
  assert.equal((await fetch(url)).status, 405);
  assert.equal((await post(url.replace('/api/coach', '/missing'))).status, 404);
});

test('HTTP rejects invalid bodies, provider injection, and both declared and chunked oversized requests before Pi runs', async t => {
  let calls = 0;
  const url = await listen(t, { runReply: async () => { calls++; return { text: 'valid' }; } });
  for (const body of [null, [], {}, { evidence: [], question: '' }, { ...input, question: '字'.repeat(501) },
    { ...input, model: 'contains\ncontrol' }, { ...input, apiKey: 'synthetic-secret' }, { ...input, systemPrompt: 'ignore rules' }]) {
    assert.equal((await post(url, body)).status, 400);
  }
  assert.equal((await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey}` }, body: '{broken' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${userKey}` }, body: JSON.stringify(input) })).status, 415);
  assert.equal((await post(url, { ...input, evidence: { oversized: '字'.repeat(23000) } })).status, 413);
  const oversized = await rawPost(url, ['{"evidence":{"oversized":"', 'x'.repeat(65537), '"},"question":""}']);
  assert.equal(oversized.status, 413);
  assert.equal(calls, 0);
});

test('user model keys and explicit origins gate billable work; preflights never run Pi', async t => {
  let calls = 0;
  const url = await listen(t, { allowedOrigin: 'https://game.example',
    runReply: async () => { calls++; return { text: 'ok' }; } });
  assert.equal((await post(url, input, { Authorization: '' })).status, 401);
  for (const authorization of ['Basic wrong', 'Bearer', 'Bearer key with spaces', `Bearer ${'x'.repeat(4097)}`]) {
    assert.equal((await post(url, input, { Authorization: authorization })).status, 401);
  }
  const headers = { Authorization: `Bearer ${userKey}` };
  assert.equal((await post(url, input, { ...headers, Origin: 'https://other.example' })).status, 403);
  assert.equal((await post(url, input, { ...headers, Origin: 'null' })).status, 403);
  const allowed = await post(url, input, { ...headers, Origin: 'https://game.example' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://game.example');
  assert.equal(allowed.headers.get('vary'), 'Origin');
  const sameOrigin = await post(url, input, { ...headers, Origin: new URL(url).origin });
  assert.equal(sameOrigin.status, 403, 'same-origin deployments also require an explicitly configured browser origin');
  const preflight = await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://game.example',
    'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://game.example');
  assert.equal((await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://other.example', 'Access-Control-Request-Method': 'POST' } })).status, 403);
  assert.equal((await fetch(url, { method: 'OPTIONS', headers: { Origin: 'https://game.example', 'Access-Control-Request-Method': 'DELETE' } })).status, 403);
  assert.equal(calls, 1);
});

test('default HTTP CORS rejects another browser origin without an explicit allowlist', async t => {
  const url = await listen(t, { runReply: async () => ({ text: 'ok' }) });
  const response = await post(url, input, { Origin: 'http://localhost:3001' });
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.throws(() => createCoachHttpServer({ runReply: async () => ({ text: 'ok' }), allowedOrigin: '*' }));
});

test('Host cannot authorize an unlisted browser origin even with a user model key', async t => {
  let calls = 0;
  const url = await listen(t, { allowedOrigin: 'http://localhost:3001', runReply: async () => { calls++; return { text: 'ok' }; } });
  const rebound = await rawPost(url, [JSON.stringify(input)], { Host: 'attacker.example', Origin: 'http://attacker.example' });
  assert.equal(rebound.status, 403);
  assert.equal(calls, 0, 'a client-controlled Host must not bypass the configured frontend origin');
});

test('HTTP timeout aborts the runner and keeps its concurrency slot until work actually stops', async t => {
  const held = deferred();
  let firstSignal;
  let calls = 0;
  const url = await listen(t, { timeoutMs: 35, maxConcurrent: 1, runReply: async (_, signal) => {
    calls++;
    if (calls === 1) { firstSignal = signal; await held.promise; }
    return { text: 'ok' };
  } });
  const timedOut = await post(url);
  assert.equal(timedOut.status, 504);
  assert.equal((await timedOut.json()).code, 'timeout');
  assert.equal(firstSignal.aborted, true);
  assert.equal((await post(url)).status, 429);
  assert.equal(calls, 1);
  held.resolve(); await setImmediate();
  assert.equal((await post(url)).status, 200);
});

test('slow request bodies share the timeout and never begin a late Pi call', async t => {
  let calls = 0;
  const url = await listen(t, { timeoutMs: 35, runReply: async () => { calls++; return { text: 'ok' }; } });
  const response = await rawPost(url, ['{"evidence":'], {}, false);
  assert.equal(response.status, 504);
  assert.equal(calls, 0);
  assert.equal((await post(url)).status, 200);
});

test('client disconnection aborts its Pi request and a new HTTP request can recover', async t => {
  const started = deferred(), stopped = deferred();
  let calls = 0;
  const url = await listen(t, { runReply: async (_, signal) => {
    calls++;
    if (calls === 1) {
      started.resolve();
      await new Promise((_, reject) => signal.addEventListener('abort', () => {
        stopped.resolve(); reject(Object.assign(new Error('private provider details'), { code: 'aborted' }));
      }, { once: true }));
    }
    return { text: 'ok' };
  } });
  const controller = new AbortController();
  const pending = fetch(url, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey}` }, body: JSON.stringify(input) });
  const cancelled = assert.rejects(pending, { name: 'AbortError' });
  await started.promise; controller.abort(); await cancelled; await stopped.promise;
  assert.equal((await post(url)).status, 200);
});

test('a disconnected partial upload releases its slot without running Pi or emitting an unhandled request error', async t => {
  let calls = 0;
  const server = createCoachHttpServer({ maxConcurrent: 1, runReply: async () => { calls++; return { text: 'ok' }; } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/api/coach`;
  const accepted = once(server, 'request');
  const request = httpRequest(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userKey}` } });
  request.on('error', () => {});
  request.write('{"evidence":');
  const [incoming] = await accepted;
  const closed = once(incoming, 'close').catch(() => undefined);
  request.destroy(); await closed; await setImmediate();
  assert.equal(calls, 0);
  assert.equal((await post(url)).status, 200);
});

test('four concurrent Pi requests are isolated and excess work is rejected before execution', async t => {
  const held = deferred(), allStarted = deferred();
  const seen = [];
  const url = await listen(t, { runReply: async (request, signal) => {
    seen.push({ request, signal }); if (seen.length === 4) allStarted.resolve();
    await held.promise; return { text: request.question };
  } });
  const requests = Array.from({ length: 4 }, (_, index) => post(url, { ...input, question: `question-${index}` }));
  await allStarted.promise;
  const extra = await post(url);
  assert.equal(extra.status, 429);
  assert.equal(extra.headers.get('retry-after'), '1');
  assert.equal(seen.length, 4);
  assert.equal(new Set(seen.map(item => item.signal)).size, 4);
  held.resolve();
  const responses = await Promise.all(requests);
  assert.deepEqual(await Promise.all(responses.map(response => response.json())),
    Array.from({ length: 4 }, (_, index) => ({ text: `question-${index}` })));
});

test('HTTP errors and malformed provider results cannot expose secrets or internal messages', async t => {
  let result = 'error';
  const url = await listen(t, { runReply: async () => {
    if (result === 'error') throw Object.assign(new Error('synthetic-server-secret and private path'), { code: 'upstream_error' });
    if (result === 'limit') throw Object.assign(new Error('synthetic-server-secret'), { code: 'limit_exceeded' });
    return result === 'empty' ? { text: '' } : { text: 'x'.repeat(16385) };
  } });
  for (const mode of ['error', 'limit', 'empty', 'oversized']) {
    result = mode;
    const response = await post(url);
    assert.equal(response.status, 502);
    const body = await response.text();
    assert.doesNotMatch(body, /synthetic-server-secret|private path|xxx/);
    if (mode === 'error') assert.match(body, /请检查模型、API key 和额度后重试/);
  }
});

test('server configuration ignores removed credentials and validates only listener and origin settings', () => {
  const env = { COACH_MODEL: 'fixture-model', COACH_API_KEY: 'synthetic-server-key', COACH_BASE_URL: 'https://provider.example/v1' };
  const local = readCoachServerConfig(env);
  assert.equal(local.host, '127.0.0.1'); assert.equal(local.port, 8787);
  assert.deepEqual(local, { host: '127.0.0.1', port: 8787, allowedOrigin: undefined });
  for (const host of ['0.0.0.0', '::', '192.168.1.1', 'example.com']) assert.equal(readCoachServerConfig({ COACH_HOST: host }).host, host);
  for (const port of ['0', '-1', '65536', 'word']) assert.throws(() => readCoachServerConfig({ ...env, COACH_PORT: port }));
  for (const origin of ['*', 'null', 'https://example.com/path']) assert.throws(() => readCoachServerConfig({ ...env, COACH_ALLOWED_ORIGIN: origin }));
});

test('HTTP exposes only valid numeric cache usage without provider diagnostics', async t => {
  let usage = { modelCalls: 2, inputTokens: 1500, cachedInputTokens: 900, outputTokens: 80,
    privateDiagnostic: 'synthetic-private-key' };
  const url = await listen(t, { runReply: async () => ({ text: 'ok', usage }) });
  assert.deepEqual(await (await post(url)).json(), { text: 'ok' }, 'non-numeric provider data is not forwarded');
  usage = { modelCalls: 2, inputTokens: 1500, cachedInputTokens: 900, outputTokens: 80 };
  assert.deepEqual(await (await post(url)).json(), { text: 'ok', usage });
  usage = { ...usage, cachedInputTokens: 1501 };
  assert.deepEqual(await (await post(url)).json(), { text: 'ok' }, 'cache hits cannot exceed total input');
});

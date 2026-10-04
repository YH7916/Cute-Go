import assert from 'node:assert/strict';
import test from 'node:test';
import { requestCoachReply } from '../services/coach/client';
import { coachCompletionUrl, validateCoachConfig } from '../services/coach/settings';

const config = { endpoint: 'https://coach.example/v1', model: 'coach-model', apiKey: 'private-test-key' };
const evidence = { boardSize: 9, facts: [{ color: 'black', liberties: 2 }] };
const reply = (text = '先保护只有两口气的黑棋。') => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }] }));

test('coach accepts explicit compatible URLs and rejects unsafe or credential-bearing URLs', () => {
  assert.equal(coachCompletionUrl(' https://api.deepseek.com/ '), 'https://api.deepseek.com/chat/completions');
  assert.equal(coachCompletionUrl('https://coach.example/v1/chat/completions/'), 'https://coach.example/v1/chat/completions');
  assert.equal(coachCompletionUrl('http://localhost:11434/v1'), 'http://localhost:11434/v1/chat/completions');
  assert.equal(coachCompletionUrl('http://127.0.0.1:1234/v1'), 'http://127.0.0.1:1234/v1/chat/completions');
  assert.equal(coachCompletionUrl('http://[::1]:1234/v1'), 'http://[::1]:1234/v1/chat/completions');
  for (const endpoint of ['http://remote.example', 'https://user:secret@example.com', 'https://example.com/?key=secret', 'https://example.com/#token', 'https://example.com/?', 'file:///api', 'https://example.com\\v1', '//example.com', 'https://localhost.evil.test/?']) {
    assert.throws(() => coachCompletionUrl(endpoint));
  }
  assert.throws(() => validateCoachConfig({ ...config, apiKey: '' }, true), /密钥/);
  assert.doesNotThrow(() => validateCoachConfig({ ...config, endpoint: 'http://localhost:8080', apiKey: '' }, true));
});

test('coach sends standard nonstream chat messages and only puts the key in Authorization', async t => {
  let request: RequestInit | undefined;
  let address: unknown;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => { address = url; request = init; return reply(); });
  assert.deepEqual(await requestCoachReply({ config, evidence, question: '现在应注意什么？' }), { text: '先保护只有两口气的黑棋。' });
  assert.equal(address, 'https://coach.example/v1/chat/completions');
  assert.equal(request?.method, 'POST');
  assert.equal(request?.redirect, 'error');
  assert.equal(request?.credentials, 'omit');
  assert.equal(new Headers(request?.headers).get('authorization'), 'Bearer private-test-key');
  const body = JSON.parse(String(request?.body));
  assert.equal(body.model, config.model);
  assert.equal(body.stream, false);
  assert.equal(body.messages[0].role, 'system');
  assert.match(body.messages[0].content, /lastAction\.location/);
  assert.match(body.messages[0].content, /globalMoveNumber.*全局第/);
  assert.match(body.messages[0].content, /不能.*某方.*第.*次/);
  assert.match(body.messages[0].content, /不输出思考过程/);
  assert.match(body.messages[0].content, /像.*围棋老师/);
  assert.match(body.messages[0].content, /为什么.*下一步/);
  assert.match(body.messages[0].content, /不.*逐手.*坐标.*气数/);
  assert.match(body.messages[0].content, /没有提子/);
  assert.match(body.messages[0].content, /不.*无依据.*好棋/);
  assert.match(body.messages[0].content, /手动.*提问.*回应/);
  assert.match(body.messages[1].content, /现在应注意什么/);
  assert.match(body.messages[1].content, /"liberties":2/);
  assert.ok(!String(request?.body).includes(config.apiKey));
});

test('coach request prioritizes short actionable teaching and preserves rule explanations and uncertainty', async t => {
  let system = '';
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    system = String(body.messages[0].content);
    return reply();
  });
  await requestCoachReply({ config, evidence, question: '为什么这里不能下？' });
  assert.match(system, /^讲解和提示默认.*1–2句/);
  assert.match(system, /30–60字.*最多80字/);
  assert.match(system, /眼前危险.*新手.*误区/);
  assert.match(system, /一步.*观察|一个.*观察动作/);
  assert.match(system, /不.*气数.*必吃.*必活/);
  assert.match(system, /术语.*解释/);
  assert.match(system, /规则.*必要条件.*不受.*80字/);
  assert.match(system, /不.*泛泛.*数气|不.*空泛.*数气/);
  assert.match(system, /不能.*证明.*最佳|不.*编造.*最佳/);
  assert.match(system, /证据不足.*不确定|证据不足.*不知道/);
  assert.match(system, /不.*铺垫.*不.*第二段.*不.*反问/);
  assert.match(system, /空盘.*不能.*已落子/);
  assert.match(system, /空盘初学示例.*角部.*两条边.*围空/);
  assert.match(system, /打吃危险示例.*最后一口气.*提走.*接长.*吃子/);
  assert.match(system, /先看危险弱棋.*上一手已验证的提子、解围、连接或停着/);
  assert.match(system, /无一口气棋块且上一手无上述变化时只讲开局发展/);
});

test('coach policy permits a dedicated silence reply only for explicit proactive teaching', async t => {
  const messages: { role: string; content: string }[][] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    messages.push(body.messages);
    return reply('[SILENT]');
  });
  for (const proactive of [true, false]) {
    const teachingRequest = { proactive, intent: 'explain-last' };
    assert.equal((await requestCoachReply({ config, evidence: { ...evidence, teachingRequest } })).text,
      '[SILENT]', 'provider transport preserves complete replies; runtime owns the silence decision');
    const sent = messages.at(-1)!;
    assert.match(sent[0].content, /teachingRequest\.proactive.*true.*\[SILENT\]/);
    assert.match(sent[0].content, /只能复述.*没有.*提醒.*仅.*\[SILENT\]/);
    assert.match(sent[0].content, /手动.*禁止.*\[SILENT\].*回应/);
    assert.ok(sent[1].content.includes(JSON.stringify(teachingRequest)));
  }
});

test('keyless localhost sends no Authorization and missing remote key never fetches', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    assert.equal(new Headers(init?.headers).has('authorization'), false);
    return reply();
  });
  await requestCoachReply({ config: { ...config, endpoint: 'http://localhost:1234/v1', apiKey: '' }, evidence });
  await assert.rejects(requestCoachReply({ config: { ...config, apiKey: '' }, evidence }), /密钥/);
  assert.equal(fetch.mock.callCount(), 1);
});

test('official DeepSeek short explanations disable thinking for base and completion URLs', async t => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return reply();
  });
  for (const endpoint of ['https://api.deepseek.com', 'https://api.deepseek.com/v1',
    'https://api.deepseek.com/chat/completions', 'https://api.deepseek.com/v1/chat/completions',
    'https://API.DEEPSEEK.COM:443/v1/']) {
    const configured = { ...config, endpoint, model: 'deepseek-flash' };
    const original = { ...configured };
    await requestCoachReply({ config: configured, evidence });
    const body = bodies.at(-1);
    assert.deepEqual(body?.thinking, { type: 'disabled' });
    assert.equal(body?.max_tokens, 512, 'direct short answers retain the existing bounded budget');
    assert.equal(body?.model, configured.model);
    assert.deepEqual(configured, original, 'provider request adaptation must not rewrite saved settings');
  }
});

test('OpenAI, custom services and lookalike hosts never receive DeepSeek-only fields', async t => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return reply();
  });
  for (const endpoint of ['https://api.openai.com/v1', 'https://coach.example/v1',
    'http://localhost:1234/v1', 'https://api.deepseek.com.evil.test/v1',
    'https://api-deepseek.com/v1', 'https://deepseek.com/v1',
    'https://coach.example/api.deepseek.com', 'https://api.deepseek.com:8443/v1']) {
    await requestCoachReply({ config: { ...config, endpoint, model: 'deepseek-flash' }, evidence });
    const body = bodies.at(-1);
    assert.ok(body);
    assert.equal('thinking' in body, false);
    assert.equal('reasoning_effort' in body, false);
  }
});

test('length termination is reported before empty or missing answer content', async t => {
  for (const message of [undefined, {}, { content: null }, { content: '' },
    { content: ' ', reasoning_content: 'internal reasoning only' }]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
      choices: [{ finish_reason: 'length', message }],
    })));
    await assert.rejects(requestCoachReply({ config, evidence }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /截断/);
      assert.doesNotMatch(error.message, /Chat Completions|internal reasoning/);
      return true;
    });
  }
});

test('reasoning content is never substituted for the final answer or exposed in errors', async t => {
  const reasoning = 'private chain-of-thought must not be shown';
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ choices: [{
    finish_reason: 'stop', message: { content: '白棋现在有三口气。', reasoning_content: reasoning },
  }] })));
  assert.deepEqual(await requestCoachReply({ config, evidence }), { text: '白棋现在有三口气。' });
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ choices: [{
    finish_reason: 'stop', message: { content: null, reasoning_content: reasoning },
  }] })));
  await assert.rejects(requestCoachReply({ config, evidence }), error => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /没有返回文字讲解/);
    assert.ok(!error.message.includes(reasoning));
    return true;
  });
});

test('HTTP failures expose only local messages and never read server error details', async t => {
  for (const status of [401, 403, 429, 500]) {
    t.mock.method(globalThis, 'fetch', async () => new Response(`server leaked ${config.apiKey}`, { status }));
    await assert.rejects(requestCoachReply({ config, evidence }), error => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes(config.apiKey));
      assert.ok(!error.message.includes('server leaked'));
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

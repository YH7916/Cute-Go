import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { installedPiPlugin, coachEvidence as evidence, coachAnswer as answer,
  sendPiCompletion as send, createPiProviderFixture, readInitialCoachRequest } from './helpers/piCoachFixture.mjs';

// Import the installed Pi runtime unchanged. Only its HTTP model provider is a
// local SSE fixture: these tests do not claim real-model teaching quality.
const { createPiCoachRunner, MAX_PROVIDER_CALLS, MAX_TOOL_CALLS, buildCoachEvidence,
  buildCompactCoachContext, buildCoachTeachingChoices, createInitialPosition, renderCoachResponse,
  createCoachHttpServer, runPiCoachReply, executeCoachAgent, recordMove, attemptMove } = await loadTestModule({
  contents: `
    export * from './server/coach/runtime';
    export { createCoachHttpServer } from './server/coach/http';
    export { runPiCoachReply } from './server/coach/provider';
    export { executeCoachAgent } from './agent/coach/runtime';
    export { buildCoachEvidence } from './domains/coach/evidence';
    export { buildCompactCoachContext } from './domains/coach/context';
    export { buildCoachTeachingChoices, renderCoachResponse } from './domains/coach/response';
    export { createInitialPosition, recordMove } from './domains/game/positionState';
    export { attemptMove } from './core/go/rules';
  `,
  plugins: [installedPiPlugin],
});

const provider = (t, respond) => createPiProviderFixture(t, respond, createPiCoachRunner);

async function expectProviderDisconnected(closed) {
  let timer;
  try {
    await Promise.race([closed, new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('provider connection was not aborted')), 1000);
    })]);
  } finally { clearTimeout(timer); }
}

test('full coach chain validates real position evidence across client HTTP, backend Pi, and local model HTTP',
  { timeout: 10000 }, async t => {
    let mode = 'success', began, disconnected;
    const ready = new Promise(resolve => { began = resolve; });
    const closed = new Promise(resolve => { disconnected = resolve; });
    const upstream = await provider(t, (body, response) => {
      assert.ok(readInitialCoachRequest(body).evidence.teachingChoices.length > 0);
      if (mode === 'held') { response.once('close', disconnected); began(); return; }
      const text = mode === 'invalid-ref'
        ? JSON.stringify({ kind: 'explain', text: '可以从空旷角部开始。', refs: ['invented.fact'] })
        : mode === 'model-prose'
          ? JSON.stringify({ kind: 'explain', text: '可以下在D4，借两条边围空。', refs: ['concept.opening'] })
          : mode === 'off-board'
            ? JSON.stringify({ kind: 'explain', text: '可以下在T19，借两条边围空。', refs: ['concept.opening'] })
            : answer;
      send(response, { text });
    });
    const modelTargets = [];
    const localFetch = globalThis.fetch.bind(globalThis);
    t.mock.method(globalThis, 'fetch', async (destination, init) => {
      const target = new URL(typeof destination === 'string' ? destination : destination instanceof URL ? destination.href : destination.url);
      if (target.protocol === 'https:') {
        assert.equal(target.href, 'https://api.deepseek.com/chat/completions');
        modelTargets.push(target.href);
        return localFetch(`${upstream.config.baseUrl}/chat/completions`, init);
      }
      return localFetch(destination, init);
    });
    const apiKey = 'synthetic-user-model-key';
    const backend = createCoachHttpServer({ runReply: runPiCoachReply });
    const backendRequests = [];
    backend.on('request', request => backendRequests.push({ url: request.url, authorization: request.headers.authorization }));
    backend.listen(0, '127.0.0.1');
    await once(backend, 'listening');
    t.after(async () => { backend.closeAllConnections(); await new Promise(resolve => backend.close(resolve)); });
    const address = backend.address();
    assert.ok(address && typeof address === 'object');
    const config = { endpoint: `http://127.0.0.1:${address.port}/api/coach`, provider: 'deepseek', model: 'deepseek-flash', apiKey };
    let position = createInitialPosition(9);
    for (const [x, y] of [[2, 2], [6, 6]]) {
      const move = attemptMove(position.board, x, y, position.currentPlayer);
      assert.ok(move);
      position = recordMove(position, move.newBoard, { x, y }, move.captured, false);
    }
    const original = structuredClone(position);
    const input = { kind: 'ask', position, config, userColor: 'black', intent: 'hint', question: '为什么可以从空旷角部开局？' };

    await t.test('valid reference survives the complete product path', async () => {
      const result = await executeCoachAgent(input);
      assert.equal(result.source, 'cloud');
      assert.equal(result.error, undefined);
      assert.equal(result.text, JSON.parse(answer).text);
      assert.equal(result.moveNumber, 2);
      assert.equal(backendRequests.length, 1);
      assert.equal(upstream.requests.length, 1, 'a direct grounded answer costs one model request');
      assert.deepEqual(backendRequests[0], { url: '/api/coach', authorization: `Bearer ${apiKey}` });
      assert.equal(upstream.requests[0].authorization, `Bearer ${apiKey}`);
      assert.equal(upstream.requests[0].body.model, 'deepseek-flash');
      assert.equal(modelTargets.length, 1);
      const received = readInitialCoachRequest(upstream.requests[0].body).evidence;
      assert.equal(received.boardSize, 9);
      assert.equal(received.boardRows[2][2], 'B');
      assert.equal(received.boardRows[6][6], 'W');
      assert.equal(received.moveNumber, 2);
      assert.ok(received.teachingChoices.some(choice => choice.id === 'concept.opening'));
      assert.ok(!JSON.stringify(upstream.requests.map(request => request.body)).includes(apiKey));
      assert.ok(!JSON.stringify(result).includes(apiKey));
      assert.deepEqual(position, original);
    });

    await t.test('model prose may name legal coordinates beyond its cited variant', async () => {
      mode = 'model-prose';
      const result = await executeCoachAgent(input);
      assert.equal(result.source, 'cloud');
      assert.equal(result.text, '可以下在这里，借两条边围空。');
      assert.deepEqual(result.hintPoints, [{ x: 3, y: 5, label: 'D4' }]);
      assert.deepEqual(position, original);
    });

    await t.test('invalid references and off-board coordinates fall back locally without caching', async () => {
      for (mode of ['invalid-ref', 'off-board']) {
        const result = await executeCoachAgent(input);
        assert.equal(result.source, 'local');
        assert.equal(result.cacheable, false);
        assert.equal(result.error, undefined);
        assert.ok(result.text.length > 0);
        assert.deepEqual(position, original);
      }
    });

    await t.test('frontend cancellation closes the model connection through HTTP and Pi, then recovers', async () => {
      mode = 'held';
      const controller = new AbortController();
      const pending = executeCoachAgent(input, controller.signal);
      const rejected = assert.rejects(pending, { name: 'AbortError' });
      await ready;
      controller.abort();
      await rejected;
      await expectProviderDisconnected(closed);
      mode = 'success';
      const recovered = await executeCoachAgent(input);
      assert.equal(recovered.source, 'cloud');
      assert.equal(recovered.error, undefined);
      assert.equal(backendRequests.length, 6, 'one backend request per user action, including cancellation');
      assert.equal(upstream.requests.length, 6, 'each action made one model request, with no mandatory tool round');
      assert.deepEqual(position, original);
    });
  });

test('Pi can answer once from the complete latest snapshot while keeping a stable static prefix', async t => {
  const upstream = await provider(t, (_body, response) => send(response, { text: answer }));
  const first = evidence();
  first.engineAnalysis = { source: 'local-katago', perspective: 'black', visits: 8, winRateBlack: 62,
    estimatedBlackLead: 1.5, candidates: [{ point: { x: 2, y: 2, label: 'C7' }, visits: 5 }] };
  assert.equal((await upstream.run({ evidence: first, question: 'first position question' })).text, answer);
  assert.equal(upstream.requests.length, 1);
  assert.deepEqual(readInitialCoachRequest(upstream.requests[0].body), { evidence: first, question: 'first position question' });
  const second = structuredClone(first);
  second.boardRows[0] = 'B........'; second.moveNumber = 1; second.toPlay = 'white';
  second.engineAnalysis.winRateBlack = 58;
  assert.equal((await upstream.run({ evidence: second, question: 'latest position question' })).text, answer);
  assert.equal(upstream.requests.length, 2);
  const [initial, latest] = upstream.requests.map(request => request.body);
  assert.deepEqual(readInitialCoachRequest(latest), { evidence: second, question: 'latest position question' });
  assert.deepEqual(initial.messages.map(message => message.role), ['system', 'user']);
  assert.deepEqual(latest.messages.map(message => message.role), ['system', 'user']);
  assert.equal(initial.messages[0].content, latest.messages[0].content);
  assert.deepEqual(initial.tools, latest.tools);
  assert.equal(initial.tool_choice, 'auto');
  assert.equal(latest.tool_choice, 'auto');
  assert.ok(!JSON.stringify(latest).includes('first position question'), 'no transcript from an earlier board survives');
  assert.ok(!JSON.stringify(initial).includes(upstream.config.apiKey));
});

test('Pi may use a real tool loop over HTTP to recheck its request snapshot', async t => {
  const upstream = await provider(t, (_body, response, count) => {
    send(response, count % 2 ? { tools: [{ name: 'read_position' }] } : { text: answer });
  });
  const snapshot = evidence();
  const first = await upstream.run({ evidence: snapshot, question: '开局怎么下？' });
  assert.equal(first.text, answer);
  assert.equal(upstream.requests.length, 2);
  const [initial, following] = upstream.requests;
  assert.equal(initial.url, '/v1/chat/completions');
  assert.equal(initial.authorization, 'Bearer synthetic-test-key');
  assert.equal(initial.body.model, 'fixture-model');
  assert.equal(initial.body.stream, true);
  assert.equal(initial.body.tool_choice, 'auto');
  assert.deepEqual(initial.body.tools.map(tool => tool.function.name), ['read_position', 'read_teaching_choices', 'read_engine_analysis']);
  assert.deepEqual(readInitialCoachRequest(initial.body).evidence, snapshot);
  const result = following.body.messages.find(message => message.role === 'tool');
  assert.ok(result);
  assert.deepEqual(JSON.parse(result.content).boardRows, snapshot.boardRows);
  assert.deepEqual(JSON.parse(result.content).teachingChoices, snapshot.teachingChoices);
  assert.ok(!JSON.stringify(following.body).includes(upstream.config.apiKey));
  await upstream.run({ evidence: evidence(), question: '第二个独立玩家' });
  const next = upstream.requests[2].body.messages;
  assert.equal(next.filter(message => message.role === 'user').length, 1);
  assert.ok(!JSON.stringify(next).includes('开局怎么下')); // No shared transcript.
});

test('Pi can inspect selected teaching facts and engine evidence before its final third call', async t => {
  const snapshot = evidence();
  snapshot.engineAnalysis = { source: 'local-katago', perspective: 'black', visits: 8, candidates: [] };
  const upstream = await provider(t, (_body, response, count) => {
    send(response, count === 1 ? { tools: [{ name: 'read_position' }] } : count === 2 ? { tools: [
      { name: 'read_teaching_choices', args: { ids: ['concept.opening', 'invented'] } }, { name: 'read_engine_analysis' },
    ] } : { text: answer });
  });
  assert.equal((await upstream.run({ evidence: snapshot, question: '看一下引擎依据' })).text, answer);
  assert.equal(upstream.requests.length, 3);
  assert.equal(upstream.requests[2].body.tool_choice, 'none');
  const results = upstream.requests[2].body.messages.filter(message => message.role === 'tool');
  assert.deepEqual(JSON.parse(results.at(-2).content), snapshot.teachingChoices);
  assert.deepEqual(JSON.parse(results.at(-1).content), snapshot.engineAnalysis);
});

test('Pi accepts the actual compact client context and tools keep the original snapshot', async t => {
  const local = buildCoachEvidence(createInitialPosition(9), 'black', 3.5);
  const { payload } = buildCompactCoachContext({ evidence: local, intent: 'hint', hintPoints: [],
    choices: buildCoachTeachingChoices(local, { text: '可以从空旷角部开始，借两条边围空。' }) });
  const original = structuredClone(payload);
  const upstream = await provider(t, (_body, response, count) => {
    if (count === 1) {
      payload.boardRows[0] = 'BBBBBBBBB';
      payload.teachingChoices[0].variants[0] = 'caller mutation after the request started';
      send(response, { tools: [{ name: 'read_position' }] });
    } else send(response, { text: answer });
  });
  assert.equal((await upstream.run({ evidence: payload, question: '' })).text, answer);
  assert.deepEqual(readInitialCoachRequest(upstream.requests[0].body).evidence, original);
  const tool = upstream.requests[1].body.messages.find(message => message.role === 'tool');
  assert.deepEqual(JSON.parse(tool.content), original);
});

test('Pi keeps a concise static policy and transports its exact dynamic response limits', async t => {
  const upstream = await provider(t, (_body, response) => send(response, { text: answer }));
  const snapshot = evidence();
  const question = '独立测试问题：为什么这里不能下？';
  await upstream.run({ evidence: snapshot, question });
  const initial = upstream.requests[0].body;
  const system = initial.messages.find(message => message.role === 'system').content;
  assert.ok(system.length <= 600, 'the core policy stays compact; field details belong to static tool descriptions');
  assert.match(system, /一句/);
  assert.match(system, /refs/);
  const responseExample = system.match(/\{"kind":"explain",[^}]+\}/)?.[0];
  assert.ok(responseExample);
  assert.deepEqual(Object.keys(JSON.parse(responseExample)).sort(), ['kind', 'refs', 'text']);
  assert.match(system, /unavailable/);
  assert.match(system, /工具.*指令|数据.*指令/);
  assert.doesNotMatch(system, /\b[A-HJ-T]\d{1,2}\b/);
  assert.ok(!system.includes(question));
  assert.ok(!system.includes(JSON.stringify(snapshot)));
  assert.deepEqual(readInitialCoachRequest(initial).evidence.teachingRequest, snapshot.teachingRequest);
  assert.equal(snapshot.teachingRequest.maxSentences, 1);
  assert.ok(initial.tools.every(tool => typeof tool.function.description === 'string' && tool.function.description.length > 0));
});

test('backend policy allows silence only for proactive teaching and preserves the protocol marker', async t => {
  const upstream = await provider(t, (_body, response) => send(response, { text: '[SILENT]' }));
  for (const proactive of [true, false]) {
    const snapshot = evidence(); snapshot.teachingRequest.proactive = proactive;
    const response = await upstream.run({ evidence: snapshot, question: proactive ? '' : '现在该注意什么？' });
    assert.equal(response.text, '[SILENT]', 'the final client validator owns whether silence applies to this request');
    const sent = upstream.requests.at(-1).body.messages;
    const system = sent.find(message => message.role === 'system').content;
    assert.match(system, /\[SILENT\]/);
    assert.match(system, /主动|proactive/);
    assert.match(system, /手动/);
    assert.equal(readInitialCoachRequest(upstream.requests.at(-1).body).evidence.teachingRequest.proactive, proactive);
    assert.deepEqual(renderCoachResponse(response.text, snapshot.teachingChoices, proactive, 9, 1), proactive ? { kind: 'silent' } : null);
  }
});

test('Pi never exposes reasoning as final content, substitutes it for missing text, or leaks it on truncation', async t => {
  const reasoning = 'private chain-of-thought must not be shown';
  let mode = 'answer';
  const upstream = await provider(t, (_body, response) => {
    send(response, {
      reasoning, ...(mode === 'answer' ? { text: answer } : {}),
      ...(mode === 'length' ? { finishReason: 'length' } : {}),
    });
  });
  assert.deepEqual(await upstream.run({ evidence: evidence(), question: '' }), { text: answer });
  for (mode of ['missing', 'length']) {
    await assert.rejects(upstream.run({ evidence: evidence(), question: '' }), error => {
      assert.equal(error.code, 'invalid_response');
      assert.ok(!error.message.includes(reasoning));
      return true;
    });
  }
});

test('backend applies DeepSeek thinking adaptation only to its official origin', async t => {
  const upstream = await provider(t, (_body, response, count) => {
    send(response, count % 2 ? { tools: [{ name: 'read_position' }] } : { text: answer });
  });
  // Exercise the real Pi provider request builder, redirecting every synthetic
  // URL to the local fixture before network I/O. No public endpoint is called.
  const localFetch = globalThis.fetch.bind(globalThis);
  t.mock.method(globalThis, 'fetch', async (_input, init) => localFetch(`${upstream.config.baseUrl}/chat/completions`, init));
  for (const baseUrl of ['https://api.deepseek.com', 'https://API.DEEPSEEK.COM:443/v1/',
    'https://api.openai.com/v1', 'https://api.deepseek.com.evil.test/v1',
    'https://coach.example/api.deepseek.com', 'https://api.deepseek.com:8443/v1']) {
    const config = { ...upstream.config, baseUrl };
    const original = { ...config };
    assert.equal((await createPiCoachRunner(config)({ evidence: evidence(), question: '' })).text, answer);
    const body = upstream.requests.at(-1).body;
    if (new URL(baseUrl).origin === 'https://api.deepseek.com') assert.deepEqual(body.thinking, { type: 'disabled' });
    else assert.equal('thinking' in body, false);
    assert.equal('reasoning_effort' in body, false);
    assert.equal(body.max_tokens, 768);
    assert.deepEqual(config, original);
  }
});

test('Pi refuses endless provider tool turns and excessive tool batches', async t => {
  assert.equal(MAX_PROVIDER_CALLS, 3);
  assert.equal(MAX_TOOL_CALLS, 6);
  await t.test('three provider calls are a hard limit even if the model ignores tool_choice none', async t => {
    const upstream = await provider(t, (_body, response) => send(response, { tools: [{ name: 'read_position' }] }));
    await assert.rejects(upstream.run({ evidence: evidence(), question: '' }), { code: 'limit_exceeded' });
    assert.equal(upstream.requests.length, MAX_PROVIDER_CALLS);
  });
  await t.test('a single response cannot request unlimited tool executions', async t => {
    const upstream = await provider(t, (_body, response) => send(response, {
      tools: Array.from({ length: MAX_TOOL_CALLS + 1 }, () => ({ name: 'read_position' })),
    }));
    await assert.rejects(upstream.run({ evidence: evidence(), question: '' }), { code: 'limit_exceeded' });
    assert.equal(upstream.requests.length, 1);
  });
  await t.test('six read-only tool calls remain usable within the execution budget', async t => {
    const upstream = await provider(t, (_body, response, count) => send(response,
      count === 1 ? { tools: Array.from({ length: 6 }, () => ({ name: 'read_position' })) } : { text: answer }));
    assert.equal((await upstream.run({ evidence: evidence(), question: '' })).text, answer);
    assert.equal(upstream.requests.length, 2);
    assert.equal(upstream.requests[1].body.messages.filter(message => message.role === 'tool').length, 6);
  });
});

test('Pi aborts active HTTP on caller cancellation and enforces a shorter deadline', async t => {
  await t.test('caller cancellation', async t => {
    let began, disconnected;
    const ready = new Promise(resolve => { began = resolve; });
    const closed = new Promise(resolve => { disconnected = resolve; });
    const upstream = await provider(t, (_body, response) => {
      response.once('close', disconnected);
      began();
    });
    const controller = new AbortController();
    const pending = upstream.run({ evidence: evidence(), question: '' }, controller.signal);
    await ready;
    controller.abort();
    await assert.rejects(pending, { code: 'aborted' });
    await expectProviderDisconnected(closed);
    assert.equal(upstream.requests.length, 1);
  });
  await t.test('server deadline', async t => {
    const upstream = await provider(t, () => {});
    const run = createPiCoachRunner({ ...upstream.config, timeoutMs: 60 });
    await assert.rejects(run({ evidence: evidence(), question: '' }), { code: 'timeout' });
    assert.equal(upstream.requests.length, 1);
  });
});

test('Pi rejects malformed or oversized evidence before any upstream request', async t => {
  const upstream = await provider(t, (_body, response) => send(response, { text: answer }));
  const malformed = evidence(); malformed.boardRows[0] = 'bad';
  const oversized = evidence(); oversized.injection = 'x'.repeat(6001);
  const cyclic = evidence(); cyclic.loop = cyclic;
  const multiSentence = evidence(); multiSentence.teachingRequest.maxSentences = 2;
  const longResponse = evidence(); longResponse.teachingRequest.maxTextChars = 51;
  for (const value of [null, malformed, oversized, cyclic, multiSentence, longResponse]) {
    await assert.rejects(upstream.run({ evidence: value, question: '' }), { code: 'invalid_request' });
  }
  await assert.rejects(upstream.run({ evidence: evidence(), question: 'x'.repeat(501) }), { code: 'invalid_request' });
  assert.equal(upstream.requests.length, 0);
});

test('Pi sanitizes provider errors without hidden retry and accepts a later direct grounded answer', async t => {
  const upstream = await provider(t, (_body, response, count) => {
    if (count === 1) response.writeHead(401).end('provider-private-error synthetic-test-key');
    else send(response, { text: answer });
  });
  await assert.rejects(upstream.run({ evidence: evidence(), question: '' }), error => {
    assert.equal(error.code, 'upstream_error');
    assert.doesNotMatch(error.message, /provider-private|synthetic-test-key/);
    assert.match(error.message, /请检查模型、API key 和额度后重试/);
    return true;
  });
  assert.deepEqual(await upstream.run({ evidence: evidence(), question: '' }), { text: answer });
  assert.equal(upstream.requests.length, 2, 'no hidden paid retry');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { installedPiPlugin, coachEvidence as evidence, coachAnswer as answer,
  sendPiCompletion as send, createPiProviderFixture, readInitialCoachRequest } from './helpers/piCoachFixture.mjs';

const { createPiCoachRunner, runPiCoachReply } = await loadTestModule({
  contents: `export { createPiCoachRunner } from './server/coach/runtime';
    export { runPiCoachReply } from './server/coach/provider';`,
  plugins: [installedPiPlugin],
});

test('OpenAI cache routing is stable per user and model while every board remains request-local', async t => {
  // A process-wide SDK preference must not silently enable unsupported 24h retention.
  const previousRetention = process.env.PI_CACHE_RETENTION;
  process.env.PI_CACHE_RETENTION = 'long';
  t.after(() => {
    if (previousRetention === undefined) delete process.env.PI_CACHE_RETENTION;
    else process.env.PI_CACHE_RETENTION = previousRetention;
  });
  const upstream = await createPiProviderFixture(t, (_body, response) => send(response, { text: answer }), createPiCoachRunner);
  const localFetch = globalThis.fetch.bind(globalThis);
  t.mock.method(globalThis, 'fetch', async (_destination, init) => localFetch(`${upstream.config.baseUrl}/chat/completions`, init));
  const choices = [
    { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'first-user-key' },
    { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'first-user-key' },
    { provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'second-user-key' },
    { provider: 'openai', model: 'gpt-4.1', apiKey: 'first-user-key' },
    { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'first-deepseek-key' },
    { provider: 'deepseek', model: 'deepseek-flash', apiKey: 'first-deepseek-key' },
  ];
  for (const [index, config] of choices.entries()) {
    const snapshot = evidence();
    snapshot.moveNumber = index;
    snapshot.boardRows[0] = `${'.'.repeat(index)}B${'.'.repeat(8 - index)}`;
    snapshot.engineAnalysis = { source: 'local-katago', perspective: 'black', visits: 8, winRateBlack: 50 + index, candidates: [] };
    const question = `current-board-${index}`;
    assert.equal((await runPiCoachReply({ ...config, evidence: snapshot, question })).text, answer);
    const sent = upstream.requests.at(-1);
    assert.equal(upstream.requests.length, index + 1, 'direct responses do not trigger a compulsory tool round');
    assert.deepEqual(readInitialCoachRequest(sent.body), { evidence: snapshot, question });
    assert.deepEqual(sent.body.messages.map(message => message.role), ['system', 'user']);
    assert.equal(sent.authorization, `Bearer ${config.apiKey}`);
    assert.ok(!JSON.stringify(sent.body).includes(config.apiKey));
    assert.equal(sent.body.prompt_cache_retention, undefined);
    assert.equal(sent.body.prompt_cache_options, undefined);
    if (index > 0) assert.ok(!JSON.stringify(sent.body).includes(`current-board-${index - 1}`));
  }
  const bodies = upstream.requests.map(request => request.body);
  const keys = bodies.slice(0, 4).map(body => body.prompt_cache_key);
  assert.ok(keys.every(key => typeof key === 'string' && key.length >= 16 && key.length <= 64));
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[0], keys[2]);
  assert.notEqual(keys[0], keys[3]);
  assert.ok(keys.every(key => !/first-user|second-user|gpt-4|current-board/.test(key)));
  for (const body of bodies) {
    assert.equal(body.messages[0].content, bodies[0].messages[0].content);
    assert.deepEqual(body.tools, bodies[0].tools);
  }
  for (const body of bodies.slice(4)) assert.equal(body.prompt_cache_key, undefined);
  // These are request-construction assertions, not evidence of a real cache hit.
});

test('BYOK dispatcher isolates concurrent users and maps credentials only to their fixed provider', async t => {
  const upstream = await createPiProviderFixture(t, (body, response) => send(response,
    body.messages.some(message => message.role === 'tool') ? { text: answer } : { tools: [{ name: 'read_position' }] }), createPiCoachRunner);
  const localFetch = globalThis.fetch.bind(globalThis), targets = [];
  t.mock.method(globalThis, 'fetch', async (destination, init) => {
    const target = new URL(typeof destination === 'string' ? destination : destination instanceof URL ? destination.href : destination.url);
    assert.ok(['https://api.deepseek.com/chat/completions', 'https://api.openai.com/v1/chat/completions'].includes(target.href));
    targets.push(target.href);
    return localFetch(`${upstream.config.baseUrl}/chat/completions`, init);
  });
  const requests = [
    { evidence: evidence(), question: 'first user', provider: 'deepseek', model: 'deepseek-flash', apiKey: 'first-model-key' },
    { evidence: evidence(), question: 'second user', provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'second-model-key' },
  ];
  assert.deepEqual(await Promise.all(requests.map(request => runPiCoachReply(request))), [{ text: answer }, { text: answer }]);
  assert.equal(targets.filter(target => target === 'https://api.deepseek.com/chat/completions').length, 2);
  assert.equal(targets.filter(target => target === 'https://api.openai.com/v1/chat/completions').length, 2);
  for (const request of requests) {
    const other = requests.find(value => value !== request);
    const sent = upstream.requests.filter(sent => sent.body.model === request.model);
    assert.equal(sent.length, 2);
    assert.ok(sent.every(sent => sent.authorization === `Bearer ${request.apiKey}`));
    assert.ok(sent.every(sent => !JSON.stringify(sent.body).includes('model-key')));
    for (const item of sent) {
      const messages = item.body.messages.filter(message => message.role === 'user');
      assert.ok(messages.length > 0);
      for (const message of messages) {
        const content = JSON.stringify(message.content);
        assert.ok(content.includes(request.question));
        assert.equal(content.includes(other.question), false);
      }
    }
  }
  await assert.rejects(runPiCoachReply({ ...requests[0], provider: 'https://attacker.example' }), { code: 'invalid_request' });
  assert.equal(upstream.requests.length, 4, 'invalid provider selection cannot start a model request');
});

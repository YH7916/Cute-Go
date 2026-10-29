import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { installedPiPlugin, coachEvidence as evidence, coachAnswer as answer,
  sendPiCompletion as send, createPiProviderFixture } from './helpers/piCoachFixture.mjs';

const { createPiCoachRunner } = await loadTestModule({ entryPoint: 'server/coach/runtime.ts', plugins: [installedPiPlugin] });
const provider = (t, respond) => createPiProviderFixture(t, respond, createPiCoachRunner);

// Synthetic provider usage verifies accounting only; these are not live cache hits.
test('Pi sums all model rounds and understands OpenAI and DeepSeek cached-token usage', async t => {
  for (const format of ['openai', 'deepseek']) await t.test(format, async t => {
    const upstream = await provider(t, (_body, response, count) => {
      const promptTokens = count === 1 ? 1200 : 1800;
      const cachedTokens = count === 1 ? 256 : 1024;
      send(response, {
        ...(count === 1 ? { tools: [{ name: 'read_position' }] } : { text: answer }),
        usage: { prompt_tokens: promptTokens, completion_tokens: count === 1 ? 12 : 24,
          ...(format === 'openai' ? { prompt_tokens_details: { cached_tokens: cachedTokens } }
            : { prompt_cache_hit_tokens: cachedTokens, prompt_cache_miss_tokens: promptTokens - cachedTokens }) },
      });
    });
    const result = await upstream.run({ evidence: evidence(), question: '' });
    assert.deepEqual(result, { text: answer,
      usage: { modelCalls: 2, inputTokens: 3000, cachedInputTokens: 1280, outputTokens: 36 } });
    assert.equal(upstream.requests.length, 2);
    assert.ok(upstream.requests.every(request => request.body.stream_options.include_usage === true));
    assert.equal(result.usage.cachedInputTokens / result.usage.inputTokens, 1280 / 3000,
      'cache rate counts all input tokens, excluding generated output');
  });
});

test('Pi preserves gross input totals if a compatible provider reports cache writes separately', async t => {
  const upstream = await provider(t, (_body, response) => send(response, { text: answer,
    usage: { prompt_tokens: 1000, completion_tokens: 20,
      prompt_tokens_details: { cached_tokens: 200, cache_write_tokens: 100 } } }));
  assert.deepEqual(await upstream.run({ evidence: evidence(), question: '' }), { text: answer,
    usage: { modelCalls: 1, inputTokens: 1000, cachedInputTokens: 200, outputTokens: 20 } });
});

test('Pi omits unknown usage instead of inventing a cache hit or a zero-hit measurement', async t => {
  const upstream = await provider(t, (_body, response, count) => send(response, { text: answer,
    ...(count === 1 ? {} : { usage: { prompt_tokens: count === 2 ? 0 : 1000, completion_tokens: 20,
      prompt_tokens_details: { cached_tokens: 0 } } }) }));
  assert.deepEqual(await upstream.run({ evidence: evidence(), question: '' }), { text: answer });
  assert.deepEqual(await upstream.run({ evidence: evidence(), question: '' }), { text: answer });
  assert.deepEqual(await upstream.run({ evidence: evidence(), question: '' }), { text: answer,
    usage: { modelCalls: 1, inputTokens: 1000, cachedInputTokens: 0, outputTokens: 20 } });
  assert.equal(upstream.requests.length, 3, 'usage belongs only to its own request');
});

test('Pi omits total usage if any model round lacks provider usage', async t => {
  for (const missingRound of [1, 2]) await t.test(`missing round ${missingRound}`, async t => {
    const upstream = await provider(t, (_body, response, count) => send(response, {
      ...(count === 1 ? { tools: [{ name: 'read_position' }] } : { text: answer }),
      ...(count === missingRound ? {} : { usage: { prompt_tokens: 1000, completion_tokens: 20,
        prompt_tokens_details: { cached_tokens: 1000 } } }),
    }));
    const result = await upstream.run({ evidence: evidence(), question: '' });
    assert.deepEqual(result, { text: answer },
      'one fully cached reported round cannot imply a complete 100% cache-hit measurement');
    assert.equal(upstream.requests.length, 2);
  });
});

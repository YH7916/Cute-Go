import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, undoPosition, setAgentInterceptor, settle, setup, move, makeHumanTurn, makeNewAtari } from './helpers/coachSession.mjs';

test('manual explanation publishes a successful reply for its unchanged position', async t => {
  const s = await setup(t);
  await makeHumanTurn(s);
  const pending = s.api.coach.ask('explain-last-move', '  刚才白棋做了什么？  ');
  await settle();
  assert.equal(s.requests.length, 1);
  assert.equal(s.render().coach.loading, true);
  assert.equal(s.api.coach.source, 'local');
  const body = JSON.parse(s.requests[0].init.body);
  assert.deepEqual(Object.keys(body).sort(), ['evidence', 'model', 'provider', 'question']);
  assert.equal(body.question, '刚才白棋做了什么？');
  assert.equal('positionKey' in body.evidence, false);
  const answer = s.respondChoice(0, 'group.G3');
  await pending;
  const { coach } = s.render();
  assert.equal(coach.source, 'cloud');
  assert.equal(coach.text, answer.replace('G3', '这里'));
  assert.match(coach.text, /这里.*白棋.*4口气/);
  assert.deepEqual(coach.hintPoints, [{ x: 6, y: 6, label: 'G3' }]);
  assert.equal(coach.loading, false);
  assert.equal(coach.error, undefined);
});

test('the coach request carries the confirmed A5 location and global move count', async t => {
  const s = await setup(t);
  move(s, 2, 2);
  move(s, 0, 4);
  s.render();
  const pending = s.api.coach.ask('explain-last-move');
  await settle();
  const body = JSON.parse(s.requests[0].init.body);
  const evidence = body.evidence;
  assert.equal(evidence.lastAction.point, 'A5');
  assert.equal(evidence.lastAction.location, '左边线正中（左起第 1 列，上起第 5 行）');
  assert.equal(evidence.lastAction.globalMoveNumber, 2);
  assert.match(evidence.moveNumberMeaning, /双方.*停着/);
  assert.equal('positionKey' in evidence, false);
  s.api.coach.cancel();
  await pending;
});

for (const config of [
  { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' },
  { endpoint: 'http://remote.invalid/api/coach', provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-model-key' },
]) {
  test(`unconfigured ${config.endpoint ? 'insecure remote endpoint' : 'endpoint'} keeps guidance local`, async t => {
    const s = await setup(t, config);
    await makeHumanTurn(s);
    s.render();
    await s.api.coach.ask('hint');
    const { coach } = s.render();
    assert.equal(coach.configured, false);
    assert.equal(coach.source, 'local');
    assert.ok(coach.text.length > 0);
    assert.equal(coach.loading, false);
    assert.equal(coach.error, undefined);
    t.mock.timers.tick(1000);
    assert.equal(s.requests.length, 0);
  });
}

test('a configured backend receives the model key only in Authorization', async t => {
  const s = await setup(t, { endpoint: 'http://localhost:1234/v1', provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-model-key' });
  assert.equal(s.api.coach.configured, true);
  const pending = s.api.coach.ask('hint', '为什么可以从空旷角部开局？');
  await settle();
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].url, 'http://localhost:1234/v1');
  assert.equal(new Headers(s.requests[0].init.headers).get('Authorization'), 'Bearer test-model-key');
  assert.ok(!s.requests[0].init.body.includes('test-model-key'));
  s.respondChoice(0, 'concept.opening');
  await pending;
  assert.equal(s.render().coach.source, 'cloud');
});

test('a backend without a model key keeps hints local and never sends a request', async t => {
  const s = await setup(t, { endpoint: 'https://coach.example/api/coach', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' });
  assert.equal(s.api.coach.configured, false);
  await s.api.coach.ask('hint');
  assert.equal(s.render().coach.source, 'local');
  assert.ok(s.api.coach.text.length > 0);
  assert.equal(s.requests.length, 0);
});

test('a synchronous position write rejects the old success before any render occurs', async t => {
  const s = await setup(t);
  const original = s.api.state.readPosition();
  const pending = s.api.coach.ask('hint', '气是什么？');
  await settle();
  move(s, 2, 2);
  assert.equal(s.requests[0].init.signal.aborted, false, 'no effect cleanup has run');
  const staleAnswer = s.respondChoice(0, 'concept.liberties');
  await pending;
  // Restore the original identity only after completion to expose any stale
  // answer publication that a later position-change cleanup might otherwise hide.
  s.api.state.writePosition(original);
  const { coach } = s.render();
  assert.equal(coach.source, 'local');
  assert.notEqual(coach.text, staleAnswer);
});

for (const change of ['same-size-reset', 'undo', 'exit', 'review', 'config', 'provider', 'model', 'api-key', 'user-color', 'game-over']) {
  test(`${change} invalidates a pending explanation and ignores its late response`, async t => {
    const s = await setup(t);
    if (change === 'undo') await makeHumanTurn(s);
    const previous = s.api.state.readPosition();
    const pending = s.api.coach.ask('hint', '气是什么？');
    await settle();
    if (change === 'same-size-reset') {
      s.api.state.writePosition(createInitialPosition(9));
      assert.deepEqual(s.api.state.readPosition(), previous);
      assert.notEqual(s.api.state.readPosition(), previous);
    }
    if (change === 'undo') s.api.state.writePosition(undoPosition(previous, 1));
    if (change === 'exit') s.options.active = false;
    if (change === 'review') s.options.playing = false;
    if (change === 'config') s.options.config = { ...s.options.config, endpoint: 'https://other-coach.example/api/coach' };
    if (change === 'provider') s.options.config = { ...s.options.config, provider: 'openai', model: 'gpt-4.1-mini', apiKey: 'other-provider-key' };
    if (change === 'model') s.options.config = { ...s.options.config, model: 'another-model' };
    if (change === 'api-key') s.options.config = { ...s.options.config, apiKey: 'replacement-key' };
    if (change === 'user-color') s.options.userColor = 'white';
    if (change === 'game-over') s.options.gameOver = true;
    s.render();
    assert.equal(s.requests[0].init.signal.aborted, true);
    assert.equal(s.api.coach.loading, false);
    const staleAnswer = s.respondChoice(0, 'concept.liberties');
    await pending;
    await settle();
    const { coach } = s.render();
    assert.equal(coach.source, 'local');
    assert.notEqual(coach.text, staleAnswer);
    assert.equal(coach.error, undefined);
    assert.equal(coach.loading, false);
  });
}

test('an old request finally cannot clear the new request loading state', async t => {
  const s = await setup(t);
  const first = s.api.coach.ask('hint', '气是什么？');
  await settle();
  const second = s.api.coach.ask('explain-last-move', '斜对角算连接吗？');
  await settle();
  assert.equal(s.requests.length, 2);
  assert.equal(s.requests[0].init.signal.aborted, true);
  assert.equal(s.requests[1].init.signal.aborted, false);
  await first;
  assert.equal(s.render().coach.loading, true);
  const oldAnswer = s.respondChoice(0, 'concept.liberties');
  await settle();
  assert.equal(s.render().coach.loading, true);
  assert.notEqual(s.api.coach.text, oldAnswer);
  const newAnswer = s.respondChoice(1, 'concept.connection');
  await second;
  assert.equal(s.render().coach.loading, false);
  assert.equal(s.api.coach.text, newAnswer);
});

test('explicit cancellation retains local guidance without reporting an error', async t => {
  const s = await setup(t);
  const pending = s.api.coach.ask('hint', '气是什么？');
  await settle();
  const localText = s.render().coach.text;
  s.api.coach.cancel();
  assert.equal(s.requests[0].init.signal.aborted, true);
  await pending;
  s.respondChoice(0, 'concept.liberties');
  await settle();
  const { coach } = s.render();
  assert.equal(coach.loading, false);
  assert.equal(coach.source, 'local');
  assert.equal(coach.text, localText);
  assert.equal(coach.error, undefined);
});

test('network failure falls back to local guidance and a later request can recover', async t => {
  const s = await setup(t);
  const pending = s.api.coach.ask('hint');
  await settle();
  const localText = s.render().coach.text;
  s.requests[0].reject(new TypeError('network unavailable'));
  await pending;
  const { coach } = s.render();
  assert.equal(coach.loading, false);
  assert.equal(coach.source, 'local');
  assert.equal(coach.text, localText);
  assert.match(coach.error, /无法连接陪练后台/);
  const retry = coach.ask('hint', '斜对角算连接吗？');
  await settle();
  const answer = s.respondChoice(1, 'concept.connection');
  await retry;
  assert.equal(s.render().coach.text, answer);
  assert.equal(s.api.coach.error, undefined);
});

test('a scheduled automatic explanation cannot override a manual question', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  s.render();
  t.mock.timers.tick(200);
  const pending = s.api.coach.ask('hint', '我应该先数哪块棋的气？');
  await settle();
  s.render();
  t.mock.timers.tick(500);
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].init.signal.aborted, false);
  assert.equal(JSON.parse(s.requests[0].init.body).question, '我应该先数哪块棋的气？');
  const answer = s.respondChoice(0, 'group.B8');
  await pending;
  assert.equal(s.render().coach.text, answer.replace('B8', '这里'));
  assert.deepEqual(s.api.coach.hintPoints, [{ x: 1, y: 1, label: 'B8' }]);
});

test('unmount aborts an active request and clears an automatic explanation timer', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  s.render();
  const pending = s.api.coach.ask('hint', '气是什么？');
  await settle();
  s.unmount();
  assert.equal(s.requests[0].init.signal.aborted, true);
  await pending;
  t.mock.timers.tick(1000);
  assert.equal(s.requests.length, 1);
  s.respondChoice(0, 'concept.liberties');
  await settle();
});

test('position previews remain local and keep a configured question composer available while refreshing', async t => {
  const s = await setup(t);
  assert.equal(s.api.coach.text, '', 'an empty board does not need unsolicited commentary');
  move(s, 2, 2);
  assert.equal(s.render().coach.configured, true);
  await settle();
  const { coach } = s.render();
  assert.equal(coach.source, 'local');
  assert.equal(coach.text, '', 'ordinary safe play stays quiet');
  assert.equal(coach.moveNumber, 1);
  assert.equal(coach.loading, false);
  assert.equal(s.requests.length, 0);
  s.api.state.writePosition(createInitialPosition(9));
  s.render();
  await settle();
  assert.equal(s.render().coach.text, '');
  assert.equal(s.requests.length, 0);
});

test('a deferred local preview cannot publish stale text or hints after a synchronous position write', async t => {
  const s = await setup(t);
  let resolvePreview;
  let previewSignal;
  setAgentInterceptor((input, signal, run) => input.kind === 'inspect'
    ? new Promise(resolve => { resolvePreview = resolve; previewSignal = signal; }) : run());
  move(s, 2, 2);
  move(s, 6, 6);
  s.render();
  const inspectedPosition = s.api.state.readPosition();
  move(s, 4, 4);
  assert.equal(previewSignal.aborted, false, 'the position changed before React cleanup');
  resolvePreview({ text: 'stale-local-preview', source: 'local', configured: true,
    hintPoints: [{ x: 1, y: 1, label: 'B8' }], moveNumber: 2 });
  await settle();
  s.api.state.writePosition(inspectedPosition);
  const { coach } = s.render();
  assert.notEqual(coach.text, 'stale-local-preview');
  assert.deepEqual(coach.hintPoints, []);
  assert.equal(s.requests.length, 0);
});

test('cancelling during local inspection prevents its later completion from starting a paid request', async t => {
  const s = await setup(t);
  const originalText = s.api.coach.text;
  let resolvePreview;
  let previewSignal;
  setAgentInterceptor((input, signal, run) => input.kind === 'inspect'
    ? new Promise(resolve => { resolvePreview = resolve; previewSignal = signal; }) : run());
  const pending = s.api.coach.ask('hint');
  assert.equal(s.render().coach.loading, true);
  s.api.coach.cancel();
  assert.equal(previewSignal.aborted, true);
  resolvePreview({ text: 'cancelled-local-preview', source: 'local', configured: true,
    hintPoints: [{ x: 1, y: 1, label: 'B8' }], moveNumber: 0 });
  await pending;
  const { coach } = s.render();
  assert.equal(coach.loading, false);
  assert.equal(coach.text, originalText);
  assert.deepEqual(coach.hintPoints, []);
  assert.equal(s.requests.length, 0);
});

test('an asynchronously confirmed configuration cannot schedule automatic work over a manual question', async t => {
  const s = await setup(t, { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' });
  await makeNewAtari(s);
  s.render();
  let releaseInitialPreview;
  setAgentInterceptor((input, _signal, run) => input.kind === 'inspect' && !input.question
    ? new Promise(resolve => { releaseInitialPreview = () => resolve(run()); }) : run());
  s.options.config = { endpoint: 'https://coach.example/v1', provider: 'deepseek', model: 'deepseek-flash', apiKey: 'test-secret' };
  s.render();
  const pending = s.api.coach.ask('hint', '被打吃了怎么办？');
  await settle();
  assert.equal(s.render().coach.configured, true);
  t.mock.timers.tick(700);
  await settle();
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].init.signal.aborted, false);
  releaseInitialPreview();
  await settle();
  assert.equal(s.render().coach.loading, true);
  const answer = s.respondChoice(0, 'concept.atari');
  await pending;
  assert.equal(s.render().coach.text, answer);
});

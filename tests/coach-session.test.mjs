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
  assert.equal(body.model, 'test-coach');
  assert.match(body.messages[1].content, /玩家问题：刚才白棋做了什么？$/);
  assert.equal(body.messages[1].content.includes('"positionKey"'), false);
  const answer = s.respondChoice(0, 'group.G3');
  await pending;
  const { coach } = s.render();
  assert.equal(coach.source, 'cloud');
  assert.equal(coach.text, answer.replace('G3', '圈出的这里'));
  assert.match(coach.text, /圈出的这里.*白棋.*4口气/);
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
  const content = body.messages[1].content;
  const evidence = JSON.parse(content.slice('局面证据：\n'.length, content.indexOf('\n玩家问题：')));
  assert.equal(evidence.lastAction.point.label, 'A5');
  assert.equal(evidence.lastAction.location, '左边线正中（左起第 1 列，上起第 5 行）');
  assert.equal(evidence.lastAction.globalMoveNumber, 2);
  assert.match(evidence.moveNumberMeaning, /双方.*停着/);
  assert.equal('positionKey' in evidence, false);
  s.api.coach.cancel();
  await pending;
});

for (const config of [
  { endpoint: '', model: '', apiKey: '' },
  { endpoint: 'https://coach.example/v1', model: 'test-coach', apiKey: '' },
]) {
  test(`unconfigured ${config.endpoint ? 'remote credentials' : 'endpoint'} keeps guidance local`, async t => {
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

test('localhost without an API key is configured and sends no Authorization header', async t => {
  const s = await setup(t, { endpoint: 'http://localhost:1234/v1', model: 'local-coach', apiKey: '' });
  assert.equal(s.api.coach.configured, true);
  const pending = s.api.coach.ask('hint');
  await settle();
  assert.equal(s.requests.length, 1);
  assert.equal(s.requests[0].url, 'http://localhost:1234/v1/chat/completions');
  assert.equal(new Headers(s.requests[0].init.headers).has('Authorization'), false);
  s.respondChoice(0, 'concept.opening');
  await pending;
  assert.equal(s.render().coach.source, 'cloud');
});

test('a synchronous position write rejects the old success before any render occurs', async t => {
  const s = await setup(t);
  const original = s.api.state.readPosition();
  const pending = s.api.coach.ask('hint');
  await settle();
  move(s, 2, 2);
  assert.equal(s.requests[0].init.signal.aborted, false, 'no effect cleanup has run');
  const staleAnswer = s.respondChoice(0, 'concept.capture');
  await pending;
  // Restore the original identity only after completion to expose any stale
  // answer publication that a later position-change cleanup might otherwise hide.
  s.api.state.writePosition(original);
  const { coach } = s.render();
  assert.equal(coach.source, 'local');
  assert.notEqual(coach.text, staleAnswer);
});

for (const change of ['same-size-reset', 'undo', 'exit', 'review', 'config', 'user-color', 'game-over']) {
  test(`${change} invalidates a pending explanation and ignores its late response`, async t => {
    const s = await setup(t);
    if (change === 'undo') await makeHumanTurn(s);
    const previous = s.api.state.readPosition();
    const pending = s.api.coach.ask('hint');
    await settle();
    if (change === 'same-size-reset') {
      s.api.state.writePosition(createInitialPosition(9));
      assert.deepEqual(s.api.state.readPosition(), previous);
      assert.notEqual(s.api.state.readPosition(), previous);
    }
    if (change === 'undo') s.api.state.writePosition(undoPosition(previous, 1));
    if (change === 'exit') s.options.active = false;
    if (change === 'review') s.options.playing = false;
    if (change === 'config') s.options.config = { ...s.options.config, model: 'other-coach' };
    if (change === 'user-color') s.options.userColor = 'white';
    if (change === 'game-over') s.options.gameOver = true;
    s.render();
    assert.equal(s.requests[0].init.signal.aborted, true);
    assert.equal(s.api.coach.loading, false);
    const staleAnswer = s.respondChoice(0, 'concept.capture');
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
  const first = s.api.coach.ask('hint', 'first question');
  await settle();
  const second = s.api.coach.ask('explain-last-move', 'second question');
  await settle();
  assert.equal(s.requests.length, 2);
  assert.equal(s.requests[0].init.signal.aborted, true);
  assert.equal(s.requests[1].init.signal.aborted, false);
  await first;
  assert.equal(s.render().coach.loading, true);
  const oldAnswer = s.respondChoice(0, 'concept.capture');
  await settle();
  assert.equal(s.render().coach.loading, true);
  assert.notEqual(s.api.coach.text, oldAnswer);
  const newAnswer = s.respondChoice(1, 'concept.liberties');
  await second;
  assert.equal(s.render().coach.loading, false);
  assert.equal(s.api.coach.text, newAnswer);
});

test('explicit cancellation retains local guidance without reporting an error', async t => {
  const s = await setup(t);
  const pending = s.api.coach.ask('hint');
  await settle();
  const localText = s.render().coach.text;
  s.api.coach.cancel();
  assert.equal(s.requests[0].init.signal.aborted, true);
  await pending;
  s.respondChoice(0, 'concept.capture');
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
  assert.match(coach.error, /无法连接讲解服务/);
  const retry = coach.ask('hint');
  await settle();
  const answer = s.respondChoice(1, 'concept.connection');
  await retry;
  assert.equal(s.render().coach.text, answer);
  assert.equal(s.api.coach.error, undefined);
});

test('automatic explanation waits 700ms and runs once for an unchanged position', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  s.render();
  t.mock.timers.tick(699);
  assert.equal(s.requests.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(s.requests.length, 1);
  assert.equal(s.render().coach.loading, true);
  const answer = s.respondChoice(0, 'group.B8');
  await settle();
  assert.equal(s.render().coach.text, answer.replace('B8', '圈出的这里'));
  assert.deepEqual(s.api.coach.hintPoints, [{ x: 1, y: 1, label: 'B8' }]);
  t.mock.timers.tick(5000);
  s.render();
  assert.equal(s.requests.length, 1);
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
  assert.match(JSON.parse(s.requests[0].init.body).messages[1].content, /我应该先数哪块棋的气？$/);
  const answer = s.respondChoice(0, 'group.B8');
  await pending;
  assert.equal(s.render().coach.text, answer.replace('B8', '圈出的这里'));
  assert.deepEqual(s.api.coach.hintPoints, [{ x: 1, y: 1, label: 'B8' }]);
});

test('unmount aborts an active request and clears an automatic explanation timer', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  s.render();
  const pending = s.api.coach.ask('hint');
  await settle();
  s.unmount();
  assert.equal(s.requests[0].init.signal.aborted, true);
  await pending;
  t.mock.timers.tick(1000);
  assert.equal(s.requests.length, 1);
  s.respondChoice(0, 'concept.capture');
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
  s.render();
  const inspectedPosition = s.api.state.readPosition();
  move(s, 6, 6);
  assert.equal(previewSignal.aborted, false, 'the position changed before React cleanup');
  resolvePreview({ text: 'stale-local-preview', source: 'local', configured: true,
    hintPoints: [{ x: 1, y: 1, label: 'B8' }], moveNumber: 1 });
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
  const s = await setup(t, { endpoint: '', model: '', apiKey: '' });
  await makeNewAtari(s);
  s.render();
  let releaseInitialPreview;
  setAgentInterceptor((input, _signal, run) => input.kind === 'inspect' && !input.question
    ? new Promise(resolve => { releaseInitialPreview = () => resolve(run()); }) : run());
  s.options.config = { endpoint: 'https://coach.example/v1', model: 'test-coach', apiKey: 'test-secret' };
  s.render();
  const pending = s.api.coach.ask('hint', '我的手动问题');
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

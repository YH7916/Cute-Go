import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { createInitialPosition, setAgentInterceptor, settle, setup, makeHumanTurn, makeNewAtari } from './helpers/coachSession.mjs';

const { executeCoachAgent } = await loadTestModule({
  contents: `export { executeCoachAgent } from './agent/coach/runtime';`,
});
const config = { endpoint: 'https://coach.example/v1', model: 'test-coach', apiKey: 'test-secret' };

test('proactive inspection stays silent on ordinary play while a manual inspection still responds', async t => {
  const s = await setup(t);
  await makeHumanTurn(s);
  const input = { kind: 'inspect', position: s.api.state.readPosition(), userColor: 'black',
    intent: 'explain-last-move', config };
  const automatic = await executeCoachAgent({ ...input, proactive: true });
  assert.equal(automatic.text, '');
  assert.equal(automatic.shouldAutoExplain, false);
  assert.deepEqual(automatic.hintPoints, []);
  const manual = await executeCoachAgent(input);
  assert.ok(manual.text.length > 0, 'silence applies to unsolicited commentary, never to an explicit request');
  assert.equal(manual.shouldAutoExplain, false);
  assert.equal(s.requests.length, 0);
});

test('a nonessential proactive ask cannot reach the configured provider', async t => {
  const s = await setup(t);
  const fetch = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({
    choices: [{ message: { content: 'unnecessary response' } }],
  })));
  const result = await executeCoachAgent({ kind: 'ask', proactive: true,
    position: s.api.state.readPosition(), userColor: 'black', intent: 'explain-last-move', config });
  assert.equal(result.text, '');
  assert.equal(fetch.mock.callCount(), 0);
});

test('ordinary moves stay quiet even with automatic service enabled and manual questions remain available', async t => {
  const s = await setup(t);
  assert.equal(s.api.coach.text, '');
  s.render();
  await makeHumanTurn(s);
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(s.requests.length, 0);
  assert.equal(s.render().coach.text, '');
  assert.equal(s.api.coach.configured, true);
  const pending = s.api.coach.ask('hint', '现在应该关注什么？');
  await settle();
  assert.equal(s.requests.length, 1);
  const answer = s.respondChoice(0, 'concept.connection');
  await pending;
  assert.equal(s.render().coach.text, answer);
});

test('new atari explains locally and triggers configured cloud once by default', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  assert.ok(s.api.coach.text.length > 0);
  s.render();
  t.mock.timers.tick(699);
  assert.equal(s.requests.length, 0);
  t.mock.timers.tick(1);
  await settle();
  assert.equal(s.requests.length, 1);
  s.respondChoice(0, 'group.B8');
  await settle();
  s.render();
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(s.requests.length, 1, 'an unchanged urgent position is explained once');
});

test('a pending local inspection must confirm necessity before any automatic cloud work is scheduled', async t => {
  const s = await setup(t);
  s.render();
  let release;
  setAgentInterceptor((input, _signal, run) => input.kind === 'inspect' && input.proactive
    ? new Promise(resolve => { release = () => resolve(run()); }) : run());
  await makeNewAtari(s);
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(s.requests.length, 0, 'cached service configuration does not authorize commentary on an unchecked position');
  release();
  await settle();
  s.render();
  t.mock.timers.tick(700);
  await settle();
  assert.equal(s.requests.length, 0, 'the automatic preview also retains the proactive gate');
  release();
  await settle();
  assert.equal(s.requests.length, 1);
  s.api.coach.cancel();
});

for (const timing of ['before inspection', 'after scheduling']) {
  test(`review ${timing} prevents automatic requests but allows manual teaching`, async t => {
    const s = await setup(t);
    if (timing === 'before inspection') s.options.playing = false;
    await makeNewAtari(s);
    if (timing === 'after scheduling') {
      t.mock.timers.tick(200);
      s.options.playing = false;
      s.render();
      await settle();
      s.render();
    }
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(s.requests.length, 0, 'moving through review must not trigger automatic cloud commentary');
    const pending = s.api.coach.ask('explain-last-move');
    await settle();
    assert.equal(s.requests.length, 1);
    const answer = s.respondChoice(0, 'concept.atari');
    await pending;
    assert.equal(s.render().coach.text, '只剩一口气叫打吃；可以检查接长、连接或吃子能否解围；多出气不等于做活，一口气也不一定能被合法吃掉。');
    assert.equal(s.api.coach.conversation.at(-1).answer, answer, 'review presentation keeps the complete manual answer in history');
  });
}

test('returning from review does not automatically ask again about an already explained live position', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  t.mock.timers.tick(700);
  await settle();
  assert.equal(s.requests.length, 1);
  const answer = s.respondChoice(0, 'concept.atari');
  await settle();
  assert.equal(s.render().coach.text, answer);
  for (const playing of [false, true]) {
    s.options.playing = playing;
    s.render();
    await settle();
    s.render();
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(s.requests.length, 1, 'reviewing and resuming the same game must not repeat a paid explanation');
  }
  assert.equal(s.render().coach.text, answer);
});

for (const invalidation of ['cancel', 'position', 'exit']) {
  test(`${invalidation} prevents a deferred essential inspection from starting automatic commentary`, async t => {
    const s = await setup(t);
    s.render();
    let release;
    setAgentInterceptor((input, _signal, run) => input.kind === 'inspect'
      ? new Promise(resolve => { release = () => resolve(run()); }) : run());
    await makeNewAtari(s);
    if (invalidation === 'cancel') s.api.coach.cancel();
    if (invalidation === 'position') s.api.state.writePosition(createInitialPosition(9));
    if (invalidation === 'exit') s.options.active = false;
    const oldRelease = release;
    s.render();
    oldRelease();
    await settle();
    s.render();
    t.mock.timers.tick(2000);
    await settle();
    assert.equal(s.requests.length, 0);
    assert.equal(s.api.coach.loading, false);
  });
}

test('cancelling an already scheduled essential explanation prevents a delayed paid request', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  s.render();
  t.mock.timers.tick(200);
  s.api.coach.cancel();
  s.render();
  t.mock.timers.tick(2000);
  await settle();
  assert.equal(s.requests.length, 0);
});

test('automatic preview and cloud request keep proactive identity while manual requests remain answerable', async t => {
  const s = await setup(t);
  const calls = [];
  setAgentInterceptor((input, _signal, run) => { calls.push(input); return run(); });
  await makeNewAtari(s);
  const position = s.api.state.readPosition();
  const localWarning = s.api.coach.text;
  assert.ok(localWarning);
  s.render();
  t.mock.timers.tick(700);
  await settle();
  assert.equal(s.requests.length, 1);
  s.respond(0, '[SILENT]');
  await settle();
  s.render();
  assert.ok(calls.filter(input => input.position === position).every(input => input.proactive === true));
  assert.equal(s.api.coach.text, localWarning, 'a silent cloud response must preserve verified local guidance');
  t.mock.timers.tick(5000);
  await settle();
  assert.equal(s.requests.length, 1);
  const manual = s.api.coach.ask('explain-last-move', '为什么要先救这块棋？');
  await settle();
  assert.equal(s.requests.length, 2);
  assert.notEqual(calls.at(-1).proactive, true);
  const answer = s.respondChoice(1, 'concept.atari');
  await manual;
  assert.equal(s.render().coach.text, answer);
  assert.match(s.api.coach.text, /接长、连接或吃子/);
});

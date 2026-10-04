import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, setAgentInterceptor, settle, setup, move } from './helpers/coachSession.mjs';

test('only an explicit explanation requests engine analysis and passes its result to the agent', async t => {
  const s = await setup(t);
  const analyses = [], agentRequests = [];
  s.options.analyze = (position, signal) => new Promise(resolve => analyses.push({ position, signal, resolve }));
  setAgentInterceptor((input, _signal, run) => { if (input.kind === 'ask') agentRequests.push(input); return run(); });
  move(s, 2, 2);
  s.render();
  await settle();
  assert.equal(analyses.length, 0, 'a board preview does not start model analysis');
  assert.equal(s.requests.length, 0);
  const position = s.api.state.readPosition();
  const pending = s.render().coach.ask('hint');
  await settle();
  assert.equal(analyses.length, 1);
  assert.equal(analyses[0].position, position);
  assert.equal(analyses[0].signal.aborted, false);
  assert.equal(s.render().coach.source, 'local');
  assert.ok(s.api.coach.text.length > 0, 'local guidance appears before analysis finishes');
  assert.equal(s.requests.length, 0, 'the paid request waits for optional analysis');
  const engineEvidence = { positionKey: 'agent-validates-this', source: 'local-katago', perspective: 'black',
    visits: 4, winRateBlack: 50, candidates: [{ point: { x: 3, y: 3 }, visits: 4 }] };
  analyses[0].resolve(engineEvidence);
  await settle();
  assert.equal(agentRequests.length, 1);
  assert.equal(agentRequests[0].engineEvidence, engineEvidence, 'the hook forwards evidence without interpreting it');
  assert.equal(s.requests.length, 1);
  const answer = s.respondChoice(0, 'group.C7');
  await pending;
  assert.equal(s.render().coach.text, answer.replace('C7', '圈出的这里'));
  assert.deepEqual(s.api.coach.hintPoints, [{ x: 2, y: 2, label: 'C7' }]);
  assert.equal(s.api.coach.loading, false);
});

for (const change of ['cancel', 'position-before-render', 'same-size-reset', 'config']) {
  test(`${change} while awaiting engine analysis prevents any late paid request`, async t => {
    const s = await setup(t);
    let finishAnalysis, signal;
    s.options.analyze = (_position, requestSignal) => {
      signal = requestSignal;
      return new Promise(resolve => { finishAnalysis = resolve; });
    };
    const pending = s.render().coach.ask('hint');
    await settle();
    assert.equal(s.requests.length, 0);
    if (change === 'cancel') s.api.coach.cancel();
    if (change === 'position-before-render') move(s, 2, 2);
    if (change === 'same-size-reset') { s.api.state.writePosition(createInitialPosition(9)); s.render(); }
    if (change === 'config') { s.options.config = { ...s.options.config, model: 'new-model' }; s.render(); }
    assert.equal(signal.aborted, change !== 'position-before-render');
    // Deliberately ignore abort in this adapter: ownership must still reject it.
    finishAnalysis(undefined);
    await pending;
    await settle();
    assert.equal(s.requests.length, 0);
    assert.equal(s.render().coach.loading, false);
    assert.equal(s.api.coach.source, 'local');
    assert.equal(s.api.coach.error, undefined);
  });
}

test('unavailable engine analysis still allows the agent to explain verified rules', async t => {
  const s = await setup(t);
  s.options.analyze = async () => { throw new Error('model unavailable'); };
  const pending = s.render().coach.ask('explain-last-move');
  await settle();
  assert.equal(s.requests.length, 1);
  assert.equal(s.render().coach.source, 'local');
  const answer = s.respondChoice(0, 'concept.liberties');
  await pending;
  assert.equal(s.render().coach.source, 'cloud');
  assert.equal(s.api.coach.text, answer);
  assert.equal(s.api.coach.error, undefined);
});

test('unconfigured local guidance does not start engine analysis', async t => {
  const s = await setup(t, { endpoint: '', model: '', apiKey: '' });
  let analyses = 0;
  s.options.analyze = async () => { analyses++; return undefined; };
  await s.render().coach.ask('hint');
  assert.equal(analyses, 0);
  assert.equal(s.requests.length, 0);
  assert.equal(s.render().coach.configured, false);
  assert.ok(s.api.coach.text.length > 0);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { setup, settle } from './helpers/coachSession.mjs';

const { coachPositionKey, getDefaultKomi } = await loadTestModule({
  contents: `export { coachPositionKey } from './domains/coach/evidence';
    export { getDefaultKomi } from './core/go/config';`,
});
function engine(position) {
  return { positionKey: coachPositionKey(position, position.currentPlayer, getDefaultKomi(position.board.length)),
    source: 'local-katago', perspective: 'black', visits: 8,
    candidates: [{ point: { x: 3, y: 3 }, visits: 7 }] };
}
function finishEngineReply(s, index) {
  const evidence = JSON.parse(s.requests[index].init.body).evidence;
  assert.equal(evidence.engineAnalysis.candidates[0].point.label, 'D6');
  s.respond(index, JSON.stringify({ kind: 'explain', text: '可以试下D6，观察棋块周围的空点。', refs: ['engine.D6'] }));
}

test('an offline fallback can refresh on the same position when local analysis becomes available', async t => {
  const s = await setup(t, { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' });
  let ready = false, analyses = 0;
  s.options.analyze = async position => { analyses++; return ready ? engine(position) : undefined; };
  s.render();
  await s.api.coach.ask('hint');
  assert.deepEqual(s.render().coach.hintPoints, []);
  ready = true;
  await s.api.coach.ask('hint');
  assert.equal(analyses, 2, 'a previous missing model must not permanently suppress analysis');
  assert.deepEqual(s.render().coach.hintPoints, [{ x: 3, y: 3, label: 'D6' }]);
  await s.api.coach.ask('hint');
  assert.equal(analyses, 2, 'completed analysis may be reused for this unchanged position');
  assert.equal(s.requests.length, 0);
});

test('a cloud answer without requested engine evidence is refreshed after the model becomes available', async t => {
  const s = await setup(t);
  let ready = false, analyses = 0;
  s.options.analyze = async position => { analyses++; return ready ? engine(position) : undefined; };
  s.render();
  const first = s.api.coach.ask('hint');
  await settle();
  assert.equal(s.requests.length, 1);
  s.respondChoice(0, 'current');
  await first;
  assert.equal(s.render().coach.source, 'cloud');
  ready = true;
  const refreshed = s.api.coach.ask('hint');
  await settle();
  assert.equal(analyses, 2);
  assert.equal(s.requests.length, 2, 'new engine evidence should reach a second cloud explanation');
  finishEngineReply(s, 1);
  await refreshed;
  assert.equal(s.render().coach.text, '可以试下这里，观察棋块周围的空点。');
  await s.api.coach.ask('hint');
  assert.equal(analyses, 2);
  assert.equal(s.requests.length, 2, 'the completed engine-backed answer is cached');
});

test('a review with intentionally no analyzer still reuses its completed answer', async t => {
  const s = await setup(t);
  s.options.playing = false;
  s.render();
  await settle();
  const first = s.api.coach.ask('hint');
  await settle();
  s.respondChoice(0, 'current');
  await first;
  s.render();
  await s.api.coach.ask('hint');
  assert.equal(s.requests.length, 1);
  assert.equal(s.render().coach.loading, false);
  assert.equal(s.api.coach.conversation.length, 1);
});

test('returning from review to play does not let an engine-free cached reply bypass analysis', async t => {
  const s = await setup(t);
  s.options.playing = false;
  s.render();
  await settle();
  const review = s.api.coach.ask('hint');
  await settle();
  s.respondChoice(0, 'current');
  await review;
  s.render();
  let analyses = 0;
  s.options.playing = true;
  s.options.analyze = async position => { analyses++; return engine(position); };
  s.render();
  await settle();
  const resumed = s.api.coach.ask('hint');
  await settle();
  assert.equal(analyses, 1);
  assert.equal(s.requests.length, 2);
  finishEngineReply(s, 1);
  await resumed;
  assert.deepEqual(s.render().coach.hintPoints, [{ x: 3, y: 3, label: 'D6' }]);
});

test('the same follow-up question is answered again when the actual conversation has changed topic', async t => {
  const s = await setup(t);
  async function answer(question, id = 'current') {
    const index = s.requests.length;
    const pending = s.api.coach.ask('hint', question);
    await settle();
    assert.equal(s.requests.length, index + 1, 'a changed conversation is a changed provider context');
    const evidence = JSON.parse(s.requests[index].init.body).evidence;
    s.respondChoice(index, id);
    await pending;
    s.render();
    return evidence.conversation;
  }
  await answer('开局从哪里下？', 'concept.opening');
  const firstFollowup = await answer('为什么？');
  assert.equal(firstFollowup.at(-1).question, '开局从哪里下？');
  await answer('数气是什么意思？', 'concept.liberties');
  const secondFollowup = await answer('为什么？');
  assert.equal(secondFollowup.at(-1).question, '数气是什么意思？');
  assert.notDeepEqual(secondFollowup, firstFollowup);
  assert.equal(s.requests.length, 4);
});

test('a silently rejected answer can be retried manually without caching the temporary fallback', async t => {
  const s = await setup(t);
  const first = s.api.coach.ask('hint');
  await settle();
  s.respond(0, JSON.stringify({ kind: 'explain', text: 'A1已经必胜。', refs: ['invented'] }));
  await first;
  const local = s.render().coach;
  assert.equal(local.source, 'local');
  assert.equal(local.error, undefined);
  assert.ok(local.text);
  assert.equal(s.requests.length, 1, 'failure never issues an automatic paid retry');
  const retry = s.api.coach.ask('hint');
  await settle();
  assert.equal(s.requests.length, 2, 'the learner can request the same explanation again');
  s.respondChoice(1, 'current');
  await retry;
  assert.equal(s.render().coach.source, 'cloud');
  assert.equal(s.api.coach.error, undefined);
  await s.api.coach.ask('hint');
  assert.equal(s.requests.length, 2, 'only the validated answer is reused');
});

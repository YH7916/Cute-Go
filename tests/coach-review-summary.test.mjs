import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, makeHumanTurn, move, setAgentInterceptor, settle, setup } from './helpers/coachSession.mjs';

const offline = { endpoint: '', model: '', apiKey: '' };
const points = [{ x: 1, y: 1, label: 'B8' }, { x: 3, y: 3, label: 'D6' }, { x: 6, y: 6, label: 'G3' }];
function publish(text, hintPoints) {
  setAgentInterceptor((input, _signal, run) => input.proactive ? run() : Promise.resolve({
    text, hintPoints, source: 'local', configured: false, moveNumber: input.position.history.length,
  }));
}
async function localReview(t, text, hintPoints = points) {
  const s = await setup(t, offline);
  s.options.playing = false;
  s.render();
  await settle();
  publish(text, hintPoints);
  await s.render().coach.ask('hint');
  s.render();
  return s;
}

test('review keeps one complete cloud teaching part and only the point named by that part', async t => {
  const s = await setup(t);
  s.options.playing = false;
  await makeHumanTurn(s);
  const position = s.api.state.readPosition();
  const pending = s.api.coach.ask('hint');
  await settle();
  s.respond(0, JSON.stringify({ kind: 'explain', parts: [
    { id: 'group.C7', variant: 0 }, { id: 'group.G3', variant: 0 },
  ] }));
  await pending;
  const { coach } = s.render();
  assert.equal(coach.text, '圈出的这里 这块黑棋有1颗棋子，共有4口气；气数描述当前出口，不能单凭它判断死活。');
  assert.deepEqual(coach.hintPoints, [{ x: 2, y: 2, label: 'C7' }]);
  assert.equal(coach.source, 'cloud');
  assert.match(coach.conversation[0].answer, /①.*黑棋.*\n②.*白棋/);
  assert.equal(s.api.state.readPosition(), position);
  assert.equal(s.requests.length, 1);
});

test('review joins every sentence of the first nonempty part without losing its conditions', async t => {
  const s = await localReview(t, '\n  \n③ 这里落子后有两口气。只验证当前一步，不证明已活！若遇到劫，还要先按规则核验。\n① 这是另一个要点。');
  assert.equal(s.api.coach.text, '圈出的这里 这里落子后有两口气；只验证当前一步，不证明已活；若遇到劫，还要先按规则核验。');
  assert.deepEqual(s.api.coach.hintPoints, [points[2]]);
  assert.doesNotMatch(s.api.coach.text, /[①②③]|另一个要点|\n/);
  assert.equal([...s.api.coach.text.matchAll(/[。！？]/g)].length, 1);
});

test('review renumbers retained references in prose order and drops every unmentioned point', async t => {
  const s = await localReview(t, '先看②，再比较③。② 的气仍要重新数，不能只看棋子数量。\n① 这一块另说。');
  assert.equal(s.api.coach.text, '先看①，再比较②；① 的气仍要重新数，不能只看棋子数量。');
  assert.deepEqual(s.api.coach.hintPoints, [points[1], points[2]]);
});

test('an unnumbered ring is restored correctly and an unmarked lesson draws no leftover rings', async t => {
  const single = await localReview(t, '圈出的这里只剩一口气。还要检查能否合法提子。\n再看围空。', [points[1]]);
  assert.equal(single.api.coach.text, '圈出的这里只剩一口气；还要检查能否合法提子。');
  assert.deepEqual(single.api.coach.hintPoints, [points[1]]);
  publish('气要看整块棋。重复的空点只算一次。\n① 是另一个要点。', points);
  await single.api.coach.ask('hint');
  assert.equal(single.render().coach.text, '气要看整块棋；重复的空点只算一次。');
  assert.deepEqual(single.api.coach.hintPoints, []);
  publish('  \n ', points);
  await single.api.coach.ask('hint');
  assert.equal(single.render().coach.text, '');
  assert.deepEqual(single.api.coach.hintPoints, []);
});

test('playing retains the complete answer and all original marks before and after visiting review', async t => {
  const s = await setup(t, offline);
  const text = '① 这块多出了出口。暂时解了打吃，不等于做活。\n② 这一块也要照顾；③ 是它的出口。';
  publish(text, points);
  await s.api.coach.ask('hint');
  assert.equal(s.render().coach.text, text);
  assert.deepEqual(s.api.coach.hintPoints, points);
  s.options.playing = false;
  s.render();
  await settle();
  assert.equal(s.render().coach.text, '圈出的这里 这块多出了出口；暂时解了打吃，不等于做活。');
  assert.deepEqual(s.api.coach.hintPoints, [points[0]]);
  assert.equal(s.api.coach.conversation[0].answer, text, 'summary presentation must not replace the stored full answer');
  s.options.playing = true;
  s.render();
  await settle();
  assert.equal(s.render().coach.text, text);
  assert.deepEqual(s.api.coach.hintPoints, points);
  assert.equal(s.api.coach.conversation[0].answer, text);
});

test('summarizing an old reviewed answer never projects its rings onto a newer or reset board', async t => {
  const s = await setup(t, offline);
  move(s, 2, 2);
  s.render();
  await settle();
  const explained = s.api.state.readPosition();
  const text = '① 这里要先看气。多出气不等于做活。\n② 是另一个要点。';
  publish(text, points.slice(0, 2));
  await s.render().coach.ask('hint');
  move(s, 6, 6);
  const live = s.api.state.readPosition();
  assert.equal(s.render().coach.text, text);
  assert.deepEqual(s.api.coach.hintPoints, [], 'published history stays readable but its rings do not enter the live board');
  s.options.playing = false;
  s.api.state.writePosition(explained);
  assert.equal(s.render().coach.text, '圈出的这里 这里要先看气；多出气不等于做活。');
  assert.deepEqual(s.api.coach.hintPoints, [points[0]]);
  s.api.state.writePosition(live);
  assert.equal(s.render().coach.text, '');
  assert.deepEqual(s.api.coach.hintPoints, []);
  s.api.state.writePosition(createInitialPosition(9));
  assert.equal(s.render().coach.text, '');
  assert.deepEqual(s.api.coach.hintPoints, []);
  assert.deepEqual(s.api.coach.conversation, []);
});

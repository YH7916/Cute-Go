import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, setAgentInterceptor, settle, setup, move } from './helpers/coachSession.mjs';

const offline = { endpoint: '', model: '', apiKey: '' };

function playHumanSelfAtari(s) {
  const position = createInitialPosition(9);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) {
    position.board[y][x] = { color: 'white', x, y, id: `white-${x}-${y}` };
  }
  s.api.state.writePosition(position);
  move(s, 1, 1);
  assert.equal(s.api.state.readPosition().currentPlayer, 'white');
  s.render();
}

test('a completed warning after the human move stays readable through an ordinary AI reply', async t => {
  const s = await setup(t, offline);
  playHumanSelfAtari(s);
  await settle();
  const warning = s.render().coach.text;
  const explainedPosition = s.api.state.readPosition();
  assert.match(warning, /一口气|1口气/, 'the real rules must detect the human self-atari');
  assert.equal(s.api.coach.loading, false);
  assert.ok(s.api.coach.hintPoints.length > 0, 'the original warning refers to an actual liberty');

  move(s, 6, 6);
  assert.equal(s.api.state.readPosition().currentPlayer, 'black');
  assert.equal(s.render().coach.text, warning, 'the position transition must not flash away the readable warning');
  assert.deepEqual(s.api.coach.hintPoints, [], 'old circles must disappear before the new inspection completes');
  assert.equal(s.api.coach.previousPosition, explainedPosition);
  await settle();
  assert.equal(s.render().coach.text, warning, 'a silent inspection of the ordinary reply must not erase the warning');
  assert.equal(s.api.coach.previousPosition, explainedPosition, 'historical guidance retains its original complete position');
  assert.equal(s.api.coach.moveNumber, explainedPosition.history.length, 'the label must identify the explained move');
  assert.deepEqual(s.api.coach.hintPoints, [], 'historical advice cannot draw markers on the current board');
  assert.equal(s.api.coach.loading, false);
  assert.equal(s.requests.length, 0, 'reading continuity must not start a cloud request');
});

test('an unfinished warning from the human position cannot publish after the AI reply', async t => {
  const s = await setup(t, offline);
  let release;
  let pendingSignal;
  setAgentInterceptor((input, signal, run) => input.kind === 'inspect' && input.position.currentPlayer === 'white'
    ? new Promise(resolve => { release = () => resolve(run()); pendingSignal = signal; }) : run());
  playHumanSelfAtari(s);
  assert.equal(typeof release, 'function');
  assert.equal(s.api.coach.text, '');
  move(s, 6, 6);
  assert.equal(pendingSignal.aborted, false, 'the synchronous write precedes effect cleanup');
  release();
  await settle();
  s.render();
  await settle();
  assert.equal(s.render().coach.text, '', 'only already published guidance may survive; late results still belong to the old position');
  assert.deepEqual(s.api.coach.hintPoints, []);
  assert.equal(s.requests.length, 0);
});

test('resetting the game clears a previously completed warning', async t => {
  const s = await setup(t, offline);
  playHumanSelfAtari(s);
  await settle();
  assert.ok(s.render().coach.text.length > 0);
  s.api.state.writePosition(createInitialPosition(9));
  assert.equal(s.render().coach.text, '');
  await settle();
  assert.equal(s.render().coach.text, '');
  assert.deepEqual(s.api.coach.hintPoints, []);
});

test('the next human move clears the previous-turn warning', async t => {
  const s = await setup(t, offline);
  playHumanSelfAtari(s);
  await settle();
  const warning = s.render().coach.text;
  assert.ok(warning.length > 0);
  move(s, 6, 6);
  s.render();
  await settle();
  assert.equal(s.render().coach.text, warning);

  move(s, 4, 4);
  assert.equal(s.render().coach.text, '', 'the reading window ends when the player acts again');
  assert.ok(s.api.coach.previousPosition == null);
  await settle();
  assert.equal(s.render().coach.text, '', 'a new quiet turn must not revive the earlier warning');
  assert.ok(s.api.coach.previousPosition == null);
  assert.deepEqual(s.api.coach.hintPoints, []);
});

for (const change of ['owner', 'exit']) {
  test(`${change} clears an already published warning retained after the AI reply`, async t => {
    const s = await setup(t, offline);
    playHumanSelfAtari(s);
    await settle();
    const warning = s.render().coach.text;
    assert.ok(warning.length > 0);
    move(s, 6, 6);
    s.render();
    await settle();
    assert.equal(s.render().coach.text, warning);

    if (change === 'owner') s.options.ownerScopeId = 'account:another-player';
    else s.options.active = false;
    assert.equal(s.render().coach.text, '', 'the previous session cannot retain readable guidance');
    assert.ok(s.api.coach.previousPosition == null);
    await settle();
    assert.equal(s.render().coach.text, '');
    assert.ok(s.api.coach.previousPosition == null);
    assert.deepEqual(s.api.coach.hintPoints, []);
  });
}

test('an AI capture retains the historical warning without marking the removed stone on the live board', async t => {
  const s = await setup(t, offline);
  playHumanSelfAtari(s);
  await settle();
  const warning = s.render().coach.text;
  const explainedPosition = s.api.state.readPosition();
  assert.ok(warning.length > 0);
  move(s, 1, 2);
  assert.equal(s.api.state.readPosition().board[1][1], null);
  assert.equal(s.api.state.readPosition().whiteCaptures, 1);
  assert.equal(s.render().coach.text, warning);
  assert.deepEqual(s.api.coach.hintPoints, []);
  await settle();
  assert.equal(s.render().coach.text, warning);
  assert.equal(s.api.coach.previousPosition, explainedPosition);
  assert.equal(s.api.coach.previousPosition.board[1][1].color, 'black', 'review must retain the stone before it was captured');
  assert.equal(s.api.coach.moveNumber, explainedPosition.history.length);
  assert.deepEqual(s.api.coach.hintPoints, []);
});

test('returning to the explained snapshot preserves its completed cloud answer', async t => {
  const s = await setup(t);
  playHumanSelfAtari(s);
  await settle();
  const explainedPosition = s.api.state.readPosition();
  const pending = s.render().coach.ask('explain-last-move');
  await settle();
  const completed = s.respondChoice(0, 'concept.atari');
  await pending;
  assert.equal(s.render().coach.text, completed);
  move(s, 6, 6);
  s.render();
  await settle();
  assert.equal(s.render().coach.text, completed);
  s.api.state.writePosition(explainedPosition);
  s.options.playing = false;
  const summary = '只剩一口气叫打吃；可以检查接长、连接或吃子能否解围；多出气不等于做活，一口气也不一定能被合法吃掉。';
  assert.equal(s.render().coach.text, summary);
  await settle();
  assert.equal(s.render().coach.text, summary, 'reinspection must not replace the explanation the user chose to review');
  assert.equal(s.api.coach.conversation.at(-1).answer, completed, 'summarizing the reviewed answer must not rewrite history');
  assert.equal(s.api.coach.source, 'cloud');
});

test('a failed inspection after an AI reply does not erase completed guidance', async t => {
  const s = await setup(t, offline);
  playHumanSelfAtari(s);
  await settle();
  const warning = s.render().coach.text;
  const explainedPosition = s.api.state.readPosition();
  setAgentInterceptor(() => Promise.reject(new Error('inspection failed')));
  move(s, 6, 6);
  s.render();
  await settle();
  assert.equal(s.render().coach.text, warning);
  assert.equal(s.api.coach.previousPosition, explainedPosition);
  assert.deepEqual(s.api.coach.hintPoints, []);
});

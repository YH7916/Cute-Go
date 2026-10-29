import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, setAgentInterceptor, settle, setup, move } from './helpers/coachSession.mjs';

const offline = { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' };

function playHumanMove(s, selfAtari = false) {
  const position = createInitialPosition(9);
  for (const [x, y] of selfAtari ? [[0, 1], [1, 0], [2, 1]] : [[0, 1]]) {
    position.board[y][x] = { color: 'white', x, y, id: `white-${x}-${y}` };
  }
  s.api.state.writePosition(position);
  move(s, 1, 1);
  assert.equal(s.api.state.readPosition().currentPlayer, 'white');
  s.render();
}

async function explainHumanMove(s, selfAtari = false) {
  playHumanMove(s, selfAtari);
  await s.api.coach.ask('explain-last-move');
}

test('a completed manual explanation after the human move stays readable through an ordinary AI reply', async t => {
  const s = await setup(t, offline);
  await explainHumanMove(s);
  const warning = s.render().coach.text;
  const explainedPosition = s.api.state.readPosition();
  assert.match(warning, /气变少/, 'the manual explanation must describe the verified pressure');
  assert.equal(s.api.coach.loading, false);
  assert.ok(s.api.coach.hintPoints.length > 0, 'the manual explanation refers to the actual pressured group');

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

test('an unfinished manual explanation from the human position cannot publish after the AI reply', async t => {
  const s = await setup(t, offline);
  let release;
  let pendingSignal;
  setAgentInterceptor((input, signal, run) => input.kind === 'inspect' && input.position.currentPlayer === 'white'
    ? new Promise(resolve => { release = () => resolve(run()); pendingSignal = signal; }) : run());
  playHumanMove(s);
  const pending = s.api.coach.ask('explain-last-move');
  assert.equal(typeof release, 'function');
  assert.equal(s.api.coach.text, '');
  move(s, 6, 6);
  assert.equal(pendingSignal.aborted, false, 'the synchronous write precedes effect cleanup');
  release();
  await pending;
  await settle();
  s.render();
  await settle();
  assert.equal(s.render().coach.text, '', 'only already published guidance may survive; late results still belong to the old position');
  assert.deepEqual(s.api.coach.hintPoints, []);
  assert.equal(s.requests.length, 0);
});

test('resetting the game clears a previously completed manual explanation', async t => {
  const s = await setup(t, offline);
  await explainHumanMove(s);
  assert.ok(s.render().coach.text.length > 0);
  s.api.state.writePosition(createInitialPosition(9));
  assert.equal(s.render().coach.text, '');
  await settle();
  assert.equal(s.render().coach.text, '');
  assert.deepEqual(s.api.coach.hintPoints, []);
});

test('the next human move clears the previous-turn manual explanation', async t => {
  const s = await setup(t, offline);
  await explainHumanMove(s);
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
  test(`${change} clears an already published manual explanation retained after the AI reply`, async t => {
    const s = await setup(t, offline);
    await explainHumanMove(s);
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

test('an AI capture retains the manual historical warning without marking the removed stone on the live board', async t => {
  const s = await setup(t, offline);
  await explainHumanMove(s, true);
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
  playHumanMove(s);
  await settle();
  const explainedPosition = s.api.state.readPosition();
  const pending = s.render().coach.ask('explain-last-move', '什么叫打吃，怎样解围？');
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
  const summary = '只剩一口气就叫打吃。先检查能否接长或吃子解围。';
  assert.equal(s.render().coach.text, summary);
  await settle();
  assert.equal(s.render().coach.text, summary, 'reinspection must not replace the explanation the user chose to review');
  assert.equal(s.api.coach.conversation.at(-1).answer, completed, 'summarizing the reviewed answer must not rewrite history');
  assert.equal(s.api.coach.source, 'cloud');
});

test('a failed inspection after an AI reply does not erase completed manual guidance', async t => {
  const s = await setup(t, offline);
  await explainHumanMove(s);
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

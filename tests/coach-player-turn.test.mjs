import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, setAgentInterceptor, settle, setup, move, makeNewAtari } from './helpers/coachSession.mjs';

const offline = { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' };

function selfAtari(s, color) {
  const position = createInitialPosition(9);
  position.currentPlayer = color;
  const opponent = color === 'black' ? 'white' : 'black';
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) {
    position.board[y][x] = { color: opponent, x, y, id: `${opponent}-${x}-${y}` };
  }
  s.api.state.writePosition(position);
  move(s, 1, 1);
  s.render();
}

for (const color of ['black', 'white']) {
  test(`${color}: automatic guidance waits for the opponent and explains the player's next move`, async t => {
    const s = await setup(t, offline);
    s.options.userColor = color;
    const calls = [];
    setAgentInterceptor((input, _signal, run) => { calls.push(input); return run(); });
    selfAtari(s, color);
    await settle();
    assert.equal(s.render().coach.text, '', 'do not flash a commentary while the opponent is about to move');
    assert.equal(calls.length, 0, 'the intermediate opponent-turn position does not start an inspection');

    move(s, 6, 6);
    s.render();
    await settle();
    const coach = s.render().coach;
    assert.match(coach.text, /你可以在这里接长.*解除打吃/, 'a still-threatened group needs current escape advice even after a quiet opponent reply');
    assert.doesNotMatch(coach.text, /对手下一手|红点这块/, 'guidance is about what the player can do now');
    assert.deepEqual(coach.hintPoints, [{ x: 1, y: 2, label: 'B7' }]);
    assert.equal(coach.previousPosition, undefined);
    assert.equal(coach.moveNumber, 2);
    assert.ok(calls.every(input => input.intent === 'hint' && input.position.currentPlayer === color));
    t.mock.timers.tick(5000);
    await settle();
    assert.equal(s.render().coach.text, coach.text, 'the player can read the explanation without a dismissal timer');

    move(s, 1, 2);
    assert.equal(s.render().coach.text, '', 'acting ends this decision window');
    assert.deepEqual(s.api.coach.hintPoints, [], 'old suggested intersections cannot remain on the changed board');
    await settle();
    assert.equal(s.render().coach.text, '');
    assert.equal(calls.length, 1);
    assert.equal(s.requests.length, 0);
  });
}

test('an opponent capture never leaves a transient escape suggestion for an already removed stone', async t => {
  const s = await setup(t, offline);
  selfAtari(s, 'black');
  await settle();
  assert.equal(s.render().coach.text, '');
  move(s, 1, 2);
  s.render();
  await settle();
  assert.equal(s.api.state.readPosition().board[1][1], null);
  assert.equal(s.render().coach.text, '');
  assert.deepEqual(s.api.coach.hintPoints, []);
  assert.equal(s.api.coach.previousPosition, undefined);
});

test('automatic cloud enrichment uses the same player-turn hint as the local preview', async t => {
  const s = await setup(t);
  const calls = [];
  setAgentInterceptor((input, _signal, run) => { calls.push(input); return run(); });
  await makeNewAtari(s);
  const local = s.api.coach.text;
  assert.match(local, /你可以在这里接长.*解除打吃/);
  t.mock.timers.tick(700);
  await settle();
  assert.equal(s.requests.length, 1);
  const evidence = JSON.parse(s.requests[0].init.body).evidence;
  assert.equal(evidence.teachingRequest.intent, 'hint');
  assert.equal(evidence.toPlay, evidence.userColor);
  assert.equal(evidence.teachingChoices.some(choice => choice.id === 'last-action'), false);
  assert.ok(calls.every(input => input.intent === 'hint' && input.proactive));
  s.respondChoice(0, 'current');
  await settle();
  assert.equal(s.render().coach.text, local);
  assert.equal(s.api.coach.source, 'cloud');
  assert.equal(s.api.coach.loading, false);
});

test('a player-turn preview finishing after the player moves cannot reappear during the opponent turn', async t => {
  const s = await setup(t, offline);
  let release;
  setAgentInterceptor((input, _signal, run) => input.proactive
    ? new Promise(resolve => { release = () => resolve(run()); }) : run());
  await makeNewAtari(s);
  assert.equal(typeof release, 'function');
  move(s, 1, 2);
  release();
  await settle();
  assert.equal(s.render().coach.text, '');
  assert.deepEqual(s.api.coach.hintPoints, []);
  assert.equal(s.api.coach.loading, false);
});

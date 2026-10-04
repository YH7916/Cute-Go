import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, move, settle, createInitialPosition, setAgentInterceptor } from './helpers/coachSession.mjs';

const offline = { endpoint: '', model: '', apiKey: '' };

test('manual local teaching remains available after the game ends', async t => {
  const s = await setup(t, offline);
  s.options.gameOver = true;
  s.render();
  await s.api.coach.ask('explain-position', '结束以后怎么看这盘棋？');
  const coach = s.render().coach;
  assert.ok(coach.text.length > 0);
  assert.equal(coach.conversation.length, 1);
  assert.equal(s.requests.length, 0);
});

test('conversation keeps six position-bound turns across moves and clears on reset or owner change', async t => {
  const s = await setup(t, offline);
  for (let n = 0; n < 8; n += 1) {
    await s.api.coach.ask('hint', `问题 ${n}`);
    s.render();
  }
  assert.equal(s.api.coach.conversation.length, 6);
  assert.equal(s.api.coach.conversation[0].question, '问题 2');
  const earlier = s.api.coach.conversation.at(-1);
  move(s, 2, 2);
  s.render();
  await settle();
  const inputs = [];
  setAgentInterceptor((input, _signal, next) => { inputs.push(input); return next(); });
  await s.api.coach.ask('hint', '刚才为什么那么说？');
  assert.ok(inputs.some(input => input.history.some(turn => turn.positionKey === earlier.positionKey)));
  assert.equal(earlier.position.board[2][2], null, 'stored turn retains the board it described');
  s.options.ownerScopeId = 'account:other';
  assert.deepEqual(s.render().coach.conversation, []);
  await s.api.coach.ask('hint');
  assert.equal(s.render().coach.conversation.length, 1);
  s.api.state.writePosition(createInitialPosition(9));
  assert.deepEqual(s.render().coach.conversation, []);
});

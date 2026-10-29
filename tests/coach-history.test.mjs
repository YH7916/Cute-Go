import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, move, settle, createInitialPosition, setAgentInterceptor, makeHumanTurn } from './helpers/coachSession.mjs';

const offline = { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' };

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

test('numbered follow-ups send the completed answer marker mapping while UI history keeps its prose', async t => {
  const s = await setup(t);
  await makeHumanTurn(s);
  const first = s.api.coach.ask('explain-position', '比较 C7 和 G3 的气。');
  await settle();
  s.respond(0, JSON.stringify({ kind: 'explain', parts: [
    { id: 'group.G3', variant: 0 }, { id: 'group.C7', variant: 0 },
  ] }));
  await first;
  const displayed = s.render().coach.text;
  assert.match(displayed, /①.*白棋.*②.*黑棋/s);
  const next = s.api.coach.ask('explain-position', '②为什么有这么多气？');
  await settle();
  try {
    const body = JSON.parse(s.requests[1].init.body);
    assert.equal(body.question, '②为什么有这么多气？');
    const turn = body.evidence.conversation[0];
    assert.equal(turn.position, 'current');
    assert.ok(turn.answer.startsWith(displayed));
    assert.match(turn.answer, /标记：①=G3，②=C7/);
    assert.equal(s.render().coach.conversation[0].answer, displayed);
    assert.doesNotMatch(s.api.coach.conversation[0].answer, /G3|C7|标记/);
  } finally { s.api.coach.cancel(); await next; }
});

test('a single-point historical answer keeps its here mapping and remains earlier after moves', async t => {
  const s = await setup(t);
  await makeHumanTurn(s);
  const first = s.api.coach.ask('explain-position', 'C7 有几口气？');
  await settle();
  s.respondChoice(0, 'group.C7');
  await first;
  const displayed = s.render().coach.text;
  assert.match(displayed, /这里/);
  move(s, 3, 2); move(s, 6, 5);
  s.render(); await settle(); s.render();
  const next = s.api.coach.ask('explain-position', '刚才说的这里为什么？');
  await settle();
  try {
    const body = JSON.parse(s.requests[1].init.body);
    const turn = body.evidence.conversation[0];
    assert.equal(turn.position, 'earlier');
    assert.equal(turn.answer, `${displayed}\n标记：这里=C7`);
    assert.equal(s.render().coach.conversation[0].answer, displayed);
    assert.doesNotMatch(JSON.stringify(body.evidence), /positionKey/);
  } finally { s.api.coach.cancel(); await next; }
});

test('long marked local history reserves mapping space within existing limits and removes secrets', async t => {
  const s = await setup(t);
  const points = [{ x: 2, y: 2, label: 'C7' }, { x: 6, y: 6, label: 'G3' }, { x: 3, y: 5, label: 'D4' }];
  let replies = 0;
  const displayed = `①和②需比较气，③可以试下。test-secret${'这是已有的本地完整讲解。'.repeat(30)}`;
  setAgentInterceptor((input, _signal, run) => input.kind === 'ask' && replies++ < 7 ? Promise.resolve({
    text: displayed, hintPoints: points, source: 'local', configured: true, moveNumber: input.position.history.length,
  }) : run());
  for (let index = 0; index < 7; index++) {
    await s.api.coach.ask('explain-position', `问题${index}`);
    s.render();
  }
  assert.equal(s.api.coach.conversation.length, 6);
  assert.equal(s.api.coach.conversation.at(-1).answer, displayed);
  points[0].label = 'A1';
  const next = s.api.coach.ask('explain-position', '②为什么？');
  await settle();
  try {
    const body = JSON.parse(s.requests[0].init.body);
    assert.deepEqual(body.evidence.conversation.map(turn => turn.question), ['问题4', '问题5', '问题6']);
    for (const turn of body.evidence.conversation) {
      assert.equal(turn.position, 'current');
      assert.ok(turn.answer.length <= 200);
      assert.match(turn.answer, /标记：①=C7，②=G3，③=D4$/);
    }
    assert.ok(JSON.stringify(body.evidence).length <= 6000);
    assert.doesNotMatch(JSON.stringify(body.evidence), /test-secret|positionKey|①=A1/);
    assert.equal(s.render().coach.conversation.at(-1).answer, displayed);
  } finally { s.api.coach.cancel(); await next; }
});

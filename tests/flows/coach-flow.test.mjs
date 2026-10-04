import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialPosition, makeHumanTurn, move, setup, settle } from '../helpers/coachSession.mjs';

function evidenceFor(request) {
  const body = JSON.parse(request.init.body);
  assert.equal(request.url, 'https://coach.example/v1/chat/completions');
  assert.equal(body.model, 'test-coach');
  assert.equal(body.stream, false);
  assert.equal(new Headers(request.init.headers).get('Authorization'), 'Bearer test-secret');
  assert.ok(!request.init.body.includes('test-secret'), 'the secret belongs only in the authorization header');
  const content = body.messages[1].content;
  const prefix = '局面证据：\n';
  const separator = '\n玩家问题：';
  assert.ok(content.startsWith(prefix));
  assert.ok(content.includes(separator));
  return JSON.parse(content.slice(prefix.length, content.indexOf(separator)));
}

test('陪练固定流程：讲解成功 → 401 → 继续落子 → 恢复 → 请求中重开 → 拒绝旧回复 → 新局讲解', { timeout: 10000 }, async t => {
  // Reuse the existing hook host and real runtime/provider implementation.
  // Only HTTP responses are controlled; this does not claim browser or ONNX coverage.
  const session = await setup(t);
  assert.equal(session.api.coach.configured, true);
  assert.equal(session.api.coach.text, '', 'entering an empty game stays quiet');
  assert.equal(session.requests.length, 0, 'entry must not spend an API request');

  await makeHumanTurn(session);
  const twoMoves = structuredClone(session.api.state.readPosition());
  const first = session.api.coach.ask('explain-last-move', '这一手我应该留意什么？');
  await settle();
  assert.equal(session.requests.length, 1);
  assert.equal(session.render().coach.loading, true);
  const firstEvidence = evidenceFor(session.requests[0]);
  assert.equal(firstEvidence.boardSize, 9);
  assert.equal(firstEvidence.moveNumber, 2);
  assert.equal(firstEvidence.stones.length, 2);
  assert.deepEqual(firstEvidence.stones.map(stone => ({ color: stone.color, x: stone.point.x, y: stone.point.y })), [
    { color: 'black', x: 2, y: 2 }, { color: 'white', x: 6, y: 6 },
  ]);
  const firstReply = session.respondChoice(0, 'concept.connection');
  await first;
  assert.equal(session.render().coach.text, firstReply);
  assert.equal(session.api.coach.source, 'cloud');
  assert.equal(session.api.coach.loading, false);
  assert.equal(session.api.coach.error, undefined);
  assert.deepEqual(session.api.state.readPosition(), twoMoves, 'explaining never changes the position');

  const failed = session.api.coach.ask('hint');
  await settle();
  assert.equal(session.requests.length, 2);
  const fallbackText = session.render().coach.text;
  assert.ok(fallbackText.length > 0, 'a manual request has usable local guidance while waiting');
  session.requests[1].resolve(new Response('upstream private diagnostic must not be displayed', { status: 401 }));
  await failed;
  assert.equal(session.render().coach.source, 'local');
  assert.equal(session.api.coach.text, fallbackText);
  assert.equal(session.api.coach.loading, false);
  assert.match(session.api.coach.error, /服务未授权.*密钥.*模型权限/);
  assert.doesNotMatch(session.api.coach.error, /private diagnostic|test-secret/);
  assert.deepEqual(session.api.state.readPosition(), twoMoves, 'provider rejection preserves the game');

  move(session, 3, 2);
  move(session, 6, 5);
  session.render();
  await settle();
  session.render();
  const fourMoves = structuredClone(session.api.state.readPosition());
  assert.equal(fourMoves.history.length, 4, 'both players can keep playing after a provider failure');
  assert.equal(fourMoves.board.flat().filter(Boolean).length, 4);
  assert.equal(fourMoves.currentPlayer, 'black');
  assert.equal(session.api.coach.error, undefined, 'old errors do not follow a changed position');
  const recovered = session.api.coach.ask('hint');
  await settle();
  assert.equal(session.requests.length, 3);
  const recoveredEvidence = evidenceFor(session.requests[2]);
  assert.equal(recoveredEvidence.moveNumber, 4);
  assert.equal(recoveredEvidence.stones.length, 4);
  const recoveredReply = session.respondChoice(2, 'group.C7');
  await recovered;
  assert.equal(session.render().coach.text, recoveredReply.replace('C7', '圈出的这里'));
  assert.deepEqual(session.api.coach.hintPoints, [{ x: 2, y: 2, label: 'C7' }]);
  assert.equal(session.api.coach.source, 'cloud');
  assert.equal(session.api.coach.error, undefined);
  assert.equal(session.api.coach.loading, false);
  assert.deepEqual(session.api.state.readPosition(), fourMoves);

  const oldRequest = session.api.coach.ask('explain-last-move');
  await settle();
  assert.equal(session.requests.length, 4);
  assert.equal(session.render().coach.loading, true);
  const empty = createInitialPosition(9);
  session.api.state.writePosition(empty);
  session.render();
  assert.equal(session.requests[3].init.signal.aborted, true, 'reset cancels the old HTTP operation');
  await oldRequest;
  await settle();
  session.render();
  assert.equal(session.api.state.readPosition(), empty);
  assert.deepEqual(session.api.state.readPosition(), createInitialPosition(9));
  assert.equal(session.api.coach.text, '');
  assert.equal(session.api.coach.loading, false);
  assert.equal(session.api.coach.error, undefined);
  assert.deepEqual(session.api.coach.hintPoints, []);

  const freshRequest = session.api.coach.ask('hint');
  await settle();
  assert.equal(session.requests.length, 5);
  assert.equal(session.requests[4].init.signal.aborted, false);
  const freshEvidence = evidenceFor(session.requests[4]);
  assert.equal(freshEvidence.moveNumber, 0);
  assert.deepEqual(freshEvidence.stones, []);
  const staleReply = session.respondChoice(3, 'concept.capture');
  await settle();
  assert.equal(session.render().coach.loading, true, 'an old completion cannot clear the new request loading state');
  assert.notEqual(session.api.coach.text, staleReply);
  assert.equal(session.api.coach.error, undefined);
  assert.equal(session.api.state.readPosition(), empty);
  const freshReply = session.respondChoice(4, 'concept.opening');
  await freshRequest;
  assert.equal(session.render().coach.text, freshReply);
  assert.equal(session.api.coach.source, 'cloud');
  assert.equal(session.api.coach.loading, false);
  assert.equal(session.api.coach.error, undefined);
  assert.deepEqual(session.api.state.readPosition(), createInitialPosition(9));
  assert.equal(session.requests.length, 5, 'no automatic retry or duplicate billable request was introduced');
});

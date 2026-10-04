import assert from 'node:assert/strict';
import test from 'node:test';
import { setupAiSession as setup, createInitialPosition, recordMove } from './helpers/gameAiSession.mjs';

test('AI application session applies one deferred move and rejects a changed position', t => {
  const s = setup(t);
  const api = s.render();
  const { board, history } = api.state.readPosition();
  api.aiTurnLock.current = true;
  api.webAiEngine.requestWebAiMove(board, 'black', history);
  const worker = s.ready();
  s.reply(worker, worker.messages.at(-1));
  t.mock.timers.tick(200);
  assert.deepEqual(s.moves, [[2, 2, false]]);
  api.webAiEngine.requestWebAiMove(board, 'black', history);
  s.reply(worker, worker.messages.at(-1));
  api.state.writePosition(createInitialPosition(9));
  t.mock.timers.tick(200);
  assert.equal(s.moves.length, 1);
});

for (const pass of [false, true]) {
  test(`AI ${pass ? 'pass' : 'move'} requested before same-size import cannot change the imported game`, t => {
    const s = setup(t);
    const api = s.render();
    const position = api.state.readPosition();
    api.aiTurnLock.current = true;
    api.webAiEngine.requestWebAiMove(position.board, position.currentPlayer, position.history);
    const worker = s.ready();
    const request = worker.messages.at(-1);
    api.state.writePosition(createInitialPosition(9));
    s.render();
    worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
      data: { move: pass ? null : { x: 2, y: 2 }, winRate: 50, ownership: null } });
    t.mock.timers.tick(200);
    assert.deepEqual(s.moves, []);
    assert.equal(api.aiTurnLock.current, false, 'a rejected old reply must release the turn for retry');
    const current = api.state.readPosition();
    api.aiTurnLock.current = true;
    api.webAiEngine.requestWebAiMove(current.board, current.currentPlayer, current.history);
    s.reply(worker, worker.messages.at(-1));
    t.mock.timers.tick(200);
    assert.equal(s.moves.length, 1, 'the imported game can request a fresh move');
  });
}

test('analysis session consumes scoring once and ignores a reset before the reply', t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const request = { board: position.board, history: position.history, player: position.currentPlayer,
    captures: { black: 0, white: 0 }, komi: 3.5 };
  api.pendingEndGameRef.current = request;
  api.webAiEngine.requestAnalysis(position.board, 'black', []);
  const worker = s.ready();
  const compute = worker.messages.at(-1);
  s.reply(worker, compute);
  s.reply(worker, compute);
  assert.equal(s.endings.length, 1);
  assert.equal(api.pendingEndGameRef.current, null);
  assert.deepEqual(s.endings[0][2], s.render().state.finalScore, 'achievement calculation receives the exact adjudicated score');
  api.pendingEndGameRef.current = request;
  api.webAiEngine.requestAnalysis(position.board, 'black', []);
  api.state.writePosition(createInitialPosition(9));
  s.reply(worker, worker.messages.at(-1));
  assert.equal(s.endings.length, 1);
});

test('settlement cannot replace the recorded board with the dead-stone scoring board', t => {
  const s = setup(t);
  let api = s.render();
  const initial = api.state.readPosition();
  const board = initial.board.map(row => [...row]);
  board[2][2] = { x: 2, y: 2, color: 'black', id: 'recorded-stone' };
  const position = recordMove(initial, board, { x: 2, y: 2 }, 0, false);
  api.state.writePosition(position);
  api = s.render();
  api.pendingEndGameRef.current = { board: position.board, history: position.history,
    player: position.currentPlayer, captures: { black: 0, white: 0 }, komi: 3.5 };
  api.webAiEngine.requestAnalysis(position.board, position.currentPlayer, position.history);
  const worker = s.ready();
  s.reply(worker, worker.messages.at(-1), Array(81).fill(-1));
  assert.equal(s.endings.length, 1);
  assert.equal(api.state.readPosition(), position, 'the game record remains the last real action');
  api.state.setAppMode('review');
  api.state.setReviewIndex(position.history.length);
  api = s.render();
  assert.equal(api.review.position.board[2][2]?.id, 'recorded-stone');
  assert.deepEqual(s.endings[0][2], api.state.finalScore, 'settlement still supplies its adjudicated score');
});

for (const pass of [false, true]) {
  test(`canceling a game session rejects a late ${pass ? 'pass' : 'move'} without resetting the position or model`, t => {
    const s = setup(t);
    const api = s.render();
    const position = api.state.readPosition();
    api.aiTurnLock.current = true;
    api.setIsThinking(true);
    api.webAiEngine.requestWebAiMove(position.board, position.currentPlayer, position.history);
    const worker = s.ready();
    const old = worker.messages.at(-1);
    api.cancelAiSession();
    const lateReply = () => worker.emit({ type: 'ai-response', requestId: old.requestId, generation: old.generation,
      data: { move: pass ? null : { x: 2, y: 2 }, winRate: 50, ownership: null } });
    lateReply();
    t.mock.timers.tick(200);
    assert.deepEqual(s.moves, []);
    assert.equal(api.state.readPosition(), position, 'returning home does not reset the saved board');
    assert.equal(api.aiTurnLock.current, false);
    assert.equal(s.render().isThinking, false);
    assert.equal(s.render().webAiEngine.isThinking, false);
    assert.equal(s.render().webAiEngine.isWorkerReady, true, 'keep the already loaded model ready');
    assert.equal(worker.messages.at(-1).type, 'stop');
    assert.equal(worker.messages.some(message => message.type === 'release'), false);

    api.aiTurnLock.current = true;
    api.webAiEngine.requestWebAiMove(position.board, position.currentPlayer, position.history);
    const fresh = worker.messages.at(-1);
    lateReply();
    t.mock.timers.tick(200);
    assert.deepEqual(s.moves, [], 'the previous generation cannot consume a new request');
    s.reply(worker, fresh);
    t.mock.timers.tick(200);
    assert.deepEqual(s.moves, [[2, 2, false]]);
    assert.equal(s.workers.length, 1);
  });
}

test('canceling a game session invalidates pending scoring before a late analysis can settle it', t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  api.pendingEndGameRef.current = { board: position.board, history: position.history,
    player: position.currentPlayer, captures: { black: 0, white: 0 }, komi: 3.5 };
  api.aiTurnLock.current = true;
  api.webAiEngine.requestAnalysis(position.board, position.currentPlayer, position.history);
  const worker = s.ready();
  const request = worker.messages.at(-1);
  api.cancelAiSession();
  s.reply(worker, request);
  t.mock.timers.tick(200);
  assert.deepEqual(s.endings, []);
  assert.equal(api.pendingEndGameRef.current, null);
  assert.equal(api.state.readPosition(), position);
  assert.equal(s.render().state.finalScore, null);
  assert.equal(api.aiTurnLock.current, false);
});

test('canceling a game session clears an already queued deferred move synchronously', t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  api.aiTurnLock.current = true;
  api.setIsThinking(true);
  api.webAiEngine.requestWebAiMove(position.board, position.currentPlayer, position.history);
  const worker = s.ready();
  s.reply(worker, worker.messages.at(-1));
  assert.notEqual(api.aiTimerRef.current, null);
  api.cancelAiSession();
  t.mock.timers.tick(200);
  assert.deepEqual(s.moves, []);
  assert.equal(api.aiTimerRef.current, null);
  assert.equal(api.aiTurnLock.current, false);
  assert.equal(s.render().isThinking, false);
  assert.equal(api.state.readPosition(), position);
});

for (const pass of [false, true]) {
  test(`entering review rejects an in-flight AI ${pass ? 'pass' : 'move'} even at the unchanged original position`, t => {
    const s = setup(t);
    let api = s.render();
    const position = api.state.readPosition();
    api.aiTurnLock.current = true;
    api.webAiEngine.requestWebAiMove(position.board, position.currentPlayer, position.history);
    const worker = s.ready();
    const request = worker.messages.at(-1);
    api.review.inspectPosition(createInitialPosition(9));
    api = s.render();
    assert.equal(api.state.appMode, 'review');
    worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
      data: { move: pass ? null : { x: 2, y: 2 }, winRate: 50, ownership: null } });
    t.mock.timers.tick(200);
    assert.deepEqual(s.moves, []);
    assert.equal(api.state.readPosition(), position);
    assert.equal(api.aiTurnLock.current, false);
  });
}

test('review mode invalidates a deferred move accepted before the mode changed', t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  api.aiTurnLock.current = true;
  api.webAiEngine.requestWebAiMove(position.board, position.currentPlayer, position.history);
  const worker = s.ready();
  s.reply(worker, worker.messages.at(-1));
  assert.notEqual(api.aiTimerRef.current, null);
  api.state.setAppMode('review');
  s.render();
  t.mock.timers.tick(200);
  assert.deepEqual(s.moves, []);
  assert.equal(api.state.readPosition(), position);
});

test('review slider cancels old analysis and sends the displayed snapshot after state commits', t => {
  const s = setup(t);
  let api = s.render();
  const initial = api.state.readPosition();
  const board = initial.board.map(row => [...row]);
  board[2][3] = { x: 3, y: 2, color: 'black', id: 'first' };
  api.state.writePosition(recordMove(initial, board, { x: 3, y: 2 }, 0, false));
  api.state.setAppMode('review');
  api.state.setReviewIndex(0);
  s.options.showTerritory = true;
  api = s.render();
  const worker = s.ready();
  const a = worker.messages.at(-1);
  assert.equal(a.data.history.length, 0);
  assert.equal(a.data.color, 'black');
  assert.ok(a.data.board.flat().every(stone => stone === null));
  api.state.setReviewIndex(1);
  api = s.render();
  const b = worker.messages.at(-1);
  assert.equal(b.data.color, 'white');
  assert.deepEqual(b.data.history.map(item => item.move), [{ x: 3, y: 2 }]);
  assert.deepEqual(b.data.board, api.review.position.board);
  s.reply(worker, a, Array(81).fill(-1));
  assert.equal(s.render().review.territory, null);
  s.reply(worker, b);
  assert.equal(s.render().review.territory[0], 0.5);
  api.state.setReviewIndex(0);
  s.render();
  assert.equal(s.render().review.territory, null, 'previous overlay is cleared while analyzing another board');
  assert.deepEqual(s.endings, [], 'review analyses never become game-ending results');
});



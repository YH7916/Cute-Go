import assert from 'node:assert/strict';
import test from 'node:test';
import { setupAiSession as setup, createInitialPosition, recordMove } from './helpers/gameAiSession.mjs';

test('coach analysis shares the AI worker with eight visits and returns black-perspective evidence without scoring', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const pending = api.requestCoachAnalysis(position);
  const worker = s.ready();
  const request = worker.messages.at(-1);
  assert.equal(request.data.mode, 'analyze');
  assert.equal(request.data.purpose, 'coach');
  assert.equal(request.data.simulations, 8);
  worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
    data: { move: null, winRate: 63, lead: 999, purpose: 'coach', visits: 8, estimatedBlackLead: -3.5,
      candidates: [{ point: { x: 2, y: 2 }, visits: 5 }], ownership: Array(81).fill(0) } });
  const evidence = await pending;
  assert.equal(evidence.perspective, 'black');
  assert.equal(evidence.winRateBlack, 63);
  assert.equal(evidence.estimatedBlackLead, -3.5);
  assert.equal(evidence.visits, 8);
  assert.equal(evidence.source, 'local-katago');
  assert.deepEqual(evidence.candidates, [{ point: { x: 2, y: 2 }, visits: 5 }]);
  assert.ok(!Object.hasOwn(evidence, 'ownership'));
  assert.ok(!Object.hasOwn(evidence, 'lead'));
  assert.equal(s.workers.length, 1);
  assert.deepEqual(s.endings, []);
});

test('normal AI response preempts a coach analysis and its old abort cannot stop the new move', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const controller = new AbortController();
  const pending = api.requestCoachAnalysis(position, controller.signal);
  const worker = s.ready();
  const old = worker.messages.at(-1);
  api.aiTurnLock.current = true;
  assert.equal(api.webAiEngine.requestWebAiMove(position.board, 'black', position.history), true);
  const current = worker.messages.at(-1);
  assert.equal(current.type, 'compute');
  assert.equal(current.data.mode, 'play');
  assert.equal(worker.messages.at(-2).type, 'stop');
  assert.equal(await pending, undefined);
  controller.abort();
  assert.equal(worker.messages.at(-1), current, 'old abort must not send stop to the normal move');
  s.reply(worker, old);
  s.reply(worker, current);
  t.mock.timers.tick(200);
  assert.deepEqual(s.moves, [[2, 2, false]]);
});

test('same-size reset invalidates engine evidence even before a render', async t => {
  const s = setup(t);
  const api = s.render();
  const pending = api.requestCoachAnalysis(api.state.readPosition());
  const worker = s.ready();
  const request = worker.messages.at(-1);
  api.state.writePosition(createInitialPosition(9));
  worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
    data: { move: null, winRate: 50, purpose: 'coach', visits: 8, candidates: [], ownership: null } });
  assert.equal(await pending, undefined);
  assert.deepEqual(s.endings, []);
});

test('coach cancellation settles immediately and cannot cancel its replacement analysis', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const oldController = new AbortController();
  const oldPending = api.requestCoachAnalysis(position, oldController.signal);
  const worker = s.ready();
  const old = worker.messages.at(-1);
  const controller = new AbortController();
  const pending = api.requestCoachAnalysis(position, controller.signal);
  const replacement = worker.messages.at(-1);
  assert.equal(await oldPending, undefined);
  oldController.abort();
  assert.equal(worker.messages.at(-1), replacement);
  const rejection = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await rejection;
  s.reply(worker, old);
  s.reply(worker, replacement);
  assert.deepEqual(s.endings, []);
  assert.equal(s.render().webAiEngine.isThinking, false);
});

test('failed coach initialization degrades quietly and does not poison the next Fun move', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const pending = api.requestCoachAnalysis(position);
  const worker = s.workers.at(-1);
  const init = worker.messages.at(-1);
  worker.emit({ type: 'error', generation: init.generation, message: 'model unavailable' });
  assert.equal(await pending, undefined);
  assert.deepEqual(s.errors, [], 'optional teaching analysis must not display a game AI failure');
  api.aiTurnLock.current = true;
  assert.equal(api.webAiEngine.requestWebAiMove(position.board, 'black', position.history, 1, 3.5, 'Fun'), true);
  t.mock.timers.tick(180);
  t.mock.timers.tick(200);
  assert.equal(s.moves.length, 1, 'rules-only opponent remains usable after model load failure');
});

test('coach watchdog stops only the pending analysis and a later regular scoring request still settles', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const pending = api.requestCoachAnalysis(position);
  const worker = s.ready();
  const old = worker.messages.at(-1);
  t.mock.timers.tick(21000);
  assert.equal(await pending, undefined);
  assert.equal(worker.messages.at(-1).type, 'stop');
  api.pendingEndGameRef.current = { board: position.board, history: position.history, player: 'black',
    captures: { black: 0, white: 0 }, komi: 3.5 };
  api.webAiEngine.requestAnalysis(position.board, 'black', position.history);
  const scoring = worker.messages.at(-1);
  s.reply(worker, old);
  assert.deepEqual(s.endings, []);
  s.reply(worker, scoring);
  assert.equal(s.endings.length, 1);
});

test('returning home and unmounting settle pending coach analyses without leaking timers', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const pending = api.requestCoachAnalysis(position);
  api.cancelAiSession();
  assert.equal(await pending, undefined);
  const next = api.requestCoachAnalysis(position);
  s.unmount();
  assert.equal(await next, undefined);
});

test('coach callback remains stable across status renders and reads the latest position synchronously', async t => {
  const s = setup(t);
  const api = s.render();
  const first = api.state.readPosition();
  api.setIsThinking(true);
  assert.equal(s.render().requestCoachAnalysis, api.requestCoachAnalysis);
  api.state.writePosition(createInitialPosition(9));
  assert.equal(await api.requestCoachAnalysis(first), undefined);
  assert.equal(s.workers.length, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.requestCoachAnalysis(api.state.readPosition(), controller.signal), { name: 'AbortError' });
  assert.equal(s.workers.length, 0);
});

test('Fun can preempt a still-loading coach model and old readiness cannot affect its response', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const pending = api.requestCoachAnalysis(position);
  const oldWorker = s.workers.at(-1);
  const init = oldWorker.messages.at(-1);
  api.aiTurnLock.current = true;
  assert.equal(api.webAiEngine.requestWebAiMove(position.board, 'black', position.history, 1, 3.5, 'Fun'), true);
  assert.equal(await pending, undefined);
  oldWorker.emit({ type: 'init-complete', generation: init.generation });
  t.mock.timers.tick(180);
  t.mock.timers.tick(200);
  assert.equal(s.moves.length, 1);
  assert.deepEqual(s.errors, []);
});

test('optional coach loading and search never expose the game-blocking busy flags', async t => {
  const s = setup(t, true);
  let api = s.render();
  const pending = api.requestCoachAnalysis(api.state.readPosition());
  api = s.render();
  assert.equal(api.webAiEngine.isInitializing, false, 'optional cold model load must not open the game initialization overlay');
  assert.equal(api.webAiEngine.isLoading, false);
  assert.equal(api.webAiEngine.isThinking, false);
  assert.equal(api.webAiEngine.initStatus, '');
  assert.equal(api.flow.showThinkingStatus, false, 'undo/pass/board controls must remain usable');
  const worker = s.ready();
  api = s.render();
  assert.equal(worker.messages.at(-1).data.purpose, 'coach');
  assert.equal(api.flow.showThinkingStatus, false, 'searching a loaded model is also optional background work');
  const initial = api.state.readPosition();
  const board = initial.board.map(row => [...row]);
  board[2][3] = { color: 'black', x: 3, y: 2, id: 'human' };
  api.state.writePosition(recordMove(initial, board, { x: 3, y: 2 }, 0, false));
  s.render();
  assert.equal(await pending, undefined);
  assert.equal(s.render().flow.showThinkingStatus, true, 'the real opponent turn still blocks controls');
  t.mock.timers.tick(180);
  t.mock.timers.tick(200);
  assert.equal(s.moves.length, 1, 'normal game flow preempts analysis and delivers the opponent move');
});

test('normal AI initialization and endgame analysis keep their existing busy states', async t => {
  const s = setup(t, true);
  let api = s.render();
  api.webAiEngine.initializeAI();
  api = s.render();
  assert.equal(api.webAiEngine.isInitializing, true);
  assert.equal(api.webAiEngine.isLoading, true);
  assert.match(api.webAiEngine.initStatus, /启动/);
  const worker = s.ready();
  const position = api.state.readPosition();
  const optional = api.requestCoachAnalysis(position);
  api.pendingEndGameRef.current = { board: position.board, history: position.history, player: 'black',
    captures: { black: 0, white: 0 }, komi: 3.5 };
  api.webAiEngine.requestAnalysis(position.board, 'black', position.history);
  assert.equal(await optional, undefined);
  api = s.render();
  assert.equal(api.webAiEngine.isThinking, true);
  assert.equal(api.flow.showThinkingStatus, true, 'mandatory scoring must not inherit the optional analysis mask');
  s.reply(worker, worker.messages.at(-1));
  assert.equal(s.endings.length, 1);
});


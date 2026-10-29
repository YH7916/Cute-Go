import assert from 'node:assert/strict';
import test from 'node:test';
import { setupAiSession as setup, createInitialPosition, recordMove } from './helpers/gameAiSession.mjs';

for (const pass of [false, true]) {
  test(`real reset releases the old play owner for immediate coach analysis and rejects its late ${pass ? 'pass' : 'move'}`, async t => {
    const s = setup(t);
    const api = s.render();
    const previous = api.state.readPosition();
    api.aiTurnLock.current = true;
    api.webAiEngine.requestWebAiMove(previous.board, previous.currentPlayer, previous.history);
    const worker = s.ready();
    const old = worker.messages.at(-1);
    await api.resetGame();
    const fresh = api.state.readPosition();
    assert.notEqual(fresh, previous);
    const release = worker.messages.at(-1);
    assert.equal(release.type, 'release', 'reset retains its Worker release policy');
    const pending = api.requestCoachAnalysis(fresh);
    worker.emit({ type: 'released', generation: release.generation });
    s.ready();
    const request = worker.messages.at(-1);
    assert.equal(request.type, 'compute');
    assert.equal(request.data.purpose, 'coach', 'no new play request should be needed after reset');
    assert.deepEqual(request.data.board, fresh.board);
    worker.emit({ type: 'ai-response', requestId: old.requestId, generation: old.generation,
      data: { move: pass ? null : { x: 2, y: 2 }, winRate: 50, ownership: null } });
    t.mock.timers.tick(200);
    assert.deepEqual(s.moves, []);
    assert.equal(api.state.readPosition(), fresh);
    worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
      data: { move: null, winRate: 50, purpose: 'coach', visits: 8, candidates: [], ownership: null } });
    assert.equal((await pending).visits, 8);
    assert.deepEqual(s.endings, []);
  });
}

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
  assert.deepEqual(evidence.ownership, new Float32Array(81));
  assert.ok(!Object.hasOwn(evidence, 'lead'));
  assert.equal(s.workers.length, 1);
  assert.deepEqual(s.endings, []);
});

for (const color of ['black', 'white']) {
  test(`coach hook keeps black-perspective ownership and pass isolated for ${color}`, async t => {
    const s = setup(t);
    const api = s.render();
    const position = { ...api.state.readPosition(), currentPlayer: color };
    api.state.writePosition(position);
    const pending = api.requestCoachAnalysis(position);
    const worker = s.ready();
    const request = worker.messages.at(-1);
    const ownership = new Float32Array(81).fill(-0.25);
    const pass = { visits: 7, prior: 0.8, winRateBlack: 62 };
    worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
      data: { move: null, winRate: 62, purpose: 'coach', visits: 8, candidates: [], ownership, pass } });
    const evidence = await pending;
    assert.deepEqual(evidence.pass, pass, 'the Worker -> lifecycle -> hook path must not discard pass');
    assert.deepEqual(evidence.ownership, ownership, 'already-black ownership must not be flipped for white');
    assert.notEqual(evidence.ownership, ownership);
    const uiOwnership = s.render().webAiEngine.aiTerritory;
    assert.notEqual(evidence.ownership, uiOwnership, 'UI and cached evidence must not share mutable arrays');
    ownership[0] = 1;
    uiOwnership[1] = 1;
    pass.visits = 0;
    assert.equal(evidence.ownership[0], -0.25);
    assert.equal(evidence.ownership[1], -0.25);
    assert.equal(evidence.pass.visits, 7);
    assert.equal(await api.requestCoachAnalysis(position), evidence);
    assert.deepEqual(s.moves, []);
    assert.deepEqual(s.endings, []);
  });
}

for (const [label, ownership] of [
  ['missing head', null], ['wrong length', new Float32Array(80)],
  ['nonfinite', new Float32Array(81).fill(NaN)], ['outside normalized range', new Float32Array(81).fill(1.01)],
]) {
  test(`coach ownership ${label} does not become invented territory`, async t => {
    const s = setup(t);
    const api = s.render();
    const pending = api.requestCoachAnalysis(api.state.readPosition());
    const worker = s.ready();
    const request = worker.messages.at(-1);
    worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
      data: { move: null, winRate: 50, purpose: 'coach', visits: 8, candidates: [], ownership } });
    const evidence = await pending;
    assert.equal(evidence.ownership, ownership === null ? null : undefined);
    assert.equal(evidence.pass, undefined, 'analysis move:null must never manufacture a pass');
    assert.equal(evidence.visits, 8, 'other valid analysis still remains usable');
  });
}

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
  api.state.setPassNotificationDismissed(true);
  assert.equal(s.render().state.passNotificationDismissed, true);
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

test('coach focus uses independent bounded analysis and cached complete-position evidence', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const point = { x: 7, y: 7 };
  const pending = api.requestCoachAnalysis(position, undefined, [point, point, { x: -1, y: 0 }]);
  const worker = s.ready();
  const request = worker.messages.at(-1);
  assert.deepEqual(request.data.coachFocusPoints, [point]);
  assert.equal(request.data.difficulty, 'Hard');
  assert.ok(request.data.simulations >= 8 && request.data.simulations <= 32);
  const candidate = { point, visits: 3, prior: 0.02, winRateBlack: 61, variation: [point, { x: 6, y: 7 }] };
  worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
    data: { move: null, winRate: 60, purpose: 'coach', visits: 16, candidates: [candidate], ownership: null } });
  const evidence = await pending;
  assert.deepEqual(evidence.candidates, [candidate]);
  const count = worker.messages.length;
  assert.deepEqual(await api.requestCoachAnalysis(position, undefined, [point]), evidence);
  assert.equal(worker.messages.length, count, 'same current position and focus reuse completed model evidence');
  const changed = { ...position, blackCaptures: 2 };
  api.state.writePosition(changed);
  const next = api.requestCoachAnalysis(changed, undefined, [point]);
  assert.equal(worker.messages.length, count + 1, 'same board with different prisoners is a different analysis');
  api.cancelAiSession();
  assert.equal(await next, undefined);
});

test('reset discards coach cache even when the new board looks identical', async t => {
  const s = setup(t);
  const api = s.render();
  const position = api.state.readPosition();
  const pending = api.requestCoachAnalysis(position);
  const worker = s.ready();
  const request = worker.messages.at(-1);
  worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
    data: { move: null, winRate: 50, purpose: 'coach', visits: 8, candidates: [], ownership: null } });
  await pending;
  api.webAiEngine.resetAI();
  api.state.writePosition(createInitialPosition(9));
  const fresh = api.state.readPosition();
  const next = api.requestCoachAnalysis(fresh);
  assert.equal(worker.messages.at(-1).type, 'release');
  api.cancelAiSession();
  assert.equal(await next, undefined);
});

test('300 distinct complete positions retain exactly eight analyses and one shared Worker', async t => {
  const s = setup(t);
  const api = s.render();
  const base = api.state.readPosition();
  const positions = [];
  let worker;
  for (let index = 0; index < 300; index++) {
    // Prisoners distinguish otherwise identical complete snapshots; this also
    // catches a cache that silently keys only the stone layout.
    const position = { ...base, blackCaptures: index };
    positions.push(position);
    api.state.writePosition(position);
    const pending = api.requestCoachAnalysis(position);
    worker = index === 0 ? s.ready() : worker;
    const request = worker.messages.at(-1);
    worker.emit({ type: 'ai-response', requestId: request.requestId, generation: request.generation,
      data: { move: null, winRate: 50, purpose: 'coach', visits: 8, candidates: [], ownership: null } });
    await pending;
  }
  assert.equal(s.workers.length, 1);
  assert.equal(worker.messages.filter(message => message.type === 'compute').length, 300);
  for (const position of positions.slice(-8)) {
    api.state.writePosition(position);
    assert.equal((await api.requestCoachAnalysis(position)).visits, 8);
  }
  assert.equal(worker.messages.filter(message => message.type === 'compute').length, 300, 'last eight snapshots all hit');
  const evicted = positions.at(-9);
  api.state.writePosition(evicted);
  const controller = new AbortController();
  const pending = api.requestCoachAnalysis(evicted, controller.signal);
  assert.equal(worker.messages.filter(message => message.type === 'compute').length, 301, 'ninth snapshot has been evicted');
  const canceled = assert.rejects(pending, { name: 'AbortError' });
  controller.abort();
  await canceled;
  api.cancelAiSession();
  for (const position of positions.slice(-8)) {
    api.state.writePosition(position);
    const controller = new AbortController();
    const pending = api.requestCoachAnalysis(position, controller.signal);
    const canceled = assert.rejects(pending, { name: 'AbortError' });
    controller.abort();
    await canceled;
  }
  assert.equal(worker.messages.filter(message => message.type === 'compute').length, 309, 'leaving the game clears all eight cached snapshots');
  assert.equal(s.workers.length, 1);
});

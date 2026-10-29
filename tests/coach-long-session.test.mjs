import assert from 'node:assert/strict';
import test from 'node:test';
import { performance } from 'node:perf_hooks';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { setup, settle, move, makeHumanTurn } from './helpers/coachSession.mjs';

const { createInitialPosition, recordMove, attemptMove, getBoardHash, buildCoachEvidence,
  getLocalCoachMessage, executeCoachAgent, buildCoachTeachingChoices, buildCompactCoachContext } = await loadTestModule({
  contents: `
    export { createInitialPosition, recordMove } from './domains/game/positionState';
    export { attemptMove } from './core/go/rules';
    export { getBoardHash } from './core/board';
    export { buildCoachEvidence, getLocalCoachMessage } from './domains/coach/evidence';
    export { executeCoachAgent } from './agent/coach/runtime';
    export { buildCoachTeachingChoices } from './domains/coach/response';
    export { buildCompactCoachContext } from './domains/coach/context';
  `,
});

function providerEvidence(request) {
  return JSON.parse(request.init.body).evidence;
}

test('300 real hook exchanges retain six UI turns and only reuse answers with unchanged request context', async t => {
  const s = await setup(t);
  await makeHumanTurn(s);
  const questions = Array.from({ length: 300 }, (_, round) => `第${round + 1}轮：黑棋接下来应该观察哪里？`);
  let largestContext = 0;
  async function answer(question) {
    const index = s.requests.length;
    const pending = s.api.coach.ask('hint', question);
    await settle();
    assert.equal(s.requests.length, index + 1, 'an uncached question must reach the provider once');
    const evidence = providerEvidence(s.requests[index]);
    largestContext = Math.max(largestContext, JSON.stringify(evidence).length);
    assert.ok((evidence.conversation?.length ?? 0) <= 3);
    if (!question) assert.equal(Object.hasOwn(evidence, 'conversation'), false);
    assert.ok(JSON.stringify(evidence).length <= 6000);
    assert.equal('positionKey' in evidence, false);
    assert.equal('history' in evidence, false);
    s.respondChoice(index, 'current');
    await pending;
    const coach = s.render().coach;
    assert.equal(coach.source, 'cloud');
    assert.equal(coach.loading, false);
    assert.equal(coach.error, undefined);
    assert.ok(coach.conversation.length <= 6);
    return coach;
  }
  for (const question of questions) {
    const coach = await answer(question);
    assert.equal(coach.conversation.at(-1).question, question);
  }
  assert.equal(s.requests.length, 300);
  assert.deepEqual(s.api.coach.conversation.map(turn => turn.question), questions.slice(-6));

  for (const question of [questions.at(-1), questions.at(-8)]) await answer(question);
  assert.equal(s.requests.length, 302, 'identical question text needs a new answer after the conversation changes');

  await answer(undefined);
  const historyAfterButton = s.api.coach.conversation.map(turn => turn.id);
  await s.api.coach.ask('hint');
  assert.equal(s.requests.length, 303, 'default buttons send no conversation and can reuse the unchanged position');
  assert.equal(s.render().coach.loading, false);
  assert.deepEqual(s.api.coach.conversation.map(turn => turn.id), historyAfterButton, 'a cache hit does not duplicate UI history');
  await answer('开局从哪里下？');
  await s.api.coach.ask('hint');
  assert.equal(s.requests.length, 304, 'another explicit exchange does not change the history-free default request');

  move(s, 3, 3);
  s.render();
  await settle();
  await answer(undefined);
  assert.equal(s.requests.length, 305, 'the same default request on a new legal position requires fresh evidence');

  s.api.state.writePosition(createInitialPosition(9));
  assert.equal(s.render().coach.conversation.length, 0, 'a new game clears previous conversation ownership');
  await settle();
  await answer(undefined);
  assert.equal(s.requests.length, 306, 'a new game does not reuse an earlier game reply');
  assert.equal(s.api.coach.conversation.length, 1);
  t.diagnostic(`300 exchanges: largest provider evidence ${largestContext} chars; UI 6 turns; default request cache reused.`);
});

function legalLongGame() {
  let position = createInitialPosition(19);
  let seed = 0x5eeda11;
  const positions = new Map();
  for (let ply = 1; ply <= 300; ply++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const start = seed % 361;
    const previousHash = position.history.length ? getBoardHash(position.history.at(-1).board) : null;
    let next;
    // 37 and 19*19 are coprime, so this deterministic scan considers every point.
    for (let offset = 0; offset < 361; offset++) {
      const index = (start + offset * 37) % 361;
      const point = { x: index % 19, y: Math.floor(index / 19) };
      const result = attemptMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previousHash);
      if (!result) continue;
      next = recordMove(position, result.newBoard, point, result.captured, false);
      break;
    }
    assert.ok(next, `fixture must have a legal non-pass move at ply ${ply}`);
    position = next;
    if (ply === 100 || ply === 300) positions.set(ply, position);
  }
  return positions;
}

async function measure(task) {
  for (let warmup = 0; warmup < 4; warmup++) await task();
  const durations = [];
  for (let repetition = 0; repetition < 20; repetition++) {
    const start = performance.now();
    await task();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return { medianMs: Number(durations[10].toFixed(3)), maxMs: Number(durations.at(-1).toFixed(3)) };
}

test('legal 19x19 games at 100 and 300 moves keep provider requests bounded; report local baseline', async t => {
  const results = [];
  for (const [plies, position] of legalLongGame()) {
    const input = { kind: 'inspect', position, userColor: 'black', intent: 'hint', difficulty: 'Hard',
      config: { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' } };
    const evidence = buildCoachEvidence(position, 'black', 7.5);
    assert.equal(evidence.moveNumber, plies);
    assert.equal(evidence.lastAction.kind, 'move', 'the final transition must replay legally, not be a fabricated history');
    const choices = buildCoachTeachingChoices(evidence, { text: getLocalCoachMessage(evidence, 'hint') });
    const contextInput = { evidence, choices, intent: 'hint', hintPoints: [], difficulty: 'Hard' };
    const ordinary = buildCompactCoachContext(contextInput).payload;
    assert.equal(Object.hasOwn(ordinary, 'conversation'), false);
    const history = Array.from({ length: 6 }, (_, index) => ({ positionKey: evidence.positionKey,
      question: `问题${index}${'长提问'.repeat(150)}`, answer: `回答${index}${'长回答'.repeat(300)}` }));
    const explicit = buildCompactCoachContext({ ...contextInput, question: '这时应该先数气吗？', history }).payload;
    assert.ok((explicit.conversation?.length ?? 0) <= 3);
    assert.ok(JSON.stringify(explicit).length <= 6000);
    assert.equal(explicit.boardRows.length, 19);
    assert.equal(explicit.boardRows.join('').length, 361);
    const inspect = await executeCoachAgent(input);
    assert.equal(inspect.source, 'local');
    assert.equal(inspect.moveNumber, plies);
    results.push({ plies, evidence: await measure(() => buildCoachEvidence(position, 'black', 7.5)),
      inspect: await measure(() => executeCoachAgent(input)),
      context: await measure(() => buildCompactCoachContext({ ...contextInput, question: '这时应该先数气吗？', history })),
      structuredClone: await measure(() => structuredClone(input)),
      keyChars: evidence.positionKey.length, workerInputJsonChars: JSON.stringify(input).length,
      providerDefaultChars: JSON.stringify(ordinary).length, providerQuestionChars: JSON.stringify(explicit).length });
  }
  t.diagnostic(`Node local-rule baseline (20 samples after 4 warmups; no ONNX/browser inference): ${JSON.stringify(results)}`);
});

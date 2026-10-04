import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { createInitialPosition, setAgentInterceptor, settle, setup, move, makeNewAtari } from './helpers/coachSession.mjs';

const { executeCoachAgent, coachPositionKey, getDefaultKomi, attemptMove, recordMove } = await loadTestModule({
  contents: `export { executeCoachAgent } from './agent/coach/runtime';
    export { coachPositionKey } from './domains/coach/evidence';
    export { getDefaultKomi } from './core/go/config';
    export { attemptMove } from './core/go/rules';
    export { recordMove } from './domains/game/positionState';`,
});
const offline = { endpoint: '', model: '', apiKey: '' };
function stone(position, color, x, y) {
  position.board[y][x] = { color, x, y, id: `${color}-${x}-${y}` };
}
function suicidePosition() {
  const position = createInitialPosition(5);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1], [1, 2]]) stone(position, 'white', x, y);
  return position;
}
function koPosition() {
  const before = createInitialPosition(5);
  for (const [x, y] of [[0, 1], [1, 0], [1, 2]]) stone(before, 'black', x, y);
  for (const [x, y] of [[1, 1], [2, 0], [3, 1], [2, 2]]) stone(before, 'white', x, y);
  const played = attemptMove(before.board, 2, 1, 'black');
  assert.equal(played.captured, 1);
  return recordMove(before, played.newBoard, { x: 2, y: 1 }, played.captured, false);
}
function input(position, intent = 'explain-illegal-move') {
  return { kind: 'inspect', position, userColor: 'black', intent, config: offline };
}
function estimate(position, lead) {
  return { positionKey: coachPositionKey(position, position.currentPlayer, getDefaultKomi(position.board.length)),
    source: 'local-katago', perspective: 'black', visits: 8, estimatedBlackLead: lead, candidates: [] };
}
function developedPosition() {
  let position = createInitialPosition(9);
  for (const [x, y] of [[2, 2], [6, 6], [2, 3], [6, 5], [3, 2], [5, 6], [3, 3], [5, 5], [4, 2], [4, 6]]) {
    const result = attemptMove(position.board, x, y, position.currentPlayer);
    assert.ok(result);
    position = recordMove(position, result.newBoard, { x, y }, result.captured, false);
  }
  return position;
}

test('an occupied point explains occupancy without suggesting a new move or changing any position field', async () => {
  const position = createInitialPosition(5);
  stone(position, 'black', 1, 1);
  const snapshot = structuredClone(position);
  const result = await executeCoachAgent({ ...input(position), attemptedPoint: { x: 1, y: 1 } });
  assert.match(result.text, /已经有.*棋子|已有.*棋子/);
  assert.deepEqual(result.hintPoints, []);
  assert.equal(result.shouldAutoExplain, false);
  assert.deepEqual(position, snapshot);
});

test('suicide and ko explanations mark only the rejected empty point and explain the actual rule', async () => {
  const suicide = await executeCoachAgent({ ...input(suicidePosition()), attemptedPoint: { x: 1, y: 1 } });
  assert.match(suicide.text, /圈出的这里.*(没有气|无气|一口气也没有)/);
  assert.doesNotMatch(suicide.text, /[①②③]|B4/);
  assert.match(suicide.text, /提|吃/);
  assert.deepEqual(suicide.hintPoints, [{ x: 1, y: 1, label: 'B4' }]);
  const ko = await executeCoachAgent({ ...input(koPosition()), attemptedPoint: { x: 1, y: 1 } });
  assert.match(ko.text, /劫/);
  assert.match(ko.text, /圈出的这里/);
  assert.doesNotMatch(ko.text, /[①②③]|B4/);
  assert.match(ko.text, /重复|还原|回到/);
  assert.deepEqual(ko.hintPoints, [{ x: 1, y: 1, label: 'B4' }]);
});

test('missing, invalid and legal attempted points never produce a false illegal-move claim or marker', async () => {
  for (const attemptedPoint of [undefined, { x: -1, y: 0 }, { x: NaN, y: 0 }, { x: 1.5, y: 1 }, { x: 2, y: 2 }]) {
    const result = await executeCoachAgent({ ...input(createInitialPosition(5)), attemptedPoint });
    assert.deepEqual(result.hintPoints, []);
    assert.doesNotMatch(result.text, /禁入|打劫|没有气|无法落子|不能落子/);
  }
  const legalCapture = { ...koPosition(), history: [] };
  const captured = await executeCoachAgent({ ...input(legalCapture), attemptedPoint: { x: 1, y: 1 } });
  assert.match(captured.text, /符合落子规则/);
  assert.doesNotMatch(captured.text, /禁入|没有气|不能落子/);
  assert.deepEqual(captured.hintPoints, [], 'capturing to gain liberties is not falsely taught as suicide');
});

test('illegal-move teaching remains local even if a configured caller requests cloud execution', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected provider request'); });
  const result = await executeCoachAgent({ ...input(suicidePosition()), kind: 'ask', attemptedPoint: { x: 1, y: 1 },
    config: { endpoint: 'https://coach.example/v1', model: 'test', apiKey: 'test-secret' } });
  assert.match(result.text, /圈出的这里/);
  assert.equal(result.source, 'local');
  assert.equal(fetch.mock.callCount(), 0);
});

test('the hook teaches a rejected move without engine calls, provider calls or position writes', async t => {
  const s = await setup(t);
  let analyses = 0;
  s.options.analyze = async () => { analyses++; return undefined; };
  const position = suicidePosition();
  s.api.state.writePosition(position);
  s.render();
  await settle();
  const snapshot = structuredClone(position);
  await s.render().coach.explainIllegalMove({ x: 1, y: 1 }, position);
  const { coach, state } = s.render();
  assert.match(coach.text, /圈出的这里/);
  assert.equal(coach.loading, false);
  assert.equal(state.readPosition(), position);
  assert.deepEqual(position, snapshot);
  assert.equal(analyses, 0);
  assert.equal(s.requests.length, 0);
});

for (const guard of ['inactive', 'wrong-position']) {
  test(`${guard} rejects an illegal-move explanation before dispatch`, async t => {
    const s = await setup(t);
    if (guard === 'inactive') s.options.active = false;
    s.render();
    await settle();
    let dispatches = 0;
    setAgentInterceptor((_input, _signal, run) => { dispatches++; return run(); });
    const current = s.api.state.readPosition();
    await s.render().coach.explainIllegalMove({ x: 0, y: 0 }, guard === 'wrong-position' ? createInitialPosition(9) : current);
    assert.equal(dispatches, 0);
    assert.equal(s.requests.length, 0);
  });
}

test('a finished game supports explicit rule explanations and questions without automatic provider calls', async t => {
  const s = await setup(t);
  await makeNewAtari(s);
  s.options.gameOver = true;
  s.render();
  await settle();
  s.render();
  t.mock.timers.tick(1000);
  await settle();
  assert.equal(s.requests.length, 0, 'even an urgent position cannot start an automatic paid explanation after game over');
  assert.equal(s.render().coach.text, '', 'a finished game also suppresses automatic local commentary');
  assert.deepEqual(s.api.coach.hintPoints, []);
  assert.equal(s.api.coach.configured, true, 'silence must not hide the configured manual question composer');
  const position = s.api.state.readPosition();
  const before = structuredClone(position);
  await s.api.coach.explainIllegalMove({ x: 1, y: 1 }, position);
  assert.match(s.render().coach.text, /已有棋子.*不能叠放/);
  assert.equal(s.api.coach.source, 'local');
  assert.equal(s.requests.length, 0, 'point inspection is always local');
  const pending = s.api.coach.ask('explain-last-move', '为什么这里被打吃？');
  await settle();
  assert.equal(s.requests.length, 1, 'the finished position remains available for an explicit question');
  const answer = s.respondChoice(0, 'concept.atari');
  await pending;
  assert.equal(s.render().coach.text, answer);
  assert.equal(s.api.coach.source, 'cloud');
  assert.equal(s.api.state.readPosition(), position);
  assert.deepEqual(position, before, 'teaching must not resume or change the finished game');
});

test('a rejected-move lesson cancels a pending cloud answer and keeps its own explanation', async t => {
  const s = await setup(t);
  const position = suicidePosition();
  s.api.state.writePosition(position);
  s.render();
  await settle();
  const paid = s.render().coach.ask('hint');
  await settle();
  assert.equal(s.requests.length, 1);
  await s.api.coach.explainIllegalMove({ x: 1, y: 1 }, position);
  assert.equal(s.requests[0].init.signal.aborted, true);
  const staleAnswer = s.respondChoice(0, 'concept.capture');
  await paid;
  assert.match(s.render().coach.text, /圈出的这里/);
  assert.notEqual(s.api.coach.text, staleAnswer);
});

test('a delayed rejected-move lesson cannot restore an old position after reset', async t => {
  const s = await setup(t);
  let release;
  setAgentInterceptor((request, _signal, run) => request.intent === 'explain-illegal-move'
    ? new Promise(resolve => { release = () => resolve(run()); }) : run());
  const old = s.api.state.readPosition();
  const pending = s.api.coach.explainIllegalMove({ x: -1, y: 0 }, old);
  s.api.state.writePosition(createInitialPosition(9));
  s.render();
  release();
  await pending;
  await settle();
  assert.equal(s.render().coach.text, '');
  assert.deepEqual(s.api.coach.hintPoints, []);
  assert.equal(s.requests.length, 0);
});

test('position lessons describe black-perspective estimates from either player view without exact final-score claims', async () => {
  const position = developedPosition();
  for (const [lead, userColor, color, relationship] of [[8, 'black', '黑棋', '你'], [-8, 'black', '白棋', '对手'], [8, 'white', '黑棋', '对手'], [-8, 'white', '白棋', '你']]) {
    const result = await executeCoachAgent({ ...input(position, 'explain-position'), userColor, engineEvidence: estimate(position, lead) });
    assert.match(result.text, new RegExp(`${color}.*${relationship}`));
    assert.match(result.text, /粗略|估计|粗看/);
    assert.match(result.text, /不是终局|不代表终局|还没结束|局势还会变/);
    assert.doesNotMatch(result.text, /8\s*目|胜率|稳胜|必胜/);
    assert.ok(result.text.length <= 60, 'a local position lesson focuses on one compact teaching point');
  }
});

test('position lessons avoid inventing a leader when engine evidence is absent, stale or nearly level', async () => {
  const position = developedPosition();
  for (const engineEvidence of [undefined, { ...estimate(position, 20), positionKey: 'stale' }, estimate(position, 0.5)]) {
    const result = await executeCoachAgent({ ...input(position, 'explain-position'), engineEvidence });
    assert.match(result.text, /弱棋|一口气/);
    assert.match(result.text, /围|空点/);
    assert.doesNotMatch(result.text, /领先|占先|得分暂时较多|20\s*目|0\.5\s*目/);
    assert.ok(result.text.length <= 60);
  }
});

test('position teaching prioritizes the endangered group and keeps its player perspective correct', async () => {
  const position = createInitialPosition(5);
  stone(position, 'black', 1, 1);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) stone(position, 'white', x, y);
  for (const [userColor, relationship] of [['black', '你'], ['white', '对手']]) {
    const result = await executeCoachAgent({ ...input(position, 'explain-position'), userColor });
    assert.match(result.text, new RegExp(`${relationship}有一块棋只剩一口气`));
    assert.match(result.text, /再.*(围|空点)/);
    assert.doesNotMatch(result.text, /领先|必死|必胜/);
  }
});

test('sparse opening teaching ignores large soft leads and gives one development observation', async () => {
  for (const size of [9, 13, 19]) {
    const position = createInitialPosition(size);
    stone(position, 'black', 2, 2);
    stone(position, 'white', size - 3, size - 3);
    for (const lead of [-30, 30]) {
      const result = await executeCoachAgent({ ...input(position, 'explain-position'), engineEvidence: estimate(position, lead) });
      assert.match(result.text, /刚开局/);
      assert.match(result.text, /照应|发展/);
      assert.doesNotMatch(result.text, /领先|占先|得分.*较多|30|明显优势/);
      assert.ok(result.text.length <= 60);
    }
  }
});

test('an opening atari takes priority over development advice and speculative score direction', async () => {
  const position = createInitialPosition(9);
  stone(position, 'black', 1, 1);
  for (const [x, y] of [[0, 1], [1, 0], [2, 1]]) stone(position, 'white', x, y);
  const result = await executeCoachAgent({ ...input(position, 'explain-position'), engineEvidence: estimate(position, 30) });
  assert.match(result.text, /^你有一块棋只剩一口气/);
  assert.match(result.text, /连接|逃出/);
  assert.doesNotMatch(result.text, /刚开局|占先|较多/);
  assert.ok(result.text.length <= 60);
});

test('offline position teaching still requests the shared analysis once and makes no API request', async t => {
  const s = await setup(t, offline);
  s.api.state.writePosition(developedPosition());
  s.render();
  await settle();
  let analyses = 0;
  s.options.analyze = async position => { analyses++; return estimate(position, -8); };
  await s.render().coach.ask('explain-position');
  assert.equal(analyses, 1);
  assert.equal(s.requests.length, 0);
  assert.match(s.render().coach.text, /白棋.*对手/);
  assert.equal(s.api.coach.configured, false);
  assert.equal(s.api.coach.loading, false);
});

test('moving before offline position analysis settles prevents publishing its stale estimate', async t => {
  const s = await setup(t, offline);
  let release;
  s.options.analyze = position => new Promise(resolve => { release = () => resolve(estimate(position, -8)); });
  const pending = s.render().coach.ask('explain-position');
  await settle();
  assert.equal(typeof release, 'function');
  move(s, 2, 2);
  s.render();
  release();
  await pending;
  await settle();
  assert.equal(s.render().coach.text, '');
  assert.equal(s.requests.length, 0);
});

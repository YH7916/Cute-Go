import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompactCoachContext } from '../domains/coach/context';
import { buildCoachEvidence, getLocalCoachMessage } from '../domains/coach/evidence';
import { buildCoachTeachingChoices } from '../domains/coach/response';
import { createInitialPosition, type GamePosition } from '../domains/game/positionState';

function request(position = createInitialPosition(19), question?: string) {
  const evidence = buildCoachEvidence(position, 'white', 7.5);
  const choices = buildCoachTeachingChoices(evidence, { text: getLocalCoachMessage(evidence, 'hint') });
  return { evidence, choices, question, intent: 'hint' as const, hintPoints: [], difficulty: 'Hard' as const };
}

function put(position: GamePosition, x: number, y: number, color: 'black' | 'white') {
  position.board[y][x] = { x, y, color, id: `${x}-${y}` };
}

test('300-move full 19x19 positions and six long answers keep a bounded complete current board', () => {
  const position = createInitialPosition(19);
  for (let y = 0; y < 19; y++) for (let x = 0; x < 19; x++) put(position, x, y, (x + y) % 2 ? 'white' : 'black');
  position.history = Array.from({ length: 300 }, () => ({ ...position, move: null }));
  const input = request(position, 'T1 的这块棋有几口气？');
  const original = structuredClone(input.evidence);
  const history = Array.from({ length: 6 }, (_, index) => ({ positionKey: input.evidence.positionKey,
    question: `第${index}轮${'重复问题'.repeat(200)}`, answer: `${'先前回答'.repeat(500)} private-key` }));
  const { payload, choices } = buildCompactCoachContext({ ...input, history, secret: 'private-key' });
  const serialized = JSON.stringify(payload);
  assert.ok(serialized.length <= 6000, `context has ${serialized.length} characters`);
  assert.equal(payload.moveNumber, 300);
  assert.equal(payload.boardRows.length, 19);
  assert.equal(payload.boardRows.join('').length, 361);
  assert.equal(payload.boardRows[0], 'BWBWBWBWBWBWBWBWBWB');
  assert.equal(payload.boardRows[18][18], 'B');
  assert.equal(payload.difficulty, 'Hard');
  assert.equal(payload.userColor, 'white');
  assert.ok(payload.groups.some(group => group.anchor === 'T1'));
  assert.ok(choices.some(choice => choice.id === 'group.T1'));
  assert.ok(choices.length <= 12);
  assert.ok((payload.conversation?.length ?? 0) <= 3);
  assert.doesNotMatch(serialized, /positionKey|private-key|"history"|"stones"/);
  assert.deepEqual(input.evidence, original);
});

test('a named quiet stone retains its group facts even when its anchor differs', () => {
  const position = createInitialPosition(19);
  put(position, 0, 0, 'black');
  put(position, 18, 17, 'white');
  put(position, 18, 18, 'white');
  const input = request(position, 'T1 的白棋有几口气？');
  const actual = input.evidence.groups.find(group => group.stones.some(point => point.label === 'T1'));
  assert.ok(actual);
  const { payload, choices } = buildCompactCoachContext(input);
  const selected = payload.groups.find(group => group.anchor === actual.stones[0].label);
  assert.ok(selected);
  assert.equal(selected.stoneCount, 2);
  assert.equal(selected.libertyCount, actual.liberties.length);
  assert.ok(selected.focusPoints.includes('T1'));
  assert.deepEqual(selected.libertyExamples, actual.liberties.slice(0, 6).map(point => point.label));
  assert.ok(choices.some(choice => choice.id === `group.${actual.stones[0].label}`));
});

test('a questioned liberty stays in the examples when a large group has many other liberties', () => {
  const position = createInitialPosition(19);
  for (let x = 0; x < 19; x++) put(position, x, 18, 'white');
  const input = request(position, 'T2 是这块白棋的气吗？');
  const { payload } = buildCompactCoachContext(input);
  const group = payload.groups.find(item => item.color === 'white');
  assert.ok(group);
  assert.equal(group.libertyCount, 19);
  assert.equal(group.stoneCount, 19);
  assert.equal(group.libertyExamples[0], 'T2');
  assert.equal(group.libertyExamples.length, 6);
  assert.deepEqual(group.focusPoints, []);
});

test('ordinary requests omit conversation and curriculum, explicit questions retain only relevant concepts', () => {
  const input = request();
  const history = [{ positionKey: input.evidence.positionKey, question: '问', answer: '答' }];
  const ordinary = buildCompactCoachContext({ ...input, history });
  assert.equal(ordinary.payload.conversation, undefined);
  assert.ok(ordinary.choices.every(choice => choice.kind === 'position'));
  for (const question of ['为什么双眼能活？', '假眼和真眼区别是什么？', '为什么不能马上提劫？']) {
    const selected = buildCompactCoachContext({ ...input, question }).choices;
    const text = selected.filter(choice => choice.kind !== 'position').flatMap(choice => choice.variants).join('');
    assert.match(text, question.includes('劫') ? /劫/ : /眼/);
    assert.ok(selected.filter(choice => choice.kind !== 'position').length <= 4);
  }
  const movement = buildCompactCoachContext({ ...input, question: '能把自己的棋子挪到旁边吗' });
  assert.ok(movement.choices.some(choice => choice.id === 'course.go.rules.place-turn'));
  for (const [question, id] of [['怎样才能提子', 'concept.capture'], ['开局从哪里下', 'concept.opening']]) {
    assert.ok(buildCompactCoachContext({ ...input, question }).choices.some(choice => choice.id === id));
  }
});

test('verified local engine facts pass unchanged and conversation cannot become current board evidence', () => {
  const input = request(createInitialPosition(9), '上一轮为什么那样说？');
  const engineAnalysis = { source: 'local-katago', perspective: 'black', visits: 16,
    candidates: [{ point: { x: 2, y: 2, label: 'C7' }, visits: 8, prior: 0.25,
      winRateBlack: 48.7, effects: { capturedStones: 0, libertiesAfter: 4 } }],
    limits: ['少量搜索，不证明最佳手。'] };
  const { payload } = buildCompactCoachContext({ ...input, engineAnalysis, history: [
    { positionKey: 'earlier-board', question: 'private-key还在吗', answer: '白棋已经做活'.repeat(500) },
    { positionKey: input.evidence.positionKey, question: '当前问题', answer: '当前回答' },
  ], secret: 'private-key' });
  assert.deepEqual(payload.engineAnalysis, engineAnalysis);
  assert.equal(payload.lastAction.kind, 'none');
  assert.deepEqual(payload.groups, []);
  assert.deepEqual(payload.candidates, []);
  assert.equal(payload.conversation?.[0].position, 'earlier');
  assert.equal(payload.conversation?.[1].position, 'current');
  assert.doesNotMatch(JSON.stringify(payload), /private-key|earlier-board/);
  assert.ok(JSON.stringify(payload.conversation).length <= 1200);
});

test('oversized trusted engine data fails closed rather than silently rewriting engine facts', () => {
  assert.throws(() => buildCompactCoachContext({ ...request(), engineAnalysis: { unexpected: 'x'.repeat(7000) } }),
    /上下文/);
});

test('engine references stay selectable alongside a concrete coordinate and conceptual question', () => {
  const position = createInitialPosition(19);
  put(position, 18, 18, 'white');
  const input = request(position, 'T1 的白棋能不能做两眼，假眼和真眼有什么不同？');
  const engines = ['D16', 'Q16', 'D4'].map(label => ({ id: `engine.${label}`, kind: 'position' as const,
    variants: [`端侧搜索给出${label}候选，尚未证明最佳手。`] }));
  const result = buildCompactCoachContext({ ...input, choices: [...input.choices, ...engines] });
  for (const engine of engines) assert.deepEqual(result.choices.find(choice => choice.id === engine.id), engine);
  assert.ok(result.choices.some(choice => choice.id === 'group.T1'));
  assert.ok(result.choices.some(choice => choice.kind !== 'position'));
  assert.ok(result.choices.length <= 12);
});

test('hundreds of previous exchanges do not grow provider memory or retain old rounds', () => {
  const input = request(createInitialPosition(9), '刚才为什么说要连接？');
  const history = Array.from({ length: 320 }, (_, index) => ({ positionKey: `old-${index}`,
    question: `问${index}：${'连接'.repeat(150)}`, answer: `答${index}：${'旧局面'.repeat(200)}` }));
  let greatestLength = 0;
  for (let round = 100; round < 300; round++) {
    const result = buildCompactCoachContext({ ...input, history: history.slice(0, round) });
    greatestLength = Math.max(greatestLength, JSON.stringify(result.payload).length);
    assert.equal(result.payload.conversation?.length, 3);
    assert.match(result.payload.conversation[0].question, new RegExp(`^问${round - 3}：`));
    assert.match(result.payload.conversation[2].question, new RegExp(`^问${round - 1}：`));
    assert.ok(result.payload.conversation.every(turn => turn.position === 'earlier'));
  }
  assert.ok(greatestLength <= 6000);
});

test('default and explicit-question payloads contain only actual JSON values accepted by the provider', () => {
  for (const question of [undefined, '这里为什么可以提子？']) {
    const { payload } = buildCompactCoachContext(request(createInitialPosition(9), question));
    const rejectNonJson = (_key: string, value: unknown) => {
      assert.notEqual(value, undefined, 'provider rejects undefined even when JSON.stringify would silently omit it');
      return value;
    };
    const encoded = JSON.stringify(payload, rejectNonJson);
    assert.deepEqual(JSON.parse(encoded), payload);
    assert.equal(Object.hasOwn(payload, 'conversation'), false);
  }
});

test('a unique group resolves a demonstrative question but multiple quiet groups are not guessed', () => {
  const position = createInitialPosition(9);
  put(position, 4, 4, 'black');
  const unique = buildCompactCoachContext(request(position, '这颗黑棋有几口气？'));
  assert.ok(unique.choices.some(choice => choice.id === 'group.E5'));
  assert.equal(unique.payload.groups[0].libertyCount, 4);
  put(position, 1, 1, 'black');
  const ambiguous = buildCompactCoachContext(request(position, '这颗黑棋有几口气？'));
  assert.ok(ambiguous.choices.every(choice => !choice.id.startsWith('group.')));
  assert.deepEqual(ambiguous.payload.groups, []);
});

test('specific course wording remains available in a compound group question without sending the catalogue', () => {
  const position = createInitialPosition(9);
  put(position, 4, 4, 'black');
  for (const [question, id] of [
    ['倒扑是什么？再看看 E5 黑棋几口气。', 'course.go.tactics.snapback'],
    ['能把棋子放在格子里吗？再看看 E5 黑棋几口气。', 'course.go.rules.place-turn'],
    ['数地时棋子算分吗？再看看 E5 黑棋几口气。', 'course.go.rules.territory-dead'],
  ]) {
    const { choices } = buildCompactCoachContext(request(position, question));
    assert.ok(choices.some(choice => choice.id === id), `${question} must retrieve ${id}`);
    assert.ok(choices.some(choice => choice.id === 'group.E5'));
    assert.ok(choices.filter(choice => choice.kind !== 'position').length <= 4);
  }
});

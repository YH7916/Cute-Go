import assert from 'node:assert/strict';
import test from 'node:test';
import { engineTeachingChoices, verifiedCoachEngine } from '../agent/coach/engineEvidence';
import type { CoachEngineEvidence } from '../agent/coach/contract';
import { buildCompactCoachContext } from '../domains/coach/context';
import { buildCoachEvidence, coachPositionKey } from '../domains/coach/evidence';
import { buildCoachTeachingChoices, renderCoachResponse } from '../domains/coach/response';
import { createInitialPosition } from '../domains/game/positionState';

function analysis(extra: Partial<CoachEngineEvidence> = {}, size: 9 | 13 | 19 = 9, namedStone = false) {
  const position = createInitialPosition(size);
  if (namedStone) position.board[size - 1][size - 1] = { x: size - 1, y: size - 1, color: 'white', id: 'named' };
  const komi = size === 9 ? 3.5 : 7.5;
  const engine = verifiedCoachEngine({ kind: 'ask', position, userColor: 'black', intent: 'hint',
    config: { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' }, engineEvidence: {
      positionKey: coachPositionKey(position, 'black', komi), source: 'local-katago', perspective: 'black', visits: 8,
      winRateBlack: 64.2, estimatedBlackLead: 7.5,
      candidates: [{ point: { x: 3, y: 3 }, visits: 4, prior: 0.4, winRateBlack: 63 },
        { point: { x: 5, y: 5 }, visits: 2, prior: 0.2, winRateBlack: 45 }], ...extra,
    } }, komi);
  assert.ok(engine);
  return { engine, position, komi };
}

test('validated ownership becomes nine bounded regions and pass keeps actual search data', () => {
  const ownership = Float32Array.from({ length: 81 }, (_, i) => i % 9 < 3 ? 0.8 : i < 27 && i % 9 >= 6 ? -0.6 : 0);
  const { engine } = analysis({ ownership, pass: { visits: 1, prior: 0.03, winRateBlack: 48 } });
  assert.deepEqual(engine.pass, { visits: 1, prior: 0.03, winRateBlack: 48 });
  assert.equal(engine.ownership?.aggregation, 'search-visited-node-mean');
  assert.equal(engine.ownership?.regions.length, 9);
  assert.deepEqual(engine.ownership?.regions[0], { region: 'upper-left', meanBlack: 0.8 });
  assert.deepEqual(engine.ownership?.regions[2], { region: 'upper-right', meanBlack: -0.6 });
  assert.match(engine.limits.join(''), /搜索访问节点.*平均/);
  assert.match(engine.limits.join(''), /不是候选终局/);
  assert.equal(engine.winRateBlack, 64.2);
  assert.equal(engine.estimatedBlackLead, 7.5);
  ownership.fill(0);
  assert.equal(engine.ownership?.regions[0].meanBlack, 0.8, 'summary must not alias later model output');
});

for (const size of [9, 13, 19] as const) {
  test(`${size} board partitions every ownership intersection into nine areas`, () => {
    const { engine } = analysis({ ownership: new Float32Array(size * size).fill(-0.75) }, size);
    assert.equal(engine.ownership?.regions.length, 9);
    assert.ok(engine.ownership?.regions.every(region => region.meanBlack === -0.75));
  });
}

for (const ownership of [new Float32Array(80), new Float32Array(81).fill(NaN),
  new Float32Array(81).fill(Infinity), new Float32Array(81).fill(1.01), new Float32Array(81).fill(-1.01), null]) {
  test('invalid ownership is omitted without discarding valid candidates', () => {
    const { engine } = analysis({ ownership });
    assert.equal(engine.ownership, undefined);
    assert.equal(engine.candidates.length, 2);
  });
}

test('unvisited pass retains only its prior and never creates a value or a recommendation', () => {
  const { engine } = analysis({ pass: { visits: 0, prior: 0.8, winRateBlack: 99 } });
  assert.deepEqual(engine.pass, { visits: 0, prior: 0.8 });
  const choice = engineTeachingChoices(engine).find(choice => choice.id === 'engine.pass');
  assert.ok(choice);
  assert.match(choice.variants.join(''), /尚未.*访问/);
  assert.doesNotMatch(choice.variants.join(''), /建议停着|可以停着|更好|99/);
  assert.equal(analysis({ pass: { visits: 9 } }).engine.pass, undefined);
  assert.equal(analysis().engine.pass, undefined, 'no pass record must not be fabricated from an analysis response');
});

test('engine choices expose qualitative root, ownership, pass and same-perspective comparisons only', () => {
  const { engine } = analysis({ ownership: new Float32Array(81).fill(0.8), pass: { visits: 1, prior: 0.03, winRateBlack: 48 } });
  const choices = engineTeachingChoices(engine);
  for (const id of ['engine.root-value', 'engine.pass', 'engine.ownership.upper-left', 'engine.compare.D6.F4']) {
    const choice = choices.find(item => item.id === id);
    assert.ok(choice, id);
    assert.ok(renderCoachResponse(JSON.stringify({ kind: 'explain', text: choice.variants[0], refs: [id] }), choices, false, 9, 1), id);
  }
  assert.equal(choices.filter(choice => choice.id.startsWith('engine.ownership.')).length, 2);
  assert.doesNotMatch(choices.flatMap(choice => choice.variants).join(''), /64\.2|7\.5|63%|48%|必活|必死/);
  for (const text of ['黑棋胜率为64.2%。', '黑棋领先7.5目。']) {
    assert.deepEqual(renderCoachResponse(JSON.stringify({ kind: 'explain', text, refs: ['engine.root-value'] }), choices, false, 9, 1),
      { kind: 'explain', text, hintPoints: [] }, 'presentation does not infer numeric truth from qualitative variants');
  }
  const unvisited = analysis({ candidates: [{ point: { x: 3, y: 3 }, visits: 4, winRateBlack: 63 },
    { point: { x: 5, y: 5 }, visits: 0, winRateBlack: 45 }] }).engine;
  assert.ok(engineTeachingChoices(unvisited).every(choice => !choice.id.startsWith('engine.compare.')));
});

test('bounded engine summaries preserve named-group references and relevant pass facts in the cloud context', () => {
  const { engine, position, komi } = analysis({ ownership: new Float32Array(361).fill(-0.8), pass: { visits: 1, prior: 0.03, winRateBlack: 48 } }, 19, true);
  const evidence = buildCoachEvidence(position, 'white', komi);
  const choices = [...buildCoachTeachingChoices(evidence, { text: '' }), ...engineTeachingChoices(engine)];
  const { payload, choices: selected } = buildCompactCoachContext({ evidence, choices, question: 'T1 的白棋有几口气，现在能停着吗？',
    intent: 'explain-position', hintPoints: [], engineAnalysis: engine,
    history: Array.from({ length: 6 }, () => ({ positionKey: 'old', question: '旧问题'.repeat(50), answer: '旧解释'.repeat(100) })) });
  assert.ok(JSON.stringify(payload).length <= 6000);
  assert.ok(selected.length <= 12);
  assert.ok(selected.some(choice => choice.id === 'group.T1'));
  assert.ok(selected.some(choice => choice.id === 'engine.pass'));
  assert.ok(selected.some(choice => choice.id === 'concept.pass'));
  assert.deepEqual(payload.engineAnalysis, engine);
});

test('asking about the second and third visited candidates selects their comparison before generic pairs', () => {
  const { engine, position, komi } = analysis({ candidates: [
    { point: { x: 3, y: 3 }, visits: 4, winRateBlack: 63 },
    { point: { x: 5, y: 5 }, visits: 2, winRateBlack: 45 },
    { point: { x: 7, y: 7 }, visits: 1, winRateBlack: 30 },
  ] });
  const choices = engineTeachingChoices(engine);
  assert.equal(choices.filter(choice => choice.id.startsWith('engine.compare.')).length, 3);
  const requested = choices.find(choice => choice.id === 'engine.compare.F4.H2');
  assert.ok(requested, 'the comparison must not be limited to the highest two black-value candidates');
  assert.match(requested.variants[0], /F4.*H2.*偏向黑棋/);
  assert.doesNotMatch(requested.variants[0], /推荐|最好|应该下/);
  const evidence = buildCoachEvidence(position, 'white', komi);
  const context = buildCompactCoachContext({ evidence, choices: [...buildCoachTeachingChoices(evidence, { text: '' }), ...choices],
    question: 'F4 和 H2 相比哪个好？', intent: 'hint', hintPoints: [], engineAnalysis: engine });
  assert.equal(context.choices.find(choice => choice.id.startsWith('engine.compare.'))?.id, requested.id);
});

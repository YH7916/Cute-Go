import assert from 'node:assert/strict';
import test from 'node:test';
import { executeCoachAgent } from '../agent/coach/runtime';
import { createInitialPosition } from '../domains/game/positionState';
import { coachPositionKey } from '../domains/coach/evidence';

for (const color of ['black', 'white'] as const) {
  test(`offline coach ${color} recommends by search visits even when focus evidence arrives first`, async () => {
    const position = { ...createInitialPosition(9), currentPlayer: color };
    const candidates = [
      { point: { x: 0, y: 0 }, visits: 2, winRateBlack: 99, prior: 0.00002 },
      { point: { x: 4, y: 2 }, visits: 23, winRateBlack: 60, prior: 0.53 },
      { point: { x: 8, y: 8 }, visits: 2, winRateBlack: 1, prior: 0.00003 },
    ];
    const original = structuredClone(candidates);
    const result = await executeCoachAgent({ kind: 'inspect', position, userColor: color, intent: 'hint',
      config: { endpoint: '', provider: 'deepseek' as const, model: 'deepseek-flash', apiKey: '' }, engineEvidence: {
        source: 'local-katago', perspective: 'black', visits: 32,
        positionKey: coachPositionKey(position, color, 3.5), candidates,
      } });
    assert.deepEqual(result.hintPoints, [{ x: 4, y: 2, label: 'E7' }]);
    assert.equal(result.source, 'local');
    assert.deepEqual(candidates, original, 'choosing a recommendation must not mutate the input report');
  });
}

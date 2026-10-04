import assert from 'node:assert/strict';
import test from 'node:test';
import { getCoachPlacement, type CoachPlacementInput } from '../components/coach/coachPlacement';

const base: CoachPlacementInput = {
  viewport: { width: 900, height: 700 }, character: { width: 120, height: 160 },
  bubble: { width: 300, height: 180 }, anchor: { x: 100, y: 300 },
};

function assertInside(input: CoachPlacementInput) {
  const result = getCoachPlacement(input);
  const height = Math.min(input.bubble.height, result.bubble.maxHeight);
  assert.ok(result.character.x >= 12);
  assert.ok(result.character.y >= 12);
  assert.ok(result.character.x + input.character.width <= input.viewport.width - 12);
  assert.ok(result.character.y + input.character.height <= input.viewport.height - 12);
  assert.ok(result.bubble.x >= 12);
  assert.ok(result.bubble.y >= 12);
  assert.ok(result.bubble.x + result.bubble.width <= input.viewport.width - 12);
  assert.ok(result.bubble.y + height <= input.viewport.height - 12);
  assert.ok(result.bubble.width <= input.bubble.width);
  assert.ok(result.bubble.width >= 0 && result.bubble.maxHeight >= 0);
  const extent = result.side === 'left' || result.side === 'right' ? height : result.bubble.width;
  if (extent >= 48) assert.ok(result.tailOffset >= 24 && result.tailOffset <= extent - 24);
  else assert.equal(result.tailOffset, extent / 2);
  return result;
}

test('a side bubble follows the mouth with an 8 px gap and prefers the right', () => {
  const result = assertInside(base);
  assert.equal(result.side, 'right');
  assert.equal(result.bubble.width, 300);
  assert.equal(result.bubble.x - result.character.x - base.character.width, 8);
  assert.equal(result.bubble.y + result.tailOffset, result.character.y + base.character.height * 0.54);
});

test('near the right edge the bubble moves left without moving the character away', () => {
  const result = assertInside({ ...base, anchor: { x: 800, y: 300 } });
  assert.deepEqual(result.character, { x: 768, y: 300 });
  assert.equal(result.side, 'left');
  assert.equal(result.character.x - result.bubble.x - result.bubble.width, 8);
});

test('prefer a side that fits the full bubble before compressing the other side', () => {
  const result = assertInside({ ...base, viewport: { width: 760, height: 700 }, anchor: { x: 450, y: 300 } });
  assert.equal(result.side, 'left');
  assert.equal(result.bubble.width, 300);
});

test('when neither side fits the full width use the wider readable side', () => {
  const result = assertInside({ ...base, viewport: { width: 500, height: 700 }, anchor: { x: 200, y: 300 } });
  assert.equal(result.side, 'left');
  assert.equal(result.bubble.width, 180);
});

test('a naturally narrow bubble does not expand beyond its measured maximum width', () => {
  const result = assertInside({ ...base, viewport: { width: 320, height: 640 },
    bubble: { width: 140, height: 120 }, anchor: { x: 12, y: 300 } });
  assert.equal(result.side, 'right');
  assert.equal(result.bubble.width, 140);
});

test('short replies reserve the available height so a later long reply can grow', () => {
  for (const viewport of [base.viewport, { width: 320, height: 640 }]) {
    const input = { ...base, viewport, anchor: { x: 100, y: 300 } };
    const short = assertInside({ ...input, bubble: { width: 300, height: 60 } });
    const long = assertInside({ ...input, bubble: { width: 300, height: 900 } });
    assert.equal(short.side, long.side);
    assert.equal(short.bubble.maxHeight, long.bubble.maxHeight);
    assert.ok(short.bubble.maxHeight > 60);
  }
});

test('a narrow viewport uses above or below according to available room', () => {
  for (const [y, expected] of [[440, 'above'], [30, 'below']] as const) {
    const input = { ...base, viewport: { width: 320, height: 640 }, anchor: { x: 100, y } };
    const result = assertInside(input);
    assert.equal(result.side, expected);
    assert.equal(result.bubble.width, 296);
    assert.equal(result.bubble.x + result.tailOffset, result.character.x + input.character.width / 2);
    if (expected === 'above') assert.equal(result.character.y - result.bubble.y - input.bubble.height, 8);
    else assert.equal(result.bubble.y - result.character.y - input.character.height, 8);
  }
});

test('long explanations receive a bounded scroll height at all four screen corners', () => {
  for (const viewport of [{ width: 900, height: 700 }, { width: 320, height: 640 }, { width: 280, height: 280 }]) {
    for (const x of [-1000, 1000]) {
      for (const y of [-1000, 1000]) {
        const result = assertInside({ ...base, viewport, bubble: { width: 420, height: 1400 }, anchor: { x, y } });
        assert.ok(result.bubble.maxHeight < 1400);
      }
    }
  }
});

test('resizing keeps the same requested anchor bounded without stale viewport coordinates', () => {
  const anchor = { x: 720, y: 480 };
  for (const viewport of [{ width: 1000, height: 800 }, { width: 390, height: 844 }, { width: 640, height: 320 }]) {
    assertInside({ ...base, anchor, viewport });
  }
  assert.deepEqual(anchor, { x: 720, y: 480 });
});

test('tail offsets keep away from corners and tiny content uses its midpoint', () => {
  const long = assertInside({ ...base, anchor: { x: 100, y: 0 }, bubble: { width: 300, height: 900 } });
  assert.equal(long.tailOffset, base.character.height * 0.54);
  const short = assertInside({ ...base, bubble: { width: 300, height: 30 } });
  assert.equal(short.tailOffset, 15);
});

test('placement does not mutate its input and is deterministic', () => {
  const input = Object.freeze({
    viewport: Object.freeze({ width: 320, height: 640 }), character: Object.freeze({ width: 120, height: 160 }),
    bubble: Object.freeze({ width: 300, height: 900 }), anchor: Object.freeze({ x: -50, y: 750 }),
  });
  const before = structuredClone(input);
  assert.deepEqual(getCoachPlacement(input), getCoachPlacement(input));
  assert.deepEqual(input, before);
});

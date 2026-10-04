import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBoard } from '../core/board';
import { deferAiMove, type PositionSnapshot } from '../domains/game/deferredAiMove';

test('AI move accepted before reset must not land in a new game with a new AI lock', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let position: PositionSnapshot = { board: createBoard(9), history: [], player: 'white' };
  let applied = 0;
  const timer = { current: null as ReturnType<typeof setTimeout> | null };
  deferAiMove({ timer, readPosition: () => position, allowed: () => true, apply: () => applied++ });
  position = { board: createBoard(9), history: [], player: 'white' };
  t.mock.timers.tick(200);
  assert.equal(applied, 0);
});

test('undo and replay cannot accept a delayed move even when the board object matches', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let position: PositionSnapshot = { board: createBoard(9), history: [], player: 'white' };
  let applied = 0;
  deferAiMove({ timer: { current: null }, readPosition: () => position, allowed: () => true, apply: () => applied++ });
  position = { ...position, history: [] };
  t.mock.timers.tick(200);
  assert.equal(applied, 0);
});

test('the active delayed move applies once and exposes a cancellable timer', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const position: PositionSnapshot = { board: createBoard(9), history: [], player: 'white' };
  const timer = { current: null as ReturnType<typeof setTimeout> | null };
  let applied = 0;
  const options = { timer, readPosition: () => position, allowed: () => true, apply: () => applied++ };
  deferAiMove(options);
  assert.notEqual(timer.current, null);
  t.mock.timers.tick(200);
  assert.equal(applied, 1);
  assert.equal(timer.current, null);
  deferAiMove(options);
  clearTimeout(timer.current!);
  timer.current = null;
  t.mock.timers.tick(200);
  assert.equal(applied, 1);
});

test('superseded delayed moves cannot both play on one turn', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const position: PositionSnapshot = { board: createBoard(9), history: [], player: 'white' };
  const timer = { current: null as ReturnType<typeof setTimeout> | null };
  const applied: string[] = [];
  const options = { timer, readPosition: () => position, allowed: () => true };
  deferAiMove({ ...options, apply: () => applied.push('old') });
  deferAiMove({ ...options, apply: () => applied.push('new') });
  t.mock.timers.tick(200);
  assert.deepEqual(applied, ['new']);
});

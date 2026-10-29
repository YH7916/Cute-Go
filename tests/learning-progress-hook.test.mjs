import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { useLearningProgress, renderHook, storage, createInitialPosition } = await loadTestModule({
  reactHost: true,
  contents: `export { useLearningProgress } from './hooks/useLearningProgress';
    export { renderHook } from './tests/helpers/reactHooks';
    export { storage } from './services/coach/learningStorage';
    export { createInitialPosition } from './domains/game/positionState';`,
  plugins: [{ name: 'learning-storage-host', setup(build) {
    build.onResolve({ filter: /learningStorage$/ }, () => ({ path: 'learningStorage', namespace: 'learning-test' }));
    build.onLoad({ filter: /.*/, namespace: 'learning-test' }, () => ({ loader: 'js', contents: `
      export const storage = { records: new Map(), reads: new Map(), fail: false, writes: [], deleteGate: null };
      export function readLearningStorage(owner) {
        return storage.reads.get(owner) ?? Promise.resolve(storage.records.get(owner));
      }
      export async function writeLearningStorage(owner, value) {
        storage.writes.push(owner);
        if (storage.fail) throw new Error('private quota diagnostic');
        storage.records.set(owner, structuredClone(value));
      }
      export async function deleteLearningStorage(owner) {
        if (storage.deleteGate) await storage.deleteGate;
        if (storage.fail) throw new Error('delete failed');
        storage.records.delete(owner);
      }` }));
  } }],
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function attempt(overrides = {}) {
  return { attemptId: 'a1', skillId: 'go.liberties', exerciseId: 'e1', familyId: 'f1', contentRevision: 'v1',
    outcome: 'success', hintLevel: 0, occurredAt: 1000, source: 'practice', ...overrides };
}
function cursor(overrides = {}) {
  return { exerciseId: 'e1', contentRevision: 'v1', completed: false, updatedAt: 1000, ...overrides };
}
function setup(t, initialOwner = 'guest') {
  storage.records.clear(); storage.reads.clear(); storage.writes.length = 0; storage.fail = false; storage.deleteGate = null;
  let owner = initialOwner;
  const host = renderHook(() => useLearningProgress(owner));
  t.after(() => host.unmount());
  return { ...host, owner(value) { owner = value; } };
}

test('hook persists original attempts, keeps hint sequence, and rejects overwriting a failed first answer', async t => {
  const host = setup(t);
  assert.equal(host.render().loaded, false);
  await tick();
  let state = host.render();
  assert.equal(state.recordAttempt(attempt({ outcome: 'failure' })), true);
  state.recordExposure({ ...attempt(), exposureId: 'h1', hintLevel: 1 });
  assert.equal(state.recordAttempt(attempt()), false);
  state = host.render();
  assert.equal(state.attempts[0].outcome, 'failure');
  assert.equal(state.exposures[0].sequence, 2);
  await tick();
  assert.equal(host.render().saving, false);
  assert.equal(storage.records.get('guest').attempts[0].outcome, 'failure');
});

test('late reads and callbacks from a different owner cannot overwrite current learning data', async t => {
  const host = setup(t, 'A');
  let resolveA;
  storage.reads.set('A', new Promise(resolve => { resolveA = resolve; }));
  const old = host.render();
  host.owner('B');
  host.render();
  await tick();
  const state = host.render();
  assert.equal(state.recordAttempt(attempt({ attemptId: 'B-answer' })), true);
  resolveA({ version: 1, attempts: [{ ...attempt({ attemptId: 'A-answer' }), sequence: 1 }], exposures: [], savedPositions: [] });
  await tick();
  assert.equal(old.recordAttempt(attempt({ attemptId: 'stale' })), false);
  assert.deepEqual(host.render().attempts.map(item => item.attemptId), ['B-answer']);
  assert.deepEqual(storage.writes, ['B']);
});

test('failed saving retains usable memory, exposes only safe text, and backup can recover it', async t => {
  const host = setup(t);
  host.render(); await tick();
  storage.fail = true;
  host.render().recordAttempt(attempt());
  await tick();
  const state = host.render();
  assert.equal(state.saving, false);
  assert.equal(state.attempts.length, 1);
  assert.match(state.storageError, /尚未保存/);
  assert.ok(!state.storageError.includes('private'));
  assert.equal(JSON.parse(state.exportBackup()).attempts.length, 1);
  storage.fail = false;
  state.importBackup(state.exportBackup());
  await tick();
  assert.equal(host.render().storageError, '');
});

test('position collection participates in export/import/delete and copies the complete position', async t => {
  const host = setup(t);
  host.render(); await tick();
  const position = createInitialPosition(9);
  position.blackCaptures = 3;
  const state = host.render();
  assert.equal(state.savePosition({ id: 'p1', label: '我的错题', position, createdAt: 1000 }), true);
  position.blackCaptures = 99;
  const backup = state.exportBackup();
  assert.equal(JSON.parse(backup).savedPositions[0].position.blackCaptures, 3);
  state.deleteProgress();
  await tick();
  assert.equal(host.render().savedPositions.length, 0);
  assert.equal(storage.records.has('guest'), false);
  host.render().importBackup(backup);
  assert.equal(host.render().savedPositions[0].position.blackCaptures, 3);
  host.render().removePosition('p1');
  assert.equal(host.render().savedPositions.length, 0);
});

test('unmounted hook callbacks cannot restart persistence', async t => {
  const host = setup(t);
  host.render(); await tick();
  const state = host.render();
  host.unmount();
  assert.equal(state.recordAttempt(attempt()), false);
  assert.equal(storage.writes.length, 0);
});

test('a failed read protects existing storage while allowing explicitly unsaved in-memory work', async t => {
  const host = setup(t);
  const original = { version: 1, attempts: [{ ...attempt({ attemptId: 'old' }), sequence: 1 }], exposures: [], savedPositions: [] };
  storage.records.set('guest', original);
  storage.reads.set('guest', Promise.reject(new Error('read failure')));
  host.render(); await tick();
  assert.equal(host.render().recordAttempt(attempt()), true);
  await tick();
  assert.equal(storage.writes.length, 0);
  assert.deepEqual(storage.records.get('guest'), original);
  assert.equal(host.render().attempts.length, 1);
  assert.match(host.render().storageError, /暂停保存/);
  assert.equal(JSON.parse(host.render().exportBackup()).attempts[0].attemptId, 'a1');
});

test('corrupt stored data is never replaced until an explicit delete succeeds', async t => {
  const host = setup(t);
  const invalid = { version: 999, privateOriginal: 'keep for recovery' };
  storage.records.set('guest', invalid);
  host.render(); await tick();
  host.render().recordAttempt(attempt());
  await tick();
  assert.deepEqual(storage.records.get('guest'), invalid);
  assert.equal(storage.writes.length, 0);
  storage.fail = true;
  host.render().deleteProgress();
  await tick();
  host.render().recordAttempt(attempt({ attemptId: 'after-failed-delete' }));
  await tick();
  assert.deepEqual(storage.records.get('guest'), invalid);
  assert.equal(storage.writes.length, 0);
  storage.fail = false;
  host.render().deleteProgress();
  await tick();
  host.render().recordAttempt(attempt({ attemptId: 'after-explicit-delete' }));
  await tick();
  assert.equal(storage.records.get('guest').attempts[0].attemptId, 'after-explicit-delete');
  assert.equal(host.render().storageError, '');
});

test('invalid imported backup leaves loaded memory and storage untouched', async t => {
  const host = setup(t);
  host.render(); await tick();
  host.render().recordAttempt(attempt()); await tick();
  const state = host.render();
  const before = state.exportBackup();
  assert.throws(() => state.importBackup('{invalid'));
  assert.equal(host.render().exportBackup(), before);
  assert.equal(storage.writes.length, 1);
});

test('memory work during protected deletion saves only after deletion actually succeeds', async t => {
  const host = setup(t);
  storage.records.set('guest', { version: 999 });
  host.render(); await tick();
  let releaseDelete;
  storage.deleteGate = new Promise(resolve => { releaseDelete = resolve; });
  host.render().deleteProgress();
  host.render().recordAttempt(attempt({ attemptId: 'during-deletion' }));
  assert.equal(storage.writes.length, 0);
  releaseDelete(); await tick();
  assert.equal(storage.records.get('guest').attempts[0].attemptId, 'during-deletion');
  assert.equal(host.render().saving, false);
  assert.equal(host.render().storageError, '');
});

test('opening a course cursor survives a fresh hook without attempts, exposure or shared input references', async t => {
  const host = setup(t);
  assert.equal(host.render().setCourseCursor(cursor()), false, 'loading cannot overwrite persisted progress');
  await tick();
  const input = cursor();
  assert.equal(host.render().setCourseCursor(input), true);
  input.exerciseId = 'mutated';
  await tick();
  assert.deepEqual(storage.records.get('guest'), {
    version: 1, attempts: [], exposures: [], savedPositions: [], courseCursor: cursor(),
  });
  const old = host.render();
  assert.deepEqual(Object.keys(old.progress), []);
  assert.deepEqual(old.attemptedFamilyIds, []);
  assert.deepEqual(old.exposedFamilyIds, []);
  host.unmount();
  assert.equal(old.setCourseCursor(cursor({ exerciseId: 'stale' })), false);
  const reloaded = renderHook(() => useLearningProgress('guest'));
  t.after(() => reloaded.unmount());
  assert.equal(reloaded.render().loaded, false);
  await tick();
  assert.deepEqual(reloaded.render().courseCursor, cursor());
  assert.equal(storage.writes.length, 1);
});

test('owner switching rejects old cursor callbacks during and after the next owner loads', async t => {
  const host = setup(t, 'A');
  host.render(); await tick();
  const old = host.render();
  assert.equal(old.setCourseCursor(cursor()), true);
  let resolveB;
  storage.reads.set('B', new Promise(resolve => { resolveB = resolve; }));
  host.owner('B');
  assert.equal(host.render().setCourseCursor(cursor()), false);
  assert.equal(old.setCourseCursor(cursor({ exerciseId: 'stale' })), false);
  resolveB(undefined); await tick();
  assert.equal(host.render().courseCursor, undefined);
  const next = cursor({ exerciseId: 'B-exercise' });
  assert.equal(host.render().setCourseCursor(next), true);
  assert.equal(old.setCourseCursor(cursor({ exerciseId: 'stale' })), false);
  assert.deepEqual(host.render().courseCursor, next);
  assert.deepEqual(storage.records.get('A').courseCursor, cursor());
  assert.deepEqual(storage.records.get('B').courseCursor, next);
  assert.deepEqual(storage.writes, ['A', 'B']);
});

test('course outcomes atomically update only a matching cursor in the same persisted record', async t => {
  const host = setup(t);
  host.render(); await tick();
  const state = host.render();
  state.setCourseCursor(cursor());
  for (const [index, outcome] of ['success', 'failure', 'success', 'abandoned', 'success', 'unverified'].entries()) {
    const input = attempt({ attemptId: `course-${index}`, source: 'course', outcome, occurredAt: 2000 + index });
    const count = storage.writes.length;
    assert.equal(state.recordAttempt(input), true);
    assert.equal(storage.writes.length, count + 1, 'attempt and cursor use one commit');
    const saved = storage.records.get('guest');
    assert.deepEqual(saved.courseCursor, cursor({ completed: outcome === 'success', updatedAt: input.occurredAt }));
    assert.equal(saved.attempts.at(-1).outcome, outcome);
    assert.equal(saved.attempts.at(-1).sequence, index + 1, 'cursor writes do not consume evidence sequences');
    assert.deepEqual(host.render().courseCursor, saved.courseCursor);
  }
  const before = state.exportBackup();
  assert.equal(state.recordAttempt(attempt({ attemptId: 'course-0', source: 'course' })), false);
  assert.equal(state.exportBackup(), before, 'duplicate attempts cannot change cursor completion');
});

test('practice, review, different course exercises and revisions cannot move or complete the course cursor', async t => {
  const host = setup(t);
  host.render(); await tick();
  const state = host.render();
  assert.equal(state.recordAttempt(attempt({ attemptId: 'before-cursor', source: 'course' })), true);
  assert.equal(host.render().courseCursor, undefined, 'attempts do not invent a navigation cursor');
  state.setCourseCursor(cursor());
  for (const [index, context] of [
    { source: 'practice' }, { source: 'review' }, { source: 'game' },
    { source: 'course', exerciseId: 'different' }, { source: 'course', contentRevision: 'v2' },
  ].entries()) {
    assert.equal(state.recordAttempt(attempt({ attemptId: `unrelated-${index}`, occurredAt: 3000 + index, ...context })), true);
    assert.deepEqual(host.render().courseCursor, cursor());
    assert.deepEqual(storage.records.get('guest').courseCursor, cursor());
  }
  state.recordExposure({ ...attempt({ source: 'course' }), exposureId: 'hint', hintLevel: 1 });
  assert.deepEqual(host.render().courseCursor, cursor());
});

test('invalid stored cursor protects the original data; explicit deletion clears the pointer and unlocks saves', async t => {
  const host = setup(t);
  const invalid = { version: 1, attempts: [], exposures: [], savedPositions: [], courseCursor: { ...cursor(), updatedAt: -1 } };
  storage.records.set('guest', invalid);
  host.render(); await tick();
  assert.match(host.render().storageError, /暂停保存/);
  assert.equal(host.render().setCourseCursor(cursor()), true);
  assert.deepEqual(host.render().courseCursor, cursor());
  assert.deepEqual(storage.records.get('guest'), invalid);
  assert.equal(storage.writes.length, 0);
  host.render().deleteProgress(); await tick();
  assert.equal(host.render().courseCursor, undefined);
  assert.equal(Object.hasOwn(JSON.parse(host.render().exportBackup()), 'courseCursor'), false);
  assert.equal(storage.records.has('guest'), false);
  assert.equal(host.render().setCourseCursor(cursor({ exerciseId: 'after-delete' })), true);
  await tick();
  assert.equal(storage.records.get('guest').courseCursor.exerciseId, 'after-delete');
  assert.equal(host.render().storageError, '');
});

test('cursor imports choose newer timestamps and reject malformed updates without changing memory or storage', async t => {
  const host = setup(t);
  host.render(); await tick();
  const state = host.render();
  state.setCourseCursor(cursor());
  const backup = JSON.parse(state.exportBackup());
  for (const updatedAt of [1000, 999, 1001]) {
    const incoming = cursor({ exerciseId: 'imported', completed: true, updatedAt });
    state.importBackup(JSON.stringify({ ...backup, courseCursor: incoming }));
    const expected = updatedAt > 1000 ? incoming : cursor();
    assert.deepEqual(host.render().courseCursor, expected);
    assert.deepEqual(storage.records.get('guest').courseCursor, expected);
  }
  const before = state.exportBackup();
  const writes = storage.writes.length;
  assert.throws(() => state.importBackup(JSON.stringify({ ...backup, courseCursor: null })));
  assert.equal(state.setCourseCursor({ ...cursor(), completed: 'yes' }), false);
  assert.equal(state.exportBackup(), before);
  assert.equal(JSON.stringify(storage.records.get('guest')), JSON.stringify(JSON.parse(before)));
  assert.equal(storage.writes.length, writes);
});

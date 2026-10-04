import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { readLearningStorage, writeLearningStorage, deleteLearningStorage } = await loadTestModule({
  entryPoint: 'services/coach/learningStorage.ts',
});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

// Transaction host: deliberately separates request success from commit. This
// verifies adapter ordering/error handling, not a browser's IndexedDB engine.
function setup(t) {
  const values = new Map();
  const transactions = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  let closed = 0;
  const factory = { open() {
    const database = {
      close() { closed++; },
      createObjectStore() {},
      transaction() {
        const transaction = { objectStore: () => ({
          get: key => request('read', key), put: (value, key) => request('write', key, value), delete: key => request('delete', key),
        }) };
        function request(operation, key, value) {
          const result = {};
          const event = { operation, key,
            commit() {
              if (operation === 'write') values.set(key, structuredClone(value));
              if (operation === 'delete') values.delete(key);
              transaction.oncomplete();
            },
            abort() { transaction.onabort(); },
          };
          transactions.push(event);
          queueMicrotask(() => { result.result = operation === 'read' ? values.get(key) : undefined; result.onsuccess(); });
          return result;
        }
        return transaction;
      },
    };
    const request = { result: database };
    queueMicrotask(() => request.onsuccess());
    return request;
  } };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: factory });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  });
  return { values, transactions, closed: () => closed };
}

test('IndexedDB adapter waits for commit, snapshots writes and serializes same-owner operations', async t => {
  const fixture = setup(t);
  const input = { revision: 1 };
  let complete = false;
  const first = writeLearningStorage('A', input).then(() => { complete = true; });
  input.revision = 9;
  const second = writeLearningStorage('A', { revision: 2 });
  const queuedRead = readLearningStorage('A');
  await tick();
  assert.equal(fixture.transactions.length, 1);
  assert.equal(complete, false, 'request success alone must not claim persistence');
  fixture.transactions[0].commit();
  await first;
  assert.equal(fixture.values.get('A').revision, 1);
  await tick();
  assert.equal(fixture.transactions.length, 2);
  fixture.transactions[1].commit();
  await second;
  assert.equal(fixture.values.get('A').revision, 2);
  await tick();
  assert.equal(fixture.transactions.length, 3);
  fixture.transactions[2].commit();
  assert.deepEqual(await queuedRead, { revision: 2 });
  assert.equal(fixture.closed(), 3);
});

test('aborted transaction is reported and does not poison subsequent saves or another owner', async t => {
  const fixture = setup(t);
  const failed = writeLearningStorage('A', { original: true });
  const rejected = assert.rejects(failed, /aborted/);
  const other = writeLearningStorage('B', { other: true });
  await tick();
  fixture.transactions.find(item => item.key === 'A').abort();
  fixture.transactions.find(item => item.key === 'B').commit();
  await Promise.all([rejected, other]);
  assert.equal(fixture.values.has('A'), false);
  const retry = writeLearningStorage('A', { recovered: true });
  await tick();
  fixture.transactions.at(-1).commit(); await retry;
  const read = readLearningStorage('A');
  await tick(); fixture.transactions.at(-1).commit();
  assert.deepEqual(await read, { recovered: true });
  const remove = deleteLearningStorage('A');
  await tick(); fixture.transactions.at(-1).commit(); await remove;
  assert.equal(fixture.values.has('A'), false);
  assert.equal(fixture.values.get('B').other, true);
});

test('unavailable IndexedDB rejects instead of claiming durable storage', async t => {
  setup(t);
  Reflect.deleteProperty(globalThis, 'indexedDB');
  await assert.rejects(readLearningStorage('unavailable'), /unavailable/);
});

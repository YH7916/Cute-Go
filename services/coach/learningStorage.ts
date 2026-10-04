const DATABASE = 'cute-go-learning';
const STORE = 'owners';

// Storage transports unknown data. The owning hook validates its domain record;
// this adapter does not depend on teaching logic or trust stored JSON.
async function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') throw new Error('IndexedDB unavailable');
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => { request.result.createObjectStore(STORE); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new Error('Learning storage open failed'));
    request.onblocked = () => { blocked = true; reject(new Error('Learning storage blocked')); };
  });
}

async function transact(ownerScopeId: string, operation: 'read' | 'write' | 'delete', value?: unknown): Promise<unknown> {
  if (!ownerScopeId) throw new Error('Learning owner required');
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, operation === 'read' ? 'readonly' : 'readwrite');
      const store = transaction.objectStore(STORE);
      const request = operation === 'read' ? store.get(ownerScopeId)
        : operation === 'delete' ? store.delete(ownerScopeId) : store.put(value, ownerScopeId);
      let result: unknown;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(new Error('Learning storage transaction failed'));
      transaction.onabort = () => reject(new Error('Learning storage transaction aborted'));
    });
  } finally { database.close(); }
}

const pending = new Map<string, Promise<unknown>>();
function ordered(owner: string, operation: 'read' | 'write' | 'delete', value?: unknown): Promise<unknown> {
  const previous = pending.get(owner) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(() => transact(owner, operation, value));
  pending.set(owner, next);
  void next.finally(() => { if (pending.get(owner) === next) pending.delete(owner); }).catch(() => undefined);
  return next;
}
export function readLearningStorage(owner: string): Promise<unknown> { return ordered(owner, 'read'); }
export function writeLearningStorage(owner: string, value: unknown): Promise<unknown> { return ordered(owner, 'write', structuredClone(value)); }
export function deleteLearningStorage(owner: string): Promise<unknown> { return ordered(owner, 'delete'); }

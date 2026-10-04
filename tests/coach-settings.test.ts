import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_STORAGE_KEY, defaultCoachConfig, readCoachSettings, writeCoachSettings } from '../services/coach/settings';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}

test('coach defaults to remembering the key and preserves a saved opt-out', () => {
  const store = storage();
  const initial = readCoachSettings(store);
  assert.equal(initial.config.endpoint, 'https://api.deepseek.com');
  assert.equal(initial.config.apiKey, '');
  assert.equal(initial.rememberKey, true);
  assert.equal(store.values.size, 0);
  writeCoachSettings(store, { ...initial.config, apiKey: 'memory-only-secret' }, false);
  assert.ok(!store.values.get(COACH_STORAGE_KEY)?.includes('memory-only-secret'));
  assert.deepEqual(readCoachSettings(store), { ...initial, rememberKey: false });
});

test('saving with the default remembers the key and opting out removes it', () => {
  const store = storage();
  const config = { ...defaultCoachConfig(), apiKey: 'remembered-secret' };
  writeCoachSettings(store, config, readCoachSettings(store).rememberKey);
  assert.equal(readCoachSettings(store).config.apiKey, config.apiKey);
  writeCoachSettings(store, config, false);
  assert.ok(!store.values.get(COACH_STORAGE_KEY)?.includes(config.apiKey));
  assert.equal(readCoachSettings(store).config.apiKey, '');
  store.values.set(COACH_STORAGE_KEY, JSON.stringify({ ...config, rememberKey: false }));
  assert.equal(readCoachSettings(store).config.apiKey, '', 'a key without an opt-in is ignored');
});

test('overwriting failure after removing old settings cannot leave a previously remembered key', () => {
  const store = storage();
  writeCoachSettings(store, { ...defaultCoachConfig(), apiKey: 'old-secret' }, true);
  store.setItem = () => { throw new Error('quota'); };
  assert.throws(() => writeCoachSettings(store, { ...defaultCoachConfig(), apiKey: '' }, false));
  assert.equal(store.values.has(COACH_STORAGE_KEY), false);
});

test('corrupt or invalid stored config falls back without reusing credentials', () => {
  const store = storage();
  for (const raw of ['bad-json', 'null', '[]', JSON.stringify({ endpoint: 'http://remote.test', model: 'model', apiKey: 'secret', rememberKey: true })]) {
    store.values.set(COACH_STORAGE_KEY, raw);
    assert.deepEqual(readCoachSettings(store), { config: defaultCoachConfig(), rememberKey: true });
  }
});

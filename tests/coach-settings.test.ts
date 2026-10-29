import assert from 'node:assert/strict';
import test from 'node:test';
import { COACH_STORAGE_KEY, defaultCoachConfig, readCoachSettings, writeCoachSettings } from '../services/coach/settings';

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}

test('coach keeps new keys in memory by default and preserves a saved opt-out', () => {
  const store = storage();
  const initial = readCoachSettings(store);
  assert.equal(initial.config.endpoint, '');
  assert.equal(initial.config.provider, 'deepseek');
  assert.equal(initial.config.model, 'deepseek-flash');
  assert.equal(initial.config.apiKey, '');
  assert.equal(initial.rememberKey, false);
  assert.equal(store.values.size, 0);
  writeCoachSettings(store, { ...initial.config, apiKey: 'memory-only-secret' }, false);
  assert.ok(!store.values.get(COACH_STORAGE_KEY)?.includes('memory-only-secret'));
  assert.deepEqual(readCoachSettings(store), { ...initial, rememberKey: false });
});

test('only an explicit opt-in remembers the key and opting out removes it', () => {
  const store = storage();
  const config = { ...defaultCoachConfig(), apiKey: 'remembered-secret' };
  writeCoachSettings(store, config, true);
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
    assert.deepEqual(readCoachSettings(store), { config: defaultCoachConfig(), rememberKey: false });
  }
});

test('v1 provider credentials and v2 backend credentials are removed without migration', () => {
  const store = storage();
  store.values.set('cutego.coach.settings.v1', JSON.stringify({ endpoint: 'https://provider.example/v1',
    model: 'old-model', apiKey: 'old-provider-secret', rememberKey: true }));
  store.values.set('cutego.coach.settings.v2', JSON.stringify({ endpoint: 'https://coach.example/api/coach',
    accessToken: 'old-backend-secret', rememberToken: true }));
  const current = readCoachSettings(store);
  assert.deepEqual(current.config, defaultCoachConfig());
  assert.equal(store.values.has('cutego.coach.settings.v1'), false);
  assert.equal(store.values.has('cutego.coach.settings.v2'), false);
  assert.ok(!JSON.stringify(current).includes('old-provider-secret'));
  assert.ok(!JSON.stringify(current).includes('old-backend-secret'));
  assert.equal(COACH_STORAGE_KEY, 'cutego.coach.settings.v3');
});

test('v3 preserves the chosen provider and custom model without persisting an opted-out key', () => {
  const store = storage();
  const config = { endpoint: 'https://coach.example/api/coach', provider: 'openai' as const,
    model: 'custom-model', apiKey: 'private-model-key' };
  writeCoachSettings(store, config, false);
  assert.deepEqual(readCoachSettings(store), { config: { ...config, apiKey: '' }, rememberKey: false });
  assert.ok(!store.values.get(COACH_STORAGE_KEY)?.includes('private-model-key'));
});

test('saving v3 directly clears both legacy records and refuses unsupported model configuration', () => {
  const store = storage();
  store.values.set('cutego.coach.settings.v1', 'old-model-secret');
  store.values.set('cutego.coach.settings.v2', 'old-backend-secret');
  writeCoachSettings(store, defaultCoachConfig(), false);
  assert.equal(store.values.has('cutego.coach.settings.v1'), false);
  assert.equal(store.values.has('cutego.coach.settings.v2'), false);
  for (const fields of [{ provider: 'untrusted-provider' }, { model: '' }, { model: 'model\nheader' }]) {
    store.values.set(COACH_STORAGE_KEY, JSON.stringify({ ...defaultCoachConfig(), ...fields,
      apiKey: 'should-not-be-reused', rememberKey: true }));
    assert.deepEqual(readCoachSettings(store), { config: defaultCoachConfig(), rememberKey: false });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

const { useCoachSettings, renderHook } = await loadTestModule({ reactHost: true, contents: `
  export { useCoachSettings } from './hooks/useCoachSettings';
  export { renderHook } from './tests/helpers/reactHooks';
` });

function setup(t) {
  const values = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  const host = renderHook(useCoachSettings);
  t.after(() => {
    host.unmount();
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  return { ...host, storage, values };
}

test('config hook keeps the current credential in memory and drops it on a fresh mount', t => {
  const host = setup(t);
  let state = host.render();
  state.saveConfig({ ...state.config, apiKey: 'only-memory' }, false);
  state = host.render();
  assert.equal(state.config.apiKey, 'only-memory');
  assert.ok(!JSON.stringify([...host.values]).includes('only-memory'));
  const reopened = renderHook(useCoachSettings);
  assert.equal(reopened.render().config.apiKey, '');
  reopened.unmount();
});

test('config hook explicit clear removes remembered and in-memory credentials', t => {
  const host = setup(t);
  let state = host.render();
  state.saveConfig({ ...state.config, apiKey: 'remember-this' }, true);
  state = host.render();
  assert.equal(state.rememberKey, true);
  state.clearKey();
  state = host.render();
  assert.equal(state.config.apiKey, '');
  assert.equal(state.rememberKey, false);
  assert.ok(!JSON.stringify([...host.values]).includes('remember-this'));
});

test('storage exceptions leave usable session configuration and show only safe local error text', t => {
  const host = setup(t);
  const state = host.render();
  host.storage.setItem = () => { throw new Error('sensitive storage diagnostic'); };
  state.saveConfig({ ...state.config, apiKey: 'memory-after-failure' }, true);
  const current = host.render();
  assert.equal(current.config.apiKey, 'memory-after-failure');
  assert.equal(current.rememberKey, false);
  assert.match(current.storageError, /本机存储不可用/);
  assert.ok(!current.storageError.includes('sensitive'));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// The minimal hook host checks callback ownership and cleanup. Native hardware
// and React scheduling still require the browser/device acceptance paths.
async function setup(t, { enabled = true, native = false, tap = false } = {}) {
  let resolveImport, rejectImport;
  const state = {
    imported: 0, impacts: [], web: [], tap: [],
    loading: new Promise((resolve, reject) => { resolveImport = resolve; rejectImport = reject; }),
  };
  const globals = {
    __audioHaptics: state,
    window: {
      ...(native ? { Capacitor: { isNativePlatform: () => true } } : {}),
      ...(tap ? { tap: { vibrateShort: options => state.tap.push(options.type) } } : {}),
    },
    document: Object.assign(new EventTarget(), { hidden: false }),
    navigator: { vibrate: pattern => { state.web.push(pattern); return true; } },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let unmount = () => {};
  t.after(() => {
    unmount();
    for (const [key, value] of previous) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const { useAudio, renderHook } = await loadTestModule({
    registerCleanup: cleanup => t.after(cleanup), reactHost: true,
    contents: `export { useAudio } from './hooks/useAudio'; export { renderHook } from './tests/helpers/reactHooks';`,
    plugins: [{ name: 'controlled-capacitor-haptics', setup(build) {
      build.onResolve({ filter: /^@capacitor\/haptics$/ }, () => ({ path: 'haptics', namespace: 'controlled-haptics' }));
      build.onLoad({ filter: /.*/, namespace: 'controlled-haptics' }, () => ({ contents: `
        const state = globalThis.__audioHaptics;
        state.imported++;
        await state.loading;
        export const Haptics = { impact(options) { state.impacts.push(options); return Promise.resolve(); } };
        export const ImpactStyle = { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' };
      `, loader: 'js' }));
    } }],
  });
  const host = renderHook(() => useAudio(0, enabled));
  let api = host.render(), mounted = true;
  unmount = () => { if (mounted) { mounted = false; host.unmount(); } };
  const flush = () => new Promise(resolve => setImmediate(resolve));
  return {
    state, unmount, flush, get api() { return api; },
    update(value) { enabled = value; api = host.render(); return api; },
    async finishImport(error) {
      if (error) rejectImport(error); else resolveImport();
      await flush();
    },
  };
}

for (const platform of ['web', 'tap', 'native']) {
  test(`haptics: initially disabled blocks ${platform} without invoking an API`, async t => {
    const s = await setup(t, { enabled: false, [platform]: true });
    s.api.vibrate(30);
    await s.flush();
    assert.deepEqual([s.state.web, s.state.tap, s.state.impacts], [[], [], []]);
    assert.equal(s.state.imported, 0);
  });
}

for (const platform of ['web', 'tap']) {
  test(`haptics: retained ${platform} callback obeys the latest setting and unmount`, async t => {
    const s = await setup(t, { [platform]: true });
    const retained = s.api.vibrate;
    s.update(false);
    retained(20);
    assert.deepEqual([s.state.web, s.state.tap], [[], []], 'an old callback must not bypass a disabled setting');
    s.update(true);
    retained(30);
    assert.equal(s.state[platform].length, 1, 'a newly requested vibration can run after re-enabling');
    s.unmount();
    const afterUnmount = [...s.state[platform]];
    retained(40);
    assert.deepEqual(s.state[platform], afterUnmount);
  });
}

test('haptics: disabling cancels a running Web pattern and re-enabling accepts only new calls', async t => {
  const s = await setup(t);
  s.api.vibrate([50, 50, 50]);
  s.update(false);
  assert.deepEqual(s.state.web, [[50, 50, 50], 0]);
  s.update(true);
  assert.deepEqual(s.state.web, [[50, 50, 50], 0]);
  s.api.vibrate(10);
  assert.deepEqual(s.state.web, [[50, 50, 50], 0, 10]);
  s.unmount();
  assert.deepEqual(s.state.web, [[50, 50, 50], 0, 10, 0]);
});

for (const outcome of ['success', 'failure']) {
  for (const transition of ['disable', 'disable-enable', 'unmount']) {
    test(`haptics: late Capacitor ${outcome} cannot vibrate after ${transition}`, async t => {
      const s = await setup(t, { native: true });
      s.api.vibrate(80);
      await s.flush();
      assert.equal(s.state.imported, 1, 'the import must be waiting before the setting changes');
      if (transition === 'unmount') s.unmount();
      else {
        s.update(false);
        if (transition === 'disable-enable') s.update(true);
      }
      await s.finishImport(outcome === 'failure' ? new Error('plugin unavailable') : undefined);
      assert.deepEqual(s.state.impacts, []);
      assert.deepEqual(s.state.web, [], 'an obsolete import failure must not fall back to Web vibration');
      if (transition === 'disable-enable') {
        s.api.vibrate(10);
        await s.flush();
        assert.deepEqual(outcome === 'success' ? s.state.impacts : s.state.web,
          outcome === 'success' ? [{ style: 'LIGHT' }] : [10]);
      }
    });
  }
}

test('haptics: TapTap keeps priority over Capacitor and Web', async t => {
  const s = await setup(t, { tap: true, native: true });
  s.api.vibrate(30);
  await s.flush();
  assert.deepEqual(s.state.tap, ['medium']);
  assert.equal(s.state.imported, 0);
  assert.deepEqual([s.state.web, s.state.impacts], [[], []]);
});

test('haptics: current Capacitor calls preserve impact strength', async t => {
  const s = await setup(t, { native: true });
  s.api.vibrate([21, 30, 20]);
  await s.finishImport();
  s.api.vibrate(51);
  await s.flush();
  assert.deepEqual(s.state.impacts, [{ style: 'MEDIUM' }, { style: 'HEAVY' }]);
  assert.deepEqual(s.state.web, []);
});

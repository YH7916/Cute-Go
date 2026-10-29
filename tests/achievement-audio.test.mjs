import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

async function setup(t, { kind, volume }) {
  const code = kind === 'login' ? 'COMPANION_3' : 'TENGEN_LOVER';
  let resolveSave;
  const pendingSave = new Promise(resolve => { resolveSave = resolve; });
  const state = { requests: [], plays: [], legacyPlays: [], loaded: [] };
  const today = new Date();
  const previousDay = new Date(today);
  previousDay.setDate(today.getDate() - 1);
  const storage = new Map([['last_login_date_player', (kind === 'login' ? previousDay : today).toDateString()]]);
  const platform = { achievements: {
    async loadForUser() {
      return kind === 'login'
        ? [{ achievement_code: code, current_value: 2, is_unlocked: false, unlocked_at: null }]
        : [];
    },
    upsertProgress(input) {
      state.requests.push(input);
      return input.achievementCode === code ? pendingSave : Promise.resolve({});
    },
  } };
  class AudioContextStub {
    state = 'running';
    destination = {};
    async decodeAudioData(buffer) { return { asset: new TextDecoder().decode(buffer) }; }
    createBufferSource() {
      const source = {
        buffer: null, gain: null,
        connect(gain) { this.gain = gain; },
        start() { state.plays.push({ asset: this.buffer.asset, volume: this.gain.gain.value }); },
        stop() {}, disconnect() {},
      };
      return source;
    }
    createGain() { return { gain: { value: 0 }, connect() {} }; }
    async close() {}
  }
  const globals = {
    __achievementAudioPlatform: platform,
    window: { AudioContext: AudioContextStub },
    document: Object.assign(new EventTarget(), { hidden: false }),
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch: async asset => {
      state.loaded.push(asset);
      return { arrayBuffer: async () => new TextEncoder().encode(asset).buffer };
    },
    Audio: class {
      constructor(asset) { this.asset = asset; }
      async play() { state.legacyPlays.push(this.asset); }
    },
  };
  const previous = new Map(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  let host;
  t.after(() => {
    host?.unmount();
    for (const [key, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const { useAudio, useAchievements, renderHook } = await loadTestModule({
    registerCleanup: cleanup => t.after(cleanup), reactHost: true,
    contents: `
      export { useAudio } from './hooks/useAudio';
      export { useAchievements } from './hooks/useAchievements';
      export { renderHook } from './tests/helpers/reactHooks';
    `,
    plugins: [{ name: 'achievement-persistence', setup(build) {
      build.onResolve({ filter: /^\.\.\/services\/platform$/ }, () => ({ path: 'platform', namespace: 'achievement-persistence' }));
      build.onLoad({ filter: /.*/, namespace: 'achievement-persistence' }, () => ({
        contents: 'export const getPlatform = () => globalThis.__achievementAudioPlatform;', loader: 'js',
      }));
    } }],
  });
  host = renderHook(() => {
    const { playSfx } = useAudio(volume, false);
    return useAchievements('player', () => playSfx('win'));
  });
  let api = host.render();
  const flush = () => new Promise(resolve => setImmediate(resolve));
  await flush();
  api = host.render();
  if (kind === 'ordinary') api.checkMoveAchievements({ x: 4, y: 4, color: 'black', moveNumber: 1, boardSize: 9 });
  assert.equal(state.requests[0].achievementCode, code, 'the real achievement path must reach persistence');
  assert.deepEqual(state.plays, [], 'do not play while saving');
  return {
    state, code,
    updateVolume(value) { volume = value; api = host.render(); },
    async finishSave(result = {}) {
      resolveSave(result);
      await flush();
      api = host.render();
      return api;
    },
  };
}

for (const kind of ['ordinary', 'login']) {
  for (const scenario of [
    { name: 'initial mute', initial: 0, final: 0 },
    { name: 'mute during persistence', initial: 0.3, final: 0 },
    { name: 'normal volume', initial: 0.3, final: 0.3 },
    { name: 'volume changed during persistence', initial: 0.1, final: 0.6 },
  ]) {
    test(`achievement audio: ${kind}, ${scenario.name}`, async t => {
      const s = await setup(t, { kind, volume: scenario.initial });
      s.updateVolume(scenario.final);
      const api = await s.finishSave();
      assert.equal(api.newUnlocked.code, s.code, 'muting must preserve the achievement notice');
      assert.equal(api.userAchievements[s.code].is_unlocked, true);
      assert.deepEqual(s.state.legacyPlays, [], 'achievement sounds must use the common audio path');
      assert.ok(s.state.loaded.includes('win.wav'), 'reuse the existing relative deployment asset');
      assert.deepEqual(s.state.plays, scenario.final === 0 ? [] : [
        { asset: 'win.wav', volume: scenario.final + 0.2 },
      ]);
    });
  }
}

test('achievement audio: a failed ordinary achievement save keeps the existing silent failure policy', async t => {
  const s = await setup(t, { kind: 'ordinary', volume: 0.3 });
  const api = await s.finishSave({ error: 'storage unavailable' });
  assert.equal(api.newUnlocked, null);
  assert.deepEqual(s.state.plays, []);
  assert.deepEqual(s.state.legacyPlays, []);
});

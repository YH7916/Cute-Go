import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';

// A real React server render reads the production initializer. It does not
// pretend to validate browser effects or localStorage persistence on mount.
for (const [label, stored, expected] of [
  ['retired puzzle mode', 'Tsumego', 'PvP'],
  ['ordinary local game', 'PvP', 'PvP'],
  ['ordinary AI game', 'PvAI', 'PvAI'],
  ['unknown mode', 'unknown-mode', 'PvP'],
  ['wrong JSON type', { mode: 'PvAI' }, 'PvP'],
  ['null JSON value', null, 'PvP'],
  ['fresh installation', undefined, 'PvAI'],
]) {
  test(`settings load ${label} as ${expected}`, async t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map(stored === undefined ? [] : [['gameMode', JSON.stringify(stored)]]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    } });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    });
    const { useAppSettings, createElement, renderToStaticMarkup } = await loadTestModule({
      registerCleanup: cleanup => t.after(cleanup),
      contents: `
        export { useAppSettings } from './hooks/useAppSettings';
        export { createElement } from 'react';
        export { renderToStaticMarkup } from 'react-dom/server';
      `,
    });
    let settings;
    function ReadSettings() {
      settings = useAppSettings();
      return null;
    }
    renderToStaticMarkup(createElement(ReadSettings));
    assert.equal(settings.gameMode, expected);
    assert.equal(settings.coachMode, false, 'assisted practice must still be entered explicitly');
  });
}

for (const [key, label, stored, expected] of [
  ['stoneSkin', 'retired minimal skin', 'minimal', 'classic'],
  ['stoneSkin', 'classic skin', 'classic', 'classic'],
  ['stoneSkin', 'skeuomorphic skin', 'skeuomorphic', 'skeuomorphic'],
  ['stoneSkin', 'unknown skin', 'unknown-skin', 'classic'],
  ['stoneSkin', 'fresh stone skin', undefined, 'skeuomorphic'],
  ['stoneAnimationEnabled', 'fresh stone animation preference', undefined, true],
  ['stoneAnimationEnabled', 'disabled stone animation preference', false, false],
  ['stoneAnimationEnabled', 'enabled stone animation preference', true, true],
  ['coachSkin', 'fresh coach skin', undefined, 'chuying'],
  ['coachSkin', 'original coach skin', 'chuying', 'chuying'],
  ['coachSkin', 'Ke Jie coach skin', 'kejie', 'kejie'],
  ['coachSkin', 'unknown coach skin', 'missing-skin', 'chuying'],
  ['coachSkin', 'prototype property as coach skin', 'constructor', 'chuying'],
  ['coachSkin', 'object coach skin', { id: 'kejie' }, 'chuying'],
  ['coachSkin', 'null coach skin', null, 'chuying'],
]) {
  test(`settings load ${label} as ${expected}`, async t => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    const values = new Map(stored === undefined ? [] : [[key, JSON.stringify(stored)]]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    } });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    });
    const { useAppSettings, createElement, renderToStaticMarkup } = await loadTestModule({
      registerCleanup: cleanup => t.after(cleanup),
      contents: `
        export { useAppSettings } from './hooks/useAppSettings';
        export { createElement } from 'react';
        export { renderToStaticMarkup } from 'react-dom/server';
      `,
    });
    let settings;
    function ReadSettings() {
      settings = useAppSettings();
      return null;
    }
    renderToStaticMarkup(createElement(ReadSettings));
    assert.equal(settings[key], expected);
  });
}

test('selecting a coach skin persists and a fresh application restores it independently of board preferences', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map([['coachSkin', '{broken-json']]);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  const load = () => loadTestModule({ reactHost: true, registerCleanup: cleanup => t.after(cleanup), contents: `
    export { useAppSettings } from './hooks/useAppSettings';
    export { renderHook } from './tests/helpers/reactHooks';
  ` });
  const first = await load();
  const host = first.renderHook(first.useAppSettings);
  t.after(() => host.unmount());
  let settings = host.render();
  assert.equal(settings.coachSkin, 'chuying', 'malformed JSON preserves the original companion');
  settings.setCoachSkin('kejie');
  settings = host.render();
  assert.equal(values.get('coachSkin'), '"kejie"');
  settings.setBoardSkin('sakura_wood');
  settings = host.render();
  assert.equal(settings.coachSkin, 'kejie', 'other appearance choices do not reset the companion');
  const fresh = await load();
  const reopened = fresh.renderHook(fresh.useAppSettings);
  t.after(() => reopened.unmount());
  settings = reopened.render();
  assert.equal(settings.coachSkin, 'kejie');
  assert.equal(settings.boardSkin, 'sakura_wood');
  settings.setCoachSkin('chuying');
  assert.equal(reopened.render().coachSkin, 'chuying');
  assert.equal(values.get('coachSkin'), '"chuying"');
});

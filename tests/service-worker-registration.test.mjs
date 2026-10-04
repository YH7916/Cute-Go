import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { bundleTestSource } from './helpers/loadTestModule.mjs';

async function runEntry({ production, page, registrations = [] }) {
  const calls = [];
  const events = new Map();
  const source = await bundleTestSource({
    entryPoint: 'index.tsx', format: 'iife', platform: 'browser',
    define: { 'import.meta.env.PROD': String(production), 'import.meta.env.BASE_URL': JSON.stringify('./') },
    plugins: [{
      name: 'mock-rendering-only',
      setup(builder) {
        builder.onResolve({ filter: /^(react(?:\/jsx-runtime)?|react-dom\/client|\.\/App|\.\/index\.css)$/ }, args => ({ path: args.path, namespace: 'render-mock' }));
        builder.onLoad({ filter: /.*/, namespace: 'render-mock' }, () => ({ contents: 'export function jsx(){}; export const jsxs=jsx; export default {createElement(){},StrictMode(){},createRoot(){return {render(){}}}};', loader: 'js' }));
      },
    }],
  });
  const container = {
    register: async (url, options) => { calls.push({ url: new URL(url, page).href, options }); return { scope: options?.scope }; },
    getRegistrations: async () => registrations,
  };
  vm.runInNewContext(source, {
    navigator: { serviceWorker: container },
    window: { location: new URL(page), addEventListener: (name, listener) => events.set(name, listener) },
    document: { baseURI: page, getElementById: () => ({}) },
    URL,
    console: { log() {}, warn() {} },
  });
  events.get('load')?.();
  await new Promise(resolve => setImmediate(resolve));
  return calls;
}

for (const base of ['https://example.test/', 'https://example.test/cutego/']) {
  test(`production registration stays under application base ${base}`, async () => {
    const [call] = await runEntry({ production: true, page: `${base}index.html` });
    assert.equal(call.url, `${base}service-worker.js`);
    assert.equal(call.options?.scope, base);
  });
}

test('development unregisters only the CuteGo worker in its own scope', async () => {
  const removed = [];
  const registration = (scope, scriptURL, name) => ({
    scope,
    active: { scriptURL },
    unregister: async () => { removed.push(name); return true; },
  });
  await runEntry({
    production: false,
    page: 'https://example.test/cutego/',
    registrations: [
      registration('https://example.test/cutego/', 'https://example.test/cutego/service-worker.js', 'ours'),
      registration('https://example.test/other/', 'https://example.test/other/service-worker.js', 'other-scope'),
      registration('https://example.test/cutego/', 'https://example.test/cutego/another-worker.js', 'other-worker'),
    ],
  });
  assert.deepEqual(removed, ['ours']);
});

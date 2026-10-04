import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../public/service-worker.js', import.meta.url), 'utf8');

function createWorker(scope = 'https://example.test/cutego/') {
  const listeners = new Map();
  const stores = new Map();
  let fetchResponse = () => Promise.resolve(new Response('network'));
  let fetches = 0;
  const absolute = (request) => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async keys() { return [...store.keys()].map(url => ({ url })); },
        async match(request) { return store.get(absolute(request))?.clone(); },
        async put(request, response) { store.set(absolute(request), response.clone()); },
        async addAll(requests) {
          for (const request of requests) store.set(absolute(request), new Response('precache'));
        },
      };
    },
    async match(request) {
      for (const store of stores.values()) {
        const response = store.get(absolute(request));
        if (response) return response.clone();
      }
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  vm.runInNewContext(source, {
    self: {
      registration: { scope },
      location: new URL('service-worker.js', scope),
      addEventListener: (name, handler) => listeners.set(name, handler),
      skipWaiting() {},
      clients: { claim() {} },
    },
    URL,
    caches,
    fetch: (...args) => { fetches++; return fetchResponse(...args); },
  });
  return {
    stores,
    caches,
    get fetches() { return fetches; },
    network(response) { fetchResponse = response; },
    async lifecycle(name) {
      const work = [];
      listeners.get(name)({ waitUntil: (promise) => work.push(promise) });
      await Promise.all(work);
    },
    async request(path, options = {}) {
      let result;
      const request = { url: new URL(path, scope).href, method: 'GET', mode: 'cors', destination: '', ...options };
      listeners.get('fetch')({ request, respondWith: (promise) => { result = promise; }, waitUntil() {} });
      return result ? await result : undefined;
    },
  };
}

for (const asset of ['models/kata_dynamic.onnx', 'wasm/ort-wasm.wasm?ort=1.18.0']) {
  test(`${asset}: refresh stable URLs, retain offline copy, and do not cache HTTP errors`, async () => {
    const worker = createWorker();
    worker.network(async () => new Response('old'));
    assert.equal(await (await worker.request(asset)).text(), 'old');
    worker.network(async () => new Response('new'));
    assert.equal(await (await worker.request(asset)).text(), 'new');
    worker.network(async () => new Response('not found', { status: 404 }));
    assert.equal(await (await worker.request(asset)).text(), 'new');
    worker.network(async () => { throw new Error('offline'); });
    assert.equal(await (await worker.request(asset)).text(), 'new');
    assert.equal(worker.fetches, 4);
  });
}

test('WASM cache identity includes runtime version; a missing new runtime never receives old bytes', async () => {
  const worker = createWorker();
  worker.network(async () => new Response('old-runtime'));
  await worker.request('wasm/ort-wasm.wasm?ort=1.18.0');
  worker.network(async () => new Response('missing', { status: 404 }));
  const missing = await worker.request('wasm/ort-wasm.wasm?ort=next');
  assert.equal(missing.status, 404);
  worker.network(async () => { throw new Error('offline'); });
  await assert.rejects(worker.request('wasm/ort-wasm.wasm?ort=next'), /offline/);
});

test('navigation HTTP errors preserve the working offline document', async () => {
  const worker = createWorker();
  const navigation = { mode: 'navigate', destination: 'document' };
  worker.network(async () => new Response('working-page'));
  await worker.request('./', navigation);
  worker.network(async () => new Response('server-error', { status: 503 }));
  assert.equal(await (await worker.request('./', navigation)).text(), 'working-page');
  worker.network(async () => { throw new Error('offline'); });
  assert.equal(await (await worker.request('./', navigation)).text(), 'working-page');
});

test('activation removes only this scope old CuteGo caches', async () => {
  const worker = createWorker();
  await worker.lifecycle('install');
  const currentName = [...worker.stores.keys()][0];
  const prefix = currentName.slice(0, currentName.lastIndexOf(':') + 1);
  worker.stores.set(`${prefix}obsolete`, new Map());
  worker.stores.set('cute-go:%2Fother%2F:v1', new Map());
  worker.stores.set('other-app-cache', new Map());
  await worker.lifecycle('activate');
  assert.ok(worker.stores.has(currentName));
  assert.ok(!worker.stores.has(`${prefix}obsolete`));
  assert.ok(worker.stores.has('cute-go:%2Fother%2F:v1'));
  assert.ok(worker.stores.has('other-app-cache'));
});

test('root scope migrates legacy caches without deleting another application', async () => {
  const worker = createWorker('https://example.test/');
  worker.stores.set('cute-go-v3', new Map());
  worker.stores.set('other-app-cache', new Map());
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.ok(!worker.stores.has('cute-go-v3'));
  assert.ok(worker.stores.has('other-app-cache'));
});

test('cache migration preserves offline assets without rewriting runtime versions or new content', async () => {
  const worker = createWorker('https://example.test/');
  const legacy = await worker.caches.open('cute-go-v3');
  await legacy.put('assets/app-oldhash.js', new Response('offline-script'));
  await legacy.put('models/kata_dynamic.onnx', new Response('old-model'));
  await legacy.put('wasm/ort-wasm.wasm', new Response('unversioned-runtime'));
  await legacy.put('https://other.test/asset.js', new Response('foreign-resource'));
  await worker.lifecycle('install');
  worker.network(async () => new Response('new-model'));
  await worker.request('models/kata_dynamic.onnx');
  await worker.lifecycle('activate');
  worker.network(async () => { throw new Error('offline'); });
  assert.equal(await (await worker.request('assets/app-oldhash.js')).text(), 'offline-script');
  assert.equal(await (await worker.request('models/kata_dynamic.onnx')).text(), 'new-model');
  assert.equal(await (await worker.request('wasm/ort-wasm.wasm')).text(), 'unversioned-runtime');
  await assert.rejects(worker.request('wasm/ort-wasm.wasm?ort=1.18.0'), /offline/);
  assert.ok([...worker.stores.values()].every(store => !store.has('https://other.test/asset.js')));
});

test('cross-origin, sibling application and non-GET requests bypass the worker cache', async () => {
  const worker = createWorker();
  assert.equal(await worker.request('https://cdn.test/model.onnx'), undefined);
  assert.equal(await worker.request('/other/models/model.onnx'), undefined);
  assert.equal(await worker.request('api', { method: 'POST' }), undefined);
  assert.equal(worker.fetches, 0);
});

test('upgrading from the puzzle release removes its data cache and retains offline inference', async () => {
  const worker = createWorker();
  const previousName = 'cute-go:%2Fcutego%2F:v4';
  const previous = await worker.caches.open(previousName);
  await previous.put('problems_manifest.json', new Response('retired-index'));
  await previous.put('Problems/Tsumego/problem.sgf', new Response('retired-puzzle'));
  await previous.put('models/kata_dynamic.onnx', new Response('cached-model'));
  await previous.put('wasm/ort-wasm.wasm?ort=1.18.0', new Response('cached-runtime'));
  await worker.lifecycle('install');
  await worker.lifecycle('activate');
  assert.ok(!worker.stores.has(previousName));
  assert.ok([...worker.stores.values()].every(store => [...store.keys()].every(url =>
    !url.includes('problems_manifest.json') && !url.includes('/Problems/'))));
  worker.network(async () => { throw new Error('offline'); });
  assert.equal(await (await worker.request('models/kata_dynamic.onnx')).text(), 'cached-model');
  assert.equal(await (await worker.request('wasm/ort-wasm.wasm?ort=1.18.0')).text(), 'cached-runtime');
});

test('static cache lookup never reads another application cache', async () => {
  const worker = createWorker();
  await (await worker.caches.open('other-app-cache')).put('assets/app.js', new Response('wrong-app'));
  worker.network(async () => new Response('right-app'));
  assert.equal(await (await worker.request('assets/app.js')).text(), 'right-app');
});

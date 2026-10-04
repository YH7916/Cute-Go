import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { bundleTestSource, loadTestModule } from './helpers/loadTestModule.mjs';

async function delayedFallback(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, '__coachRuntimeGate');
  const worker = Object.getOwnPropertyDescriptor(globalThis, 'Worker');
  let release;
  const gate = { promise: new Promise(resolve => { release = resolve; }), calls: 0 };
  Object.defineProperty(globalThis, '__coachRuntimeGate', { value: gate, configurable: true });
  Object.defineProperty(globalThis, 'Worker', { value: undefined, configurable: true });
  t.after(() => {
    release();
    if (original) Object.defineProperty(globalThis, '__coachRuntimeGate', original);
    else Reflect.deleteProperty(globalThis, '__coachRuntimeGate');
    if (worker) Object.defineProperty(globalThis, 'Worker', worker);
    else Reflect.deleteProperty(globalThis, 'Worker');
  });
  const module = await loadTestModule({ registerCleanup: t.after.bind(t), entryPoint: 'agent/coach/client.ts', plugins: [{
    name: 'pending-runtime-module',
    setup(build) {
      build.onResolve({ filter: /^\.\/runtime$/ }, () => ({ path: 'runtime', namespace: 'pending-runtime-module' }));
      build.onLoad({ filter: /.*/, namespace: 'pending-runtime-module' }, () => ({ contents: `
        const gate = globalThis.__coachRuntimeGate;
        await gate.promise;
        export function executeCoachAgent() { gate.calls++; return {text:'late',source:'local',configured:false,hintPoints:[],moveNumber:0}; }
      `, loader: 'js' }));
    },
  }] });
  return { run: module.runCoachAgent, release, gate };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('fallback abort settles while its runtime module is still loading and never executes a late import', async t => {
  const host = await delayedFallback(t);
  const controller = new AbortController();
  let outcome;
  const pending = host.run({ kind: 'ask' }, controller.signal).then(
    value => { outcome = value; }, error => { outcome = error; });
  await tick();
  controller.abort();
  await tick();
  assert.equal(outcome?.name, 'AbortError');
  host.release();
  await pending;
  await tick();
  assert.equal(host.gate.calls, 0, 'cancelled loading must not start a provider request later');
});

test('fallback runtime loading has a deadline and a late module cannot begin work after timeout', async t => {
  const host = await delayedFallback(t);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let outcome;
  const pending = host.run({ kind: 'ask' }).then(value => { outcome = value; }, error => { outcome = error; });
  await tick();
  t.mock.timers.tick(6000);
  await tick();
  assert.match(outcome?.message ?? '', /启动.*超时|加载.*超时/);
  host.release();
  await pending;
  await tick();
  assert.equal(host.gate.calls, 0, 'timed-out loading must not start a provider request later');
});

test('the actual runtime supports engine hints when an older WebView has no Array.at', async () => {
  const source = await bundleTestSource({ format: 'iife', platform: 'browser', contents: `
    import { executeCoachAgent } from './agent/coach/runtime';
    import { createInitialPosition } from './domains/game/positionState';
    import { coachPositionKey } from './domains/coach/evidence';
    globalThis.runWithoutAt = () => {
      const position = createInitialPosition(9);
      return executeCoachAgent({kind:'inspect',position,userColor:'black',intent:'hint',
        config:{endpoint:'https://api.deepseek.com',model:'deepseek-flash',apiKey:''}, engineEvidence:{
          positionKey:coachPositionKey(position,position.currentPlayer,3.5),source:'local-katago',perspective:'black',
          visits:8,candidates:[{point:{x:2,y:2},visits:5}]
        }});
    };
  ` });
  const context = vm.createContext({ DOMException, URL, AbortController, setTimeout, clearTimeout });
  vm.runInContext('delete Array.prototype.at', context);
  vm.runInContext(source, context);
  const result = await context.runWithoutAt();
  assert.deepEqual(structuredClone(result.hintPoints), [{ x: 2, y: 2, label: 'C7' }]);
});

test('validated replies remain available in WebViews without Object.hasOwn', async () => {
  const source = await bundleTestSource({ format: 'iife', platform: 'browser', contents: `
    import { renderCoachResponse } from './domains/coach/response';
    globalThis.renderReply = () => renderCoachResponse(
      '{"kind":"explain","parts":[{"id":"current","variant":0}]}',
      [{id:'current',kind:'position',variants:['这块黑棋有4口气。']}], false, 9);
  ` });
  const context = vm.createContext({});
  vm.runInContext('delete Object.hasOwn', context);
  vm.runInContext(source, context);
  assert.deepEqual(structuredClone(context.renderReply()), {
    kind: 'explain', text: '这块黑棋有4口气。', hintPoints: [],
  });
});

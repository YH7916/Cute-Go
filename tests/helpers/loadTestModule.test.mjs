import assert from 'node:assert/strict';
import test from 'node:test';
import { access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import vm from 'node:vm';
import { bundleTestSource, loadTestModule } from './loadTestModule.mjs';

test('source imports and the opt-in React host resolve outside the checkout cwd', async () => {
  const contents = `
    import { useState } from 'react';
    import { renderHook } from './tests/helpers/reactHooks';
    import { createBoard } from './core/board';
    const host = renderHook(() => useState(createBoard(5)));
    export const size = host.render()[0].length;
  `;
  const script = `
    import { loadTestModule } from ${JSON.stringify(new URL('./loadTestModule.mjs', import.meta.url).href)};
    const cleanups = [];
    try {
      const result = await loadTestModule({ contents: ${JSON.stringify(contents)}, reactHost: true,
        registerCleanup: callback => cleanups.push(callback) });
      process.stdout.write(String(result.size));
    } finally { for (const cleanup of cleanups) await cleanup(); }
  `;
  const result = await promisify(execFile)(process.execPath, ['--input-type=module', '-e', script], { cwd: tmpdir() });
  assert.equal(result.stdout, '5');
});

test('repeated loads isolate module state and generated files live until cleanup', async t => {
  const cleanups = [];
  const registerCleanup = callback => { cleanups.push(callback); t.after(callback); };
  const contents = `
    import { fileURLToPath } from 'node:url';
    let calls = 0;
    export const next = () => ++calls;
    export const filename = fileURLToPath(import.meta.url);
  `;
  const first = await loadTestModule({ contents, registerCleanup });
  const second = await loadTestModule({ contents, registerCleanup });
  assert.equal(first.next(), 1);
  assert.equal(first.next(), 2);
  assert.equal(second.next(), 1);
  assert.notEqual(first.filename, second.filename);
  await access(first.filename);
  await cleanups[0]();
  await assert.rejects(access(dirname(first.filename)), { code: 'ENOENT' });
  await access(second.filename);
});

for (const phase of ['build', 'evaluation']) {
  test(`${phase} failure removes the generated directory before rejecting`, async t => {
    let filename;
    const plugins = [{ name: 'observe-output', setup(builder) {
      filename = builder.initialOptions.outfile;
      builder.initialOptions.logLevel = 'silent';
      if (phase === 'build') builder.onStart(() => { throw new Error('fixture build failed'); });
    } }];
    await assert.rejects(loadTestModule({
      contents: phase === 'evaluation' ? "throw new Error('fixture evaluation failed');" : 'export const value = 1;',
      plugins, registerCleanup: callback => t.after(callback),
    }), new RegExp(`fixture ${phase} failed`));
    assert.ok(filename);
    await assert.rejects(access(dirname(filename)), { code: 'ENOENT' });
  });
}

test('bundled CommonJS dependencies can require Node built-ins without global mutation', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'require');
  const module = await loadTestModule({
    contents: "export { default as separator } from 'fixture-commonjs';",
    plugins: [{ name: 'commonjs-fixture', setup(builder) {
      builder.onResolve({ filter: /^fixture-commonjs$/ }, () => ({ path: 'fixture-commonjs', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: "module.exports = require('node:path').sep;", loader: 'js' }));
    } }],
    registerCleanup: callback => t.after(callback),
  });
  assert.equal(module.separator, process.platform === 'win32' ? '\\' : '/');
  assert.deepEqual(Object.getOwnPropertyDescriptor(globalThis, 'require'), previous);
});

test('module exports cannot collide with loader-private import bindings', async t => {
  const module = await loadTestModule({
    contents: 'export const __testCreateRequire = 1; export const require = 2;',
    registerCleanup: callback => t.after(callback),
  });
  assert.equal(module.__testCreateRequire, 1);
  assert.equal(module.require, 2);
});

test('source-only IIFE builds preserve plugins and defines for an independent VM host', async () => {
  const source = await bundleTestSource({
    contents: "import { value } from 'fixture'; globalThis.answer = value + OFFSET;",
    format: 'iife', platform: 'browser', define: { OFFSET: '5' },
    plugins: [{ name: 'value-fixture', setup(builder) {
      builder.onResolve({ filter: /^fixture$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const value = 7;', loader: 'js' }));
    } }],
  });
  const sandbox = {};
  vm.runInNewContext(source, sandbox);
  assert.equal(sandbox.answer, 12);
});

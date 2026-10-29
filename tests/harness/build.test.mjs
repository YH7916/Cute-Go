import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProduction } from '../../harness/build.mjs';
import { commandFor, runChecks } from '../../harness/run.mjs';
import { fromRoot, repoRoot } from '../../harness/paths.mjs';

test('canonical build invokes the combined frontend and backend implementation', async () => {
  assert.deepEqual(commandFor('build'), [fromRoot('harness/build.mjs')]);
  const invoked = [];
  assert.equal(await runChecks('check', [], async args => { invoked.push(args); return 0; }), 0);
  assert.deepEqual(invoked.at(-1), [fromRoot('harness/build.mjs')]);
});

test('production build emits a separate runnable Node entry without bundling provider packages into the browser', async () => {
  const stages = [];
  await buildProduction({
    frontend: async options => { stages.push('frontend'); assert.deepEqual(options, { root: repoRoot }); },
    backend: async options => {
      stages.push('backend');
      assert.deepEqual(options.entryPoints, ['server/coach/main.ts']);
      assert.equal(options.outfile, fromRoot('dist-server/main.mjs'));
      assert.equal(options.absWorkingDir, repoRoot);
      assert.equal(options.bundle, true); assert.equal(options.packages, 'external');
      assert.equal(options.platform, 'node'); assert.equal(options.format, 'esm'); assert.equal(options.target, 'node22');
    },
  });
  assert.deepEqual(stages, ['frontend', 'backend']);
});

test('a failed backend build makes the production stage fail instead of accepting frontend success', async () => {
  let frontendBuilt = false;
  const failure = new Error('intentional missing backend dependency');
  await assert.rejects(buildProduction({
    frontend: async () => { frontendBuilt = true; }, backend: async () => { throw failure; },
  }), error => error === failure);
  assert.equal(frontendBuilt, true);
  assert.equal(await runChecks('build', [], async () => 17), 17);
});

test('a failed frontend build is preserved and cannot proceed to the backend', async () => {
  let backendBuilt = false;
  await assert.rejects(buildProduction({
    frontend: async () => { throw new Error('intentional frontend failure'); }, backend: async () => { backendBuilt = true; },
  }), /intentional frontend failure/);
  assert.equal(backendBuilt, false);
});

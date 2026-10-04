import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { commandFor, runChecks } from '../../harness/run.mjs';
import { discoverTests } from '../../harness/testing.mjs';
import { fromRoot } from '../../harness/paths.mjs';
import { architecture } from '../../harness/architecture.mjs';

// These are independent CLI acceptance processes, not children in this suite's
// node:test worker protocol. Inheriting child-v8 silently skips their test run.
const cliEnvironment = { ...process.env };
delete cliEnvironment.NODE_TEST_CONTEXT;

test('lint selects every contracted source extension using the installed local CLI', () => {
  const args = commandFor('lint');
  assert.equal(args[0], fromRoot('node_modules/eslint/bin/eslint.js'));
  assert.deepEqual(args.slice(1), [...architecture.sourcePolicy.files, '--max-warnings', '0']);
});

test('a failed full check stops later checks and preserves the nonzero exit code', async () => {
  const stages = [];
  const result = await runChecks('check', [], async args => {
    stages.push(args);
    return stages.length === 3 ? 17 : 0;
  });
  assert.equal(result, 17);
  assert.equal(stages.length, 3);
  assert.match(stages[0][0], /contracts\.mjs$/);
  assert.match(stages[1][0], /eslint\.js$/);
  assert.match(stages[2][0], /tsc$/);
});

test('full check cannot be narrowed by passing a test selector or swallowed flag', async () => {
  let executed = false;
  await assert.rejects(runChecks('check', ['tests/review-position.test.ts'], async () => { executed = true; return 0; }), /complete pipeline/);
  assert.equal(executed, false);
  assert.throws(() => commandFor('lint', ['--no-ignore']), /accepts only/);
  assert.throws(() => commandFor('typecheck', ['--help']), /does not accept/);
  assert.throws(() => commandFor('unknown'), /Unknown check/);
  assert.throws(() => commandFor('toString'), /Unknown check/);
});

test('fixed business flow command reuses the Node runner and preserves a failed flow exit code', async () => {
  const expected = [fromRoot('scripts/run-tests.mjs'), 'tests/flows'];
  assert.deepEqual(commandFor('test:flows'), expected);
  const stages = [];
  const result = await runChecks('test:flows', [], async args => { stages.push(args); return 23; });
  assert.equal(result, 23);
  assert.deepEqual(stages, [expected]);
});

test('fixed flow command rejects extra selectors and flags before any test starts', async () => {
  let executed = false;
  const run = async () => { executed = true; return 0; };
  for (const extra of [['tests/review-position.test.ts'], ['tests/flows/one.test.ts'], ['--help'], ['--skip']]) {
    assert.throws(() => commandFor('test:flows', extra), /flow selection is fixed/);
    await assert.rejects(runChecks('test:flows', extra, run), /flow selection is fixed/);
  }
  await assert.rejects(runChecks('test:flow', [], run), /Unknown check/);
  assert.equal(executed, false);
});

test('test discovery covers nested TS, TSX and native MJS with explicit selection and no silent misses', async t => {
  const root = await mkdtemp(join(tmpdir(), 'cutego-discovery-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'nested'));
  for (const file of ['a.test.ts', 'b.test.tsx', 'nested/c.test.mjs', 'helper.ts', 'not-a.test.js']) {
    await writeFile(join(root, file), '');
  }
  const discovered = await discoverTests(root);
  assert.deepEqual(discovered, ['a.test.ts', 'b.test.tsx', 'nested/c.test.mjs'].map(file => join(root, file)));
  assert.deepEqual(await discoverTests(root, [join(root, 'nested'), join(root, 'nested/c.test.mjs')]), [join(root, 'nested/c.test.mjs')]);
  await assert.rejects(discoverTests(root, [join(root, 'missing.test.ts')]), /No tests match/);
});

test('test CLI resolves a real suite from another working directory', () => {
  const result = spawnSync(process.execPath, [fromRoot('scripts/run-tests.mjs'), 'tests/review-position.test.ts'], {
    cwd: tmpdir(), env: cliEnvironment, encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /(?:pass 3|pass: 3)/);
});

test('unknown commands and missing test selections fail at the public CLI', () => {
  for (const args of [['misspelled'], ['check', '--skip-tests'], ['test', 'tests/missing.test.ts'], ['test:flows', 'tests/review-position.test.ts']]) {
    const result = spawnSync(process.execPath, [fromRoot('harness/run.mjs'), ...args], {
      cwd: tmpdir(), env: cliEnvironment, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 1, result.stderr + result.stdout);
  }
});

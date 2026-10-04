import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { ESLint } from 'eslint';
import config from '../../eslint.config.js';
import { architecture } from '../../harness/architecture.mjs';

let workspace;
let eslint;

before(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'cute-go-harness-'));
  const fixtures = {
    'tsconfig.json': JSON.stringify({ compilerOptions: { moduleResolution: 'bundler', module: 'esnext' } }),
    'App.tsx': 'export const value = 1;',
    'AppController.tsx': 'export const value = 1;',
    'types.ts': 'export type Shape = { x: number };',
    'components/Board.tsx': 'export const value = 1; export type Props = { x: number };',
    'hooks/useBoard.ts': 'export const value = 1; export type State = { x: number };',
    'domains/board.ts': 'export const value = 1;',
    'agent/coach/client.ts': 'export const value = 1;',
    'agent/coach/runtime.ts': 'export const value = 1;',
    'agent/coach/contract.ts': 'export type AgentMessage = { id: number };',
    'services/coach/client.ts': 'export const value = 1;',
    'services/platform/index.ts': 'export const value = 1;',
    'services/platform/environment.ts': 'export const isTapTapEnv = () => false;',
    'services/platform/taptap/runtime.ts': 'export const value = 1;',
    'services/platform/platformClient.ts': 'export const value = 1;',
    'services/platform/providers/taptapPlatform.ts': 'export const value = 1;',
    'services/platform/types.ts': 'export type State = { x: number };',
    'harness/example.mjs': 'export const value = 1;',
    'tests/helpers/example.mjs': 'export const value = 1;',
    'package.json': '{"name":"fixture"}',
    'ui/Button.tsx': 'export const value = 1;',
    'worker/example.ts': 'export const value = 1;',
    'utils/helpers.ts': 'export const value = 1;',
    'utils/micro-board.ts': 'export const value = 1;',
    'utils/joseki.ts': 'export const value = 1;',
    'utils/onnx-engine.ts': 'export const value = 1;',
    'utils/goLogic.ts': 'export const value = 1;',
    'utils/tapTapBridge.ts': 'export const value = 1; export const isTapTapEnv = () => false;',
    'core/board.ts': 'export const value = 1;',
    'unmapped/helper.ts': 'export const value = 1;',
    'core/cycle/a.ts': "import { b } from './b'; export const a = () => b;",
    'core/cycle/b.ts': "import { c } from './c'; export const b = () => c;",
    'core/cycle/c.ts': "import { d } from './d'; export const c = () => d;",
    'core/cycle/d.ts': "import { e } from './e'; export const d = () => e;",
    'core/cycle/e.ts': "import { a } from './a'; export const e = () => a;",
    'core/type-cycle/a.ts': "import type { B } from './b'; export type A = { b?: B };",
    'core/type-cycle/b.ts': "import type { A } from './a'; export type B = { a?: A };",
    'core/js-cycle/a.mjs': "import { b } from './b.mjs'; export const a = () => b;",
    'core/js-cycle/b.mjs': "import { a } from './a.mjs'; export const b = () => a;",
    'harness/cycle/a.mjs': "import { b } from './b.mjs'; export const a = () => b;",
    'harness/cycle/b.mjs': "import { a } from './a.mjs'; export const b = () => a;",
  };
  for (const [file, source] of Object.entries(fixtures)) {
    const target = path.join(workspace, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, source);
  }
  eslint = new ESLint({
    cwd: workspace,
    overrideConfigFile: true,
    overrideConfig: [
      ...config,
      {
        settings: {
          'boundaries/root-path': workspace,
          'import/resolver': {
            typescript: { project: path.join(workspace, 'tsconfig.json') },
            node: true,
          },
        },
      },
    ],
  });
});

after(async () => {
  // Only delete the exact directory created by mkdtemp, never a repository path.
  if (workspace) {
    assert.equal(path.dirname(workspace), path.resolve(tmpdir()));
    assert.match(path.basename(workspace), /^cute-go-harness-/);
    await rm(workspace, { recursive: true, force: true });
  }
});

async function messages(file, source) {
  // import/no-cycle builds a graph from disk; virtual lintText paths cannot do so.
  const target = path.join(workspace, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, source);
  const [result] = await eslint.lintFiles([target]);
  return result.messages;
}

function imports(source) {
  return `import { value } from '${source}'; export const result = value;`;
}

for (const target of [
  '../App',
  '../AppController',
  '../components/Board',
  '../domains/board',
  '../hooks/useBoard',
  '../ui/Button',
  '../services/platform',
  '../worker/example',
  '../utils/helpers',
  '../utils/tapTapBridge',
  '../utils/goLogic',
]) {
  test(`core rejects an upward dependency on ${target}`, async () => {
    const findings = await messages('core/probe.ts', imports(target));
    assert.ok(findings.some((item) => item.ruleId === 'boundaries/dependencies' && item.severity === 2), JSON.stringify(findings));
  });
}

test('core accepts core rules, shared types, and only the named legacy core helpers', async () => {
  const findings = await messages('core/probe.ts', `
    import { value as board } from './board';
    import { value as micro } from '../utils/micro-board';
    import { value as joseki } from '../utils/joseki';
    import type { Shape } from '../types';
    export const result: Shape = { x: board + micro + joseki };
  `);
  assert.deepEqual(findings, []);
});

test('teaching execution stays behind its client and cannot depend on presentation', async () => {
  assert.deepEqual(await messages('hooks/agentProbe.ts', imports('../agent/coach/client')), []);
  assert.deepEqual(await messages('agent/coach/client.ts', imports('./runtime')), []);
  for (const target of ['../../core/board', '../../domains/board', '../../services/coach/client']) {
    assert.deepEqual(await messages('agent/coach/probe.ts', imports(target)), []);
  }
  for (const [file, target] of [
    ['components/AgentPanel.tsx', '../agent/coach/client'],
    ['hooks/agentProbe.ts', '../agent/coach/runtime'],
    ['hooks/agentProbe.ts', '../services/coach/client'],
    ['components/AgentPanel.tsx', '../services/coach/client'],
    ['core/agentProbe.ts', '../agent/coach/client'],
    ['agent/coach/probe.ts', '../../components/Board'],
    ['agent/coach/probe.ts', '../../hooks/useBoard'],
    ['agent/coach/probe.ts', '../../AppController'],
  ]) {
    const findings = await messages(file, imports(target));
    assert.ok(findings.some(item => item.ruleId === 'boundaries/dependencies' && item.severity === 2), `${file} -> ${target}`);
  }
  for (const name of ['react', 'react/jsx-runtime', '@capacitor/core']) {
    const findings = await messages('agent/coach/probe.ts', imports(name));
    assert.ok(findings.some(item => item.ruleId === 'no-restricted-imports' && item.severity === 2));
  }
});

test('core rejects React and native adapter packages', async () => {
  for (const name of ['react', 'react/jsx-runtime', 'react-dom/client', '@capacitor/app']) {
    const findings = await messages('core/probe.ts', imports(name));
    assert.ok(findings.some((item) => item.ruleId === 'no-restricted-imports' && item.severity === 2));
    const dynamic = await messages('core/probe.ts', `export const result = import('${name}');`);
    assert.ok(dynamic.some((item) => item.ruleId === 'no-restricted-syntax' && item.severity === 2));
    const commonjs = await messages('core/probe.ts', `export const result = require('${name}');`);
    assert.ok(commonjs.some((item) => item.ruleId === 'no-restricted-modules' && item.severity === 2));
  }
});

test('UI uses public platform services; legacy bridge and SDK internals are closed', async () => {
  const environmentCheck = "import { isTapTapEnv } from '../utils/tapTapBridge'; export const result = isTapTapEnv();";
  const migrated = await messages('components/LoginModal.tsx', environmentCheck);
  assert.ok(migrated.some((item) => item.ruleId === 'boundaries/dependencies'));
  assert.deepEqual(await messages('components/LoginModal.tsx', "import { isTapTapEnv } from '../services/platform/environment'; export const result = isTapTapEnv();"), []);
  for (const file of ['components/LoginModal.tsx', 'hooks/probe.ts', 'AppController.tsx']) {
    const native = await messages(file, imports('../services/platform/taptap/runtime').replace("'../services", file === 'AppController.tsx' ? "'./services" : "'../services"));
    assert.ok(native.some(item => item.ruleId === 'boundaries/dependencies'), file);
  }
  const serviceToLegacy = await messages('services/probe.ts', imports('../utils/tapTapBridge'));
  assert.ok(serviceToLegacy.some(item => item.ruleId === 'boundaries/dependencies'));
  const otherComponent = await messages('components/Other.tsx', environmentCheck);
  assert.ok(otherComponent.some((item) => item.ruleId === 'boundaries/dependencies'));
  const otherExport = await messages('components/LoginModal.tsx', imports('../utils/tapTapBridge'));
  assert.ok(otherExport.some((item) => item.ruleId === 'boundaries/dependencies'));
  const mixed = await messages('components/LoginModal.tsx', "import { isTapTapEnv, value } from '../utils/tapTapBridge'; export const result = [isTapTapEnv(), value];");
  assert.ok(mixed.some((item) => item.ruleId === 'boundaries/dependencies'));
});

test('components and shared UI cannot bypass services by directly loading native SDKs', async () => {
  for (const file of ['components/SettingsModal.tsx', 'ui/common/Button.tsx']) {
    for (const name of ['@capacitor/core', '@capacitor/app', '@capacitor/core/subpath']) {
      const findings = await messages(file, imports(name));
      assert.ok(findings.some((item) => item.ruleId === 'no-restricted-imports' && item.severity === 2));
      const dynamic = await messages(file, `export const result = import('${name}');`);
      assert.ok(dynamic.some((item) => item.ruleId === 'no-restricted-syntax' && item.severity === 2));
      const commonjs = await messages(file, `export const result = require('${name}');`);
      assert.ok(commonjs.some((item) => item.ruleId === 'no-restricted-modules' && item.severity === 2));
    }
  }
});

test('raw TapTap globals cannot bypass the public platform boundary', async () => {
  for (const file of ['components/Board.tsx', 'hooks/useBoard.ts', 'core/probe.ts', 'services/probe.ts']) {
    for (const expression of ['window.tap', "window['tap']", '(window as unknown as { tap: unknown }).tap']) {
      const findings = await messages(file, `export const result = ${expression};`);
      assert.ok(findings.some(item => item.ruleId === 'no-restricted-properties'), `${file}: ${expression}`);
    }
  }
  assert.deepEqual(await messages('services/platform/taptap/runtime.ts', 'export const result = window.tap;'), []);
});

test('domains and hooks cannot import components, even through type imports', async () => {
  for (const file of ['domains/probe.ts', 'hooks/probe.ts']) {
    const findings = await messages(file, "import type { Props } from '../components/Board'; export type Result = Props;");
    assert.ok(findings.some((item) => item.ruleId === 'boundaries/dependencies'));
  }
});

test('only the composition contract can reference hook types, with no runtime coupling', async () => {
  const typeSource = "import type { State } from '../../hooks/useBoard'; export type Model = State;";
  assert.deepEqual(await messages('components/app/AppViewModel.ts', typeSource), []);
  const runtime = await messages('components/app/AppViewModel.ts', imports('../../hooks/useBoard'));
  assert.ok(runtime.some((item) => item.ruleId === 'boundaries/dependencies'));
  const otherComponent = await messages('components/app/Other.tsx', typeSource);
  assert.ok(otherComponent.some((item) => item.ruleId === 'boundaries/dependencies'));
});

test('new unclassified files and dependencies fail instead of escaping the graph', async () => {
  const unknownFile = await messages('new-layer/probe.ts', 'export const result = 1;');
  assert.ok(unknownFile.some((item) => item.ruleId === 'boundaries/no-unknown-files'));
  const unknownDependency = await messages('core/probe.ts', imports('../unmapped/helper'));
  assert.ok(unknownDependency.some((item) => item.ruleId === 'boundaries/no-unknown'));
});

test('inline disables cannot turn off architecture rules', async () => {
  const findings = await messages('core/probe.ts', `/* eslint-disable */\n${imports('../App')}`);
  assert.ok(findings.some((item) => item.ruleId === 'boundaries/dependencies' && item.severity === 2));
});

test('TypeScript runtime cycles longer than the previous three-level limit fail', async () => {
  const results = await eslint.lintFiles(['core/cycle/*.ts']);
  assert.equal(results.length, 5);
  for (const result of results) {
    assert.ok(result.messages.some((item) => item.ruleId === 'import/no-cycle' && item.severity === 2), result.filePath);
  }
});

test('type-only cycles are accepted because they have no runtime initialization order', async () => {
  const results = await eslint.lintFiles(['core/type-cycle/*.ts']);
  assert.deepEqual(results.flatMap((result) => result.messages), []);
});

test('new files cannot silently grow beyond the line budget or introduce any', async () => {
  const source = Array.from({ length: 401 }, (_, index) => `export const value${index} = ${index};`).join('\n');
  const sizeFindings = await messages('core/probe.ts', source);
  assert.ok(sizeFindings.some((item) => item.ruleId === 'max-lines' && item.severity === 2));
  const typeFindings = await messages('core/probe.ts', 'export const result: any = 1;');
  assert.ok(typeFindings.some((item) => item.ruleId === '@typescript-eslint/no-explicit-any' && item.severity === 2));
});

test('composition and online orchestration have no grandfathered size exemption', async () => {
  const source = Array.from({ length: 401 }, (_, index) => `export const value${index} = ${index};`).join('\n');
  for (const file of ['AppController.tsx', 'hooks/useOnlineMatch.ts']) {
    const findings = await messages(file, source);
    assert.ok(findings.some(item => item.ruleId === 'max-lines' && item.severity === 2), file);
  }
});

test('debt suppressions cannot waive architecture, cycles, size limits, or arbitrary rules', async () => {
  const baseline = JSON.parse(await readFile(new URL('../../eslint-suppressions.json', import.meta.url), 'utf8'));
  assert.deepEqual(baseline, {}, 'the cleared debt ledger must stay empty; do not restore type or architecture waivers');
});

test('new callers cannot use core compatibility bridges; only exact existing file-to-file edges survive', async () => {
  for (const file of ['hooks/new.ts', 'domains/new.ts', 'worker/new.ts', 'components/New.tsx',
    'components/TutorialModal.tsx', 'components/TutorialStates.ts', 'AppController.tsx']) {
    const prefix = file === 'AppController.tsx' ? './' : '../';
    for (const bridge of ['goLogic', 'onnx-engine']) {
      const findings = await messages(file, imports(`${prefix}utils/${bridge}`));
      assert.ok(findings.some(item => item.ruleId === 'boundaries/dependencies'), `${file} -> ${bridge}`);
    }
  }
  for (const source of ["export const result = import('../utils/goLogic');", "export const result = require('../utils/goLogic');"]) {
    const findings = await messages('hooks/new.ts', source);
    assert.ok(findings.some(item => item.ruleId === 'boundaries/dependencies'), source);
  }
  for (const file of ['hooks/gameActions/useEndGameAction.ts', 'hooks/gameActions/useMoveAction.ts']) {
    const prefix = file.startsWith('hooks/') ? '../../' : '../';
    assert.deepEqual(await messages(file, imports(`${prefix}utils/goLogic`)), [], file);
    const findings = await messages(file, imports(`${prefix}utils/onnx-engine`));
    assert.ok(findings.some(item => item.ruleId === 'boundaries/dependencies'), file);
  }
});

test('public platform facades cannot be bypassed through provider composition or internal type files', async () => {
  for (const target of ['platformClient', 'providers/taptapPlatform', 'types']) {
    const source = target === 'types'
      ? "import type { State } from '../services/platform/types'; export type Result = State;"
      : imports(`../services/platform/${target}`);
    const findings = await messages('hooks/probe.ts', source);
    assert.ok(findings.some(item => item.ruleId === 'boundaries/dependencies'), target);
  }
});

test('JavaScript extensions cannot bypass production architecture, native SDK or raw TapTap restrictions', async () => {
  for (const extension of ['js', 'jsx', 'mjs', 'cjs']) {
    const upward = await messages(`hooks/probe.${extension}`, imports('../components/Board'));
    assert.ok(upward.some(item => item.ruleId === 'boundaries/dependencies'), extension);
    for (const source of [imports('react'), "export const result = import('react');", "export const result = require('react');"]) {
      const native = await messages(`core/probe.${extension}`, source);
      assert.ok(native.some(item => item.ruleId?.startsWith('no-restricted-')), extension);
    }
    const tap = await messages(`components/probe.${extension}`, 'export const result = window.tap;');
    assert.ok(tap.some(item => item.ruleId === 'no-restricted-properties'), extension);
  }
  const cycle = await eslint.lintFiles(['core/js-cycle/*.mjs']);
  assert.equal(cycle.length, 2);
  assert.ok(cycle.every(result => result.messages.some(item => item.ruleId === 'import/no-cycle')));
});

test('tooling has its own boundary and product code cannot import harness or tests', async () => {
  for (const target of ['harness/example.mjs', 'tests/helpers/example.mjs']) {
    const findings = await messages('hooks/probe.ts', imports(`../${target}`));
    assert.ok(findings.some(item => item.ruleId === 'boundaries/dependencies'), target);
  }
  for (const target of ['../core/board', '../hooks/useBoard', '../tests/helpers/example.mjs']) {
    const findings = await messages('harness/probe.mjs', imports(target));
    assert.ok(findings.some(item => item.ruleId === 'boundaries/dependencies'), target);
  }
  assert.deepEqual(await messages('harness/probe.mjs', imports('./example.mjs')), []);
  assert.deepEqual(await messages('scripts/run-tests.mjs', imports('../harness/example.mjs')), []);
  assert.deepEqual(await messages('tests/probe.mjs', imports('../harness/example.mjs')), []);
});

test('harness and test JavaScript files obey the same size and unused-variable rules', async () => {
  const source = Array.from({ length: architecture.sourcePolicy.maxEffectiveLines + 1 }, (_, index) => `export const value${index} = ${index};`).join('\n');
  for (const file of ['harness/probe.mjs', 'tests/probe.mjs', 'scripts/run-tests.mjs']) {
    const large = await messages(file, source);
    assert.ok(large.some(item => item.ruleId === 'max-lines'), file);
    const unused = await messages(file, 'const forgotten = 1; export const result = 2;');
    assert.ok(unused.some(item => item.ruleId === '@typescript-eslint/no-unused-vars'), file);
  }
  const cycle = await eslint.lintFiles(['harness/cycle/*.mjs']);
  assert.equal(cycle.length, 2);
  assert.ok(cycle.every(result => result.messages.some(item => item.ruleId === 'import/no-cycle')));
});

test('the declarative contract has no size or debt escape hatch and the root config is a thin adapter', async () => {
  assert.equal(architecture.sourcePolicy.maxEffectiveLines, 400);
  assert.deepEqual(architecture.sourcePolicy.sizeExceptions, []);
  assert.deepEqual(architecture.qualityPolicy.allowedSuppressions, []);
  const root = await readFile(new URL('../../eslint.config.js', import.meta.url), 'utf8');
  assert.equal(root.trim(), "export { default } from './harness/eslint.mjs';");
});

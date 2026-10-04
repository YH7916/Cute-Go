import assert from 'node:assert/strict';
import test from 'node:test';
import { architecture } from '../../harness/architecture.mjs';
import { checkOrder, flowTestPaths, commandScripts } from '../../harness/commands.mjs';
import { readContractSnapshot, renderHarnessGuide, validateContracts } from '../../harness/contracts.mjs';

const baseline = await readContractSnapshot();

function changedSnapshot(change) {
  const snapshot = structuredClone(baseline);
  change(snapshot);
  return validateContracts(snapshot);
}

function changedContract(change) {
  const contract = structuredClone(architecture);
  change(contract);
  const snapshot = structuredClone(baseline);
  // Isolate structural validation from generated-guide drift.
  snapshot.guide = renderHarnessGuide(contract);
  return validateContracts(snapshot, contract);
}

function includesError(errors, expected) {
  assert.ok(errors.some(error => expected.test(error)), JSON.stringify(errors));
}

test('contract baseline is valid with both LF and Windows CRLF source/document text', () => {
  assert.deepEqual(validateContracts(baseline), []);
  const windows = structuredClone(baseline);
  const crlf = text => text.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
  for (const key of ['guide', 'ci', 'agents', 'claude', 'eslint']) windows[key] = crlf(windows[key]);
  for (const [path, source] of Object.entries(windows.entries)) windows.entries[path] = crlf(source);
  assert.deepEqual(validateContracts(windows), []);
});

test('the required pipeline and its package entrypoints have independent expectations', () => {
  assert.deepEqual(checkOrder, ['contracts', 'lint', 'typecheck', 'test', 'build']);
  assert.deepEqual(commandScripts, {
    check: 'node harness/run.mjs check', lint: 'node harness/run.mjs lint',
    typecheck: 'node harness/run.mjs typecheck', test: 'node harness/run.mjs test',
    build: 'node harness/run.mjs build', 'harness:sync': 'node harness/contracts.mjs --write',
    'test:flows': 'node harness/run.mjs test:flows',
  });
  assert.deepEqual(flowTestPaths, ['tests/flows']);
  assert.ok(renderHarnessGuide().includes('`contracts` → `lint` → `typecheck` → `test` → `build`'));
});

test('package scripts cannot bypass, omit or extend the canonical check implementation', () => {
  for (const [name, command] of [
    ['check', 'npm run lint && npm test'], ['lint', 'eslint .'],
    ['test', 'node --test tests/one.test.mjs'], ['build', 'vite build'],
    ['harness:sync', 'node harness/contracts.mjs'],
    ['test:flows', 'node scripts/run-tests.mjs tests/one.test.ts'],
  ]) {
    includesError(changedSnapshot(snapshot => { snapshot.scripts[name] = command; }),
      new RegExp(`scripts\\.${name}`));
  }
  includesError(changedSnapshot(snapshot => { delete snapshot.scripts.typecheck; }), /scripts\.typecheck/);
});

test('architecture module identities and dependency targets must be unique and declared', () => {
  includesError(changedContract(contract => { contract.modules.push(structuredClone(contract.modules[0])); }), /Duplicate architecture module id/);
  includesError(changedContract(contract => { contract.modules.find(module => module.id === 'core').allow.push('imaginary-layer'); }), /Unknown dependency core -> imaginary-layer/);
  includesError(changedContract(contract => { contract.dependencyExceptions[0].from = 'imaginary-layer'; }), /Unknown exception module: imaginary-layer/);
  includesError(changedContract(contract => { contract.dependencyExceptions[0].to.push('imaginary-layer'); }), /Unknown exception module: imaginary-layer/);
  includesError(changedContract(contract => { contract.dependencyExceptions[0].reason = '  '; }), /exception requires a reason/);
});

test('reuse entries must be unique and point to an existing source file', () => {
  includesError(changedContract(contract => { contract.reuseEntries.push(structuredClone(contract.reuseEntries[0])); }), /Duplicate reuse entry id/);
  includesError(changedSnapshot(snapshot => { delete snapshot.entries['domains/game/positionState.ts']; }), /Missing reuse entry: domains\/game\/positionState\.ts/);
  includesError(changedSnapshot(snapshot => { snapshot.entries['core/inference/protocol.ts'] = null; }), /Missing reuse entry: core\/inference\/protocol\.ts/);
});

test('shared teaching grading cannot disappear behind a similarly named local declaration', () => {
  includesError(changedSnapshot(snapshot => {
    snapshot.entries['domains/coach/exercise.ts'] = 'function gradeExercise() {}\nexport function applyExerciseGrade() {}';
  }), /Missing named export domains\/coach\/exercise\.ts: gradeExercise/);
});

test('comments, strings and local declarations cannot masquerade as reusable named exports', () => {
  const sources = [
    '// export function searchGomoku() {}\nexport function getGomokuCandidates() {}',
    'const text = "export function searchGomoku() {}"; export function getGomokuCandidates() {}',
    'function searchGomoku() {}\nexport function getGomokuCandidates() {}',
  ];
  for (const source of sources) {
    includesError(changedSnapshot(snapshot => { snapshot.entries['core/gomoku/search.ts'] = source; }),
      /Missing named export core\/gomoku\/search\.ts: searchGomoku/);
  }
});

test('a named default declaration does not provide a named reusable export', () => {
  includesError(changedSnapshot(snapshot => {
    snapshot.entries['core/gomoku/search.ts'] = 'export default function searchGomoku() {}\nexport function getGomokuCandidates() {}';
  }), /Missing named export core\/gomoku\/search\.ts: searchGomoku/);
});

test('explicit named re-exports remain valid without executing their target modules', () => {
  const snapshot = structuredClone(baseline);
  snapshot.entries['core/gomoku/search.ts'] =
    "export { default as searchGomoku, getGomokuCandidates } from './not-executed';";
  assert.deepEqual(validateContracts(snapshot), []);
});

test('generated guide drift is rejected even when the other artifacts remain consistent', () => {
  includesError(changedSnapshot(snapshot => { snapshot.guide += '\nManual dependency exemption\n'; }), /docs\/harness\.md has drifted/);
  includesError(changedSnapshot(snapshot => { snapshot.guide = snapshot.guide.replace('400', '800'); }), /docs\/harness\.md has drifted/);
});

test('CI cannot replace the canonical entry with selected stages or ignore failures in the command', () => {
  for (const command of ['npm test', 'npm run check || true', 'npm run check -- --skip lint']) {
    includesError(changedSnapshot(snapshot => {
      snapshot.ci = snapshot.ci.replace('run: npm run check', `run: ${command}`);
    }), /quality\.yml must call the canonical npm run check entry/);
  }
});

test('CI cannot maintain a second partial pipeline beside the canonical entry', () => {
  for (const command of ['npm run lint', 'npm run typecheck', 'npm test', 'npm run build']) {
    includesError(changedSnapshot(snapshot => { snapshot.ci += `\n      - run: ${command}\n`; }),
      /quality\.yml must not maintain a second check pipeline/);
  }
});

test('CI cannot execute the complete canonical pipeline twice', () => {
  includesError(changedSnapshot(snapshot => { snapshot.ci += '\n      - run: npm run check\n'; }),
    /quality\.yml.*(?:once|duplicate|second)/i);
});

test('instruction and ESLint adapters must keep their authoritative pointers', () => {
  for (const pointer of ['harness/architecture.mjs', 'docs/harness.md']) {
    includesError(changedSnapshot(snapshot => { snapshot.agents = snapshot.agents.replaceAll(pointer, 'old-guide.md'); }),
      /AGENTS\.md must point to/);
  }
  includesError(changedSnapshot(snapshot => { snapshot.claude = 'Maintain an independent Claude-only rulebook.'; }), /CLAUDE\.md must reuse AGENTS\.md/);
  for (const source of ["export default [];", "export { default } from './harness/eslint.mjs';\n// add a parallel configuration here"]) {
    includesError(changedSnapshot(snapshot => { snapshot.eslint = source; }), /eslint\.config\.js must remain a thin harness adapter/);
  }
});

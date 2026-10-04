import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checks, checkOrder, flowTestPaths } from './commands.mjs';
import { repoRoot, fromRoot } from './paths.mjs';
import { architecture } from './architecture.mjs';

const require = createRequire(import.meta.url);
export function commandFor(name, extra = []) {
  if (name === 'test:flows') {
    if (extra.length) throw new Error('test:flows does not accept extra arguments; its flow selection is fixed');
    return commandFor('test', flowTestPaths);
  }
  if (!Object.hasOwn(checks, name)) throw new Error(`Unknown check: ${name}`);
  const check = checks[name];
  if (name !== 'test' && name !== 'lint' && extra.length) throw new Error(`${name} does not accept extra arguments`);
  if (name === 'lint' && extra.some(arg => !['--fix', '--prune-suppressions'].includes(arg))) {
    throw new Error('lint accepts only --fix or --prune-suppressions');
  }
  if (check.script) return [fromRoot(check.script), ...extra];
  const packagePath = require.resolve(`${check.package}/package.json`);
  const metadata = require(packagePath);
  const binary = typeof metadata.bin === 'string' ? metadata.bin : metadata.bin[check.bin];
  if (!binary) throw new Error(`Missing local binary ${check.package}:${check.bin}`);
  return [resolve(dirname(packagePath), binary),
    ...(name === 'lint' ? architecture.sourcePolicy.files : []), ...check.args, ...extra];
}
function execute(args) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, args, { cwd: repoRoot, stdio: 'inherit', shell: false });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolveExit(code ?? (signal === 'SIGINT' ? 130 : 1)));
  });
}
export async function runChecks(command = 'check', extra = [], run = execute) {
  if (command === 'check' && extra.length) throw new Error('check always runs the complete pipeline; use test for a focused run');
  const names = command === 'check' ? checkOrder : [command];
  const stages = names.map(name => ({ name, args: commandFor(name, extra) }));
  for (const { name, args } of stages) {
    console.log(`\n[harness:${name}] ${checks[name === 'test:flows' ? 'test' : name].description}`);
    const code = await run(args);
    if (code !== 0) return code;
  }
  return 0;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'check', ...extra] = process.argv.slice(2);
  if (command === '--help') console.log(`Usage: node harness/run.mjs [check|test:flows|${Object.keys(checks).join('|')}]\nTests accept exact paths under tests/; check is always complete; test:flows uses a fixed flow directory.`);
  else {
    try { process.exitCode = await runChecks(command, extra); }
    catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
  }
}

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { fromRoot, repoRoot } from './paths.mjs';

export async function discoverTests(testRoot = fromRoot('tests'), selectors = []) {
  const discovered = (await readdir(testRoot, { recursive: true }))
    .filter(file => /\.test\.(?:ts|tsx|mjs)$/.test(file)).sort().map(file => join(testRoot, file));
  if (!discovered.length) throw new Error(`No test files found under ${testRoot}`);
  if (!selectors.length) return discovered;
  const selected = new Set();
  for (const selector of selectors) {
    const target = resolve(repoRoot, selector);
    const matches = discovered.filter(file => file === target || file.startsWith(`${target}${sep}`));
    if (!matches.length) throw new Error(`No tests match: ${selector}. Use an exact test file or directory under tests/.`);
    matches.forEach(file => selected.add(file));
  }
  return [...selected].sort();
}
export async function runTests(selectors = []) {
  const testRoot = fromRoot('tests');
  const files = await discoverTests(testRoot, selectors);
  const typed = files.filter(file => /\.tsx?$/.test(file));
  // Native suites keep their own process. Hook suites share the test loader;
  // TS tests are bundled here without substituting their React runtime.
  const native = files.filter(file => file.endsWith('.mjs'));
  const outputDirectory = await mkdtemp(join(tmpdir(), 'cute-go-tests-'));
  try {
    if (typed.length) await build({
      absWorkingDir: repoRoot, entryPoints: typed, outbase: testRoot, outdir: outputDirectory,
      entryNames: '[dir]/[name]', outExtension: { '.js': '.mjs' },
      bundle: true, platform: 'node', format: 'esm', logLevel: 'silent',
    });
    const bundled = typed.map(file => join(outputDirectory, relative(testRoot, file).replace(/\.tsx?$/, '.mjs')));
    const result = spawnSync(process.execPath, ['--test', ...bundled, ...native], { cwd: repoRoot, stdio: 'inherit' });
    if (result.error) throw result.error;
    return result.status ?? 1;
  } finally {
    // Only the exact OS temporary directory just created is owned by this runner.
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

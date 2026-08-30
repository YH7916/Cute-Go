import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const testDirectory = new URL('../tests/', import.meta.url);
const testFiles = (await readdir(testDirectory))
  .filter((file) => file.endsWith('.test.ts'))
  .map((file) => new URL(file, testDirectory).pathname);

if (testFiles.length === 0) {
  throw new Error('No TypeScript test files found');
}

const outputDirectory = await mkdtemp(join(tmpdir(), 'cute-go-tests-'));

try {
  await build({
    entryPoints: testFiles,
    outdir: outputDirectory,
    entryNames: '[name]',
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    logLevel: 'silent',
  });

  const bundledTests = testFiles.map((file) =>
    join(outputDirectory, `${basename(file, '.ts')}.mjs`)
  );
  const result = spawnSync(process.execPath, ['--test', ...bundledTests], { stdio: 'inherit' });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}

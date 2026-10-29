import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as buildFrontend } from 'vite';
import { build as buildBackend } from 'esbuild';
import { repoRoot, fromRoot } from './paths.mjs';

export async function buildProduction({ frontend = buildFrontend, backend = buildBackend } = {}) {
  await frontend({ root: repoRoot });
  await backend({
    absWorkingDir: repoRoot, entryPoints: ['server/coach/main.ts'], outfile: fromRoot('dist-server/main.mjs'),
    bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node22',
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildProduction(); }
  catch (error) { console.error(error instanceof Error ? error.message : 'Production build failed.'); process.exitCode = 1; }
}

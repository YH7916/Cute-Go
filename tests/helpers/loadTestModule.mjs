import { after } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { repoRoot, fromRoot } from '../../harness/paths.mjs';

// Entry imports and aliases resolve from the repository, independent of the
// caller's cwd. Fake React is opt-in; VM/browser tests keep their own hosts.
export async function bundleTestSource({
  contents, entryPoint, reactHost = false, format = 'esm', platform = 'node',
  define = {}, plugins = [], outfile,
}) {
  if ((contents === undefined) === (entryPoint === undefined)) {
    throw new Error('Provide exactly one of contents or entryPoint');
  }
  const result = await build({
    absWorkingDir: repoRoot,
    ...(entryPoint === undefined
      ? { stdin: { contents, resolveDir: repoRoot, loader: 'ts' } }
      : { entryPoints: [fromRoot(entryPoint)] }),
    ...(reactHost ? { alias: { react: fromRoot('tests', 'helpers', 'reactHooks.ts') } } : {}),
    ...(platform === 'node' && format === 'esm' ? { banner: {
      js: "const require = (await import('node:module')).createRequire(import.meta.url);",
    } } : {}),
    bundle: true, write: false, format, platform, define, plugins, outfile,
  });
  return result.outputFiles[0].text;
}

// Every load gets a fresh module identity. Keep a file URL (rather than a data
// URL) so code using import.meta.url still works. The caller owns host cleanup;
// this helper owns generated files, including failures during build/import.
export async function loadTestModule({ registerCleanup = after, ...options }) {
  const temporaryRoot = resolve(tmpdir());
  const directory = await mkdtemp(join(temporaryRoot, 'cutego-test-module-'));
  const cleanup = async () => {
    if (dirname(resolve(directory)) !== temporaryRoot) throw new Error('Unexpected test module directory');
    await rm(directory, { recursive: true, force: true });
  };
  try {
    registerCleanup(cleanup);
    const filename = join(directory, 'module.mjs');
    const source = await bundleTestSource({ ...options, outfile: filename });
    await writeFile(filename, source);
    return await import(pathToFileURL(filename).href);
  } catch (error) {
    await cleanup();
    throw error;
  }
}

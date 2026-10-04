import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Tools resolve the checkout from their module, never from the caller's shell.
export const repoRoot = fileURLToPath(new URL('../', import.meta.url));
export const fromRoot = (...segments) => resolve(repoRoot, ...segments);

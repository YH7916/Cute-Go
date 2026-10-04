import { runTests } from '../harness/testing.mjs';

try { process.exitCode = await runTests(process.argv.slice(2)); }
catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }

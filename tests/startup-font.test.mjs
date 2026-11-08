import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('startup text uses a compact nonblocking webfont instead of shipping the full editing font', async () => {
  const css = await readFile(new URL('../index.css', import.meta.url), 'utf8');
  const face = css.match(/@font-face\s*\{[^}]*GenSenRounded[^}]*\}/)?.[0];
  assert.ok(face);
  assert.match(face, /font-display:\s*swap\s*;/, 'font download must not hide startup text');
  assert.match(face, /format\("woff2"\)/);
  const font = new URL('../ui/fonts/GenSenRounded2PJP-M.woff2', import.meta.url);
  assert.equal((await readFile(font)).subarray(0, 4).toString(), 'wOF2');
  assert.ok((await stat(font)).size < 3_000_000, 'the startup font has a 3 MB download budget');
  await assert.rejects(stat(new URL('../public/GenSenRounded2PJP-M.otf', import.meta.url)), { code: 'ENOENT' });
});

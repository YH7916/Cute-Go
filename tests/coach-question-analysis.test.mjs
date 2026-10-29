import assert from 'node:assert/strict';
import test from 'node:test';
import { setup, settle } from './helpers/coachSession.mjs';

test('a coordinate comparison is sent to local analysis before the only cloud request', async t => {
  const s = await setup(t);
  const analyses = [];
  s.options.difficulty = 'Hard';
  s.options.analyze = async (position, signal, points) => {
    assert.equal(s.requests.length, 0);
    assert.equal(signal.aborted, false);
    analyses.push({ position, points });
    return undefined;
  };
  s.render();
  const pending = s.api.coach.ask('hint', 'D6 和 E5 比较，D6还是E5？');
  await settle();
  assert.deepEqual(analyses[0].points, [{ x: 3, y: 3 }, { x: 4, y: 4 }]);
  assert.equal(s.requests.length, 1);
  const body = JSON.parse(s.requests[0].init.body);
  assert.equal(body.evidence.difficulty, 'Hard');
  s.respondChoice(0);
  await pending;
  assert.equal(s.requests.length, 1);
});

test('offline manual hints can use the same optional local engine without API calls', async t => {
  const s = await setup(t, { endpoint: '', provider: 'deepseek', model: 'deepseek-flash', apiKey: '' });
  let analyses = 0;
  s.options.analyze = async () => { analyses++; return undefined; };
  s.render();
  await s.api.coach.ask('hint');
  assert.equal(analyses, 1);
  assert.equal(s.requests.length, 0);
});

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';

export const installedPiPlugin = { name: 'installed-pi-runtime', setup(build) {
  build.onResolve({ filter: /^@earendil-works\// }, args => ({ path: import.meta.resolve(args.path), external: true }));
} };

export function coachEvidence() {
  return {
    boardSize: 9, boardRows: Array(9).fill('.........'), toPlay: 'black', userColor: 'black',
    komi: 3.5, moveNumber: 0, captures: { black: 0, white: 0 },
    teachingRequest: { proactive: false, intent: 'hint', maxTextChars: 50, maxSentences: 1, maxRefs: 3, maxBoardPoints: 3 },
    teachingChoices: [{ id: 'concept.opening', kind: 'concept', variants: ['可以从空旷角部开始，借两条边围空。'] }],
  };
}

export const coachAnswer = JSON.stringify({ kind: 'explain', text: '可以从空旷角部开始，借两条边围空。', refs: ['concept.opening'] });

export function readInitialCoachRequest(body) {
  const messages = body.messages.filter(message => message.role === 'user');
  assert.equal(messages.length, 1, 'each Pi request starts with exactly one current user snapshot');
  const content = messages[0].content;
  const text = typeof content === 'string' ? content : content.map(part => part.text ?? '').join('');
  const delimiter = text.indexOf('\n');
  assert.ok(delimiter >= 0, 'the dynamic request is a JSON envelope after a static data label');
  const request = JSON.parse(text.slice(delimiter + 1));
  assert.deepEqual(Object.keys(request).sort(), ['evidence', 'question']);
  return request;
}

export function sendPiCompletion(response, { text, tools, reasoning, finishReason, usage } = {}) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
  const chunk = (delta, finish_reason = null) => response.write(`data: ${JSON.stringify({
    id: 'fixture-response', object: 'chat.completion.chunk', created: 1, model: 'fixture-model',
    choices: [{ index: 0, delta, finish_reason }],
  })}\n\n`);
  chunk({ role: 'assistant', ...(text !== undefined ? { content: text } : {}),
    ...(reasoning !== undefined ? { reasoning_content: reasoning } : {}),
    ...(tools ? { tool_calls: tools.map((tool, index) => ({ index, id: `call_${index}`, type: 'function',
      function: { name: tool.name, arguments: JSON.stringify(tool.args ?? {}) } })) } : {}) });
  chunk({}, finishReason ?? (tools ? 'tool_calls' : 'stop'));
  if (usage) response.write(`data: ${JSON.stringify({ id: 'fixture-response', object: 'chat.completion.chunk',
    created: 1, model: 'fixture-model', choices: [], usage })}\n\n`);
  response.end('data: [DONE]\n\n');
}

/** Real local HTTP/SSE provider shared by runtime and BYOK dispatcher regressions. */
export async function createPiProviderFixture(t, respond, createRunner) {
  const requests = [], errors = [];
  const server = createServer(async (request, response) => {
    try {
      let body = '';
      for await (const chunk of request) body += chunk;
      requests.push({ body: JSON.parse(body), url: request.url, authorization: request.headers.authorization });
      await respond(requests.at(-1).body, response, requests.length, request);
    } catch (error) { errors.push(error); response.writeHead(500).end(); }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    assert.deepEqual(errors, []);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const config = { baseUrl: `http://127.0.0.1:${address.port}/v1`, model: 'fixture-model', apiKey: 'synthetic-test-key' };
  return { config, requests, run: createRunner(config) };
}

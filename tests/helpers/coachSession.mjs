import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { loadTestModule } from './loadTestModule.mjs';

const { useCoachSession, useGameState, createInitialPosition, recordMove, undoPosition,
  attemptMove, renderHook, setAgentInterceptor } = await loadTestModule({
  reactHost: true,
  plugins: [{ name: 'coach-runtime-transport', setup(build) {
    build.onResolve({ filter: /agent\/coach\/client$/ }, args => ({
      path: resolve(args.resolveDir, args.path.replace(/client$/, 'runtime.ts')), namespace: 'coach-runtime',
    }));
    build.onLoad({ filter: /.*/, namespace: 'coach-runtime' }, args => ({ loader: 'js', resolveDir: dirname(args.path), contents: `
      import { executeCoachAgent } from ${JSON.stringify(args.path)};
      let intercept;
      export const setAgentInterceptor = value => { intercept = value; };
      export const runCoachAgent = (input, signal) => intercept
        ? intercept(input, signal, () => executeCoachAgent(input, signal)) : executeCoachAgent(input, signal);`,
    }));
  } }],
  contents: `
    export { useCoachSession } from './hooks/useCoachSession';
    export { useGameState } from './hooks/useGameState';
    export { createInitialPosition, recordMove, undoPosition } from './domains/game/positionState';
    export { attemptMove } from './core/go/rules';
    export { renderHook } from './tests/helpers/reactHooks';
    export { setAgentInterceptor } from './agent/coach/client';
  `,
});

const settle = () => new Promise(resolve => setImmediate(resolve));

async function setup(t, config = { endpoint: 'https://coach.example/v1', model: 'test-coach', apiKey: 'test-secret' }) {
  setAgentInterceptor(undefined);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [];
  // The transport deliberately ignores abort: a late server response must still
  // be rejected by the real service and hook ownership checks.
  t.mock.method(globalThis, 'fetch', (url, init) => new Promise((resolve, reject) => {
    requests.push({ url, init, resolve, reject });
  }));
  const options = { active: true, userColor: 'black', gameOver: false, config };
  const host = renderHook(() => {
    const state = useGameState(9);
    return { state, coach: useCoachSession({ ...options,
      position: state.readPosition(), readPosition: state.readPosition }) };
  });
  let api;
  function render() {
    // The host runs effects after returning the render's value. Read once more
    // to observe their setters, without claiming to emulate React concurrency.
    host.render();
    api = host.render();
    return api;
  }
  render();
  await settle();
  render();
  t.after(async () => { host.unmount(); setAgentInterceptor(undefined); await settle(); });
  function respond(index, text) {
    requests[index].resolve(new Response(JSON.stringify({ choices: [
      { message: { content: text }, finish_reason: 'stop' },
    ] }), { headers: { 'Content-Type': 'application/json' } }));
  }
  function respondChoice(index, id = 'current', variant = 0) {
    const content = JSON.parse(requests[index].init.body).messages[1].content;
    const evidence = JSON.parse(content.slice('局面证据：\n'.length, content.indexOf('\n玩家问题：')));
    const choice = evidence.teachingChoices.find(item => item.id === id);
    assert.ok(choice?.variants[variant], 'the fixture must select an available verified explanation');
    respond(index, JSON.stringify({ kind: 'explain', parts: [{ id, variant }] }));
    return choice.variants[variant];
  }
  return { options, requests, respond, respondChoice, render, unmount: host.unmount, get api() { return api; } };
}

function move(s, x, y) {
  const { state } = s.api;
  const position = state.readPosition();
  const result = attemptMove(position.board, x, y, position.currentPlayer);
  assert.ok(result, 'fixture move must be legal');
  state.writePosition(recordMove(position, result.newBoard, { x, y }, result.captured, false));
}

async function makeHumanTurn(s) {
  move(s, 2, 2);
  move(s, 6, 6);
  s.render();
  await settle();
  s.render();
}

async function makeNewAtari(s) {
  const before = createInitialPosition(9);
  before.currentPlayer = 'white';
  before.board[1][1] = { color: 'black', x: 1, y: 1, id: 'black' };
  for (const [x, y] of [[0, 1], [1, 0]]) {
    before.board[y][x] = { color: 'white', x, y, id: `white-${x}-${y}` };
  }
  s.api.state.writePosition(before);
  move(s, 2, 1);
  s.render();
  await settle();
  s.render();
}

export { createInitialPosition, undoPosition, setAgentInterceptor, settle, setup, move, makeHumanTurn, makeNewAtari };

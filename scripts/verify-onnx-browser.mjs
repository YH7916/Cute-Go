// Import in a Playwright runner, then on the production preview page:
// const report = await page.evaluate(verifyOnnxBrowser, {
//   workerUrl, difficultyConfigs, sizeKomis, fixtures,
// });
// Serialize difficultyConfigs from getAIConfig and sizeKomis from getDefaultKomi.
// Optional fixtures are { label, data } requests built through production rules.
// workerUrl is the built assets/ai.worker-*.js URL, not the source TS module.
// This opt-in smoke uses the real model/WASM; it is not part of npm test.
export async function verifyOnnxBrowser({ workerUrl, baseUrl = location.href, difficultyConfigs, sizeKomis, fixtures = [] }) {
  const started = performance.now();
  const report = {
    ok: false, cases: [], events: [], totalMs: 0,
    userAgent: navigator.userAgent, requestedThreads: 1, difficultyConfigs, sizeKomis,
    cancellationScope: 'Request cancellation and recovery; execution-in-flight is not established by the 40 ms delay.',
  };
  const timers = new Set();
  const waiters = new Set();
  const cancelled = new Map();
  let worker, failure, generation = 1, requestId = 0;
  const elapsed = () => Math.round((performance.now() - started) * 100) / 100;
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  const log = (direction, message) => report.events.push({
    atMs: elapsed(), direction, type: message.type, generation: message.generation,
    ...(message.requestId === undefined ? {} : { requestId: message.requestId }),
    ...(message.message ? { message: String(message.message).slice(0, 240) } : {}),
    ...(message.data?.size ? {
      size: message.data.size, difficulty: message.data.difficulty,
      mode: message.data.mode, simulations: message.data.simulations,
    } : {}),
    ...(direction === 'sent' && message.type === 'compute' ? { input: message.data } : {}),
    ...(message.type === 'ai-response' ? { ownershipLength: message.data?.ownership?.length ?? null } : {}),
  });
  function finish(waiter, error, value) {
    clearTimeout(waiter.timer);
    timers.delete(waiter.timer);
    waiters.delete(waiter);
    if (error) waiter.reject(error); else waiter.resolve(value);
  }
  function fail(error) {
    failure ??= error instanceof Error ? error : new Error(String(error));
    for (const waiter of [...waiters]) finish(waiter, failure);
  }
  function waitFor(type, expectedGeneration, expectedId) {
    if (failure) throw failure;
    return new Promise((resolve, reject) => {
      const waiter = { type, generation: expectedGeneration, requestId: expectedId, resolve, reject };
      waiter.timer = setTimeout(() => {
        fail(new Error(`Timed out waiting for ${type}, generation=${expectedGeneration}, request=${expectedId ?? '-'}`));
      }, 180000);
      timers.add(waiter.timer);
      waiters.add(waiter);
    });
  }
  function send(message) {
    if (failure) throw failure;
    log('sent', message);
    worker.postMessage(message);
  }
  async function exchange(message, replyType) {
    const reply = waitFor(replyType, message.generation, message.requestId);
    send(message);
    return await reply;
  }
  const delay = ms => new Promise(resolve => {
    const timer = setTimeout(() => { timers.delete(timer); resolve(); }, ms);
    timers.add(timer);
  });
  function compute(size, difficulty, mode = 'play', simulations = difficultyConfigs[difficulty].simulations) {
    const empty = Array.from({ length: size }, () => Array(size).fill(null));
    const board = empty.map(row => [...row]);
    const center = Math.floor(size / 2);
    board[center][center] = { x: center, y: center, color: 'black', id: 'smoke-first-stone' };
    return { type: 'compute', generation, requestId: ++requestId, data: {
      board, color: 'white', size, gameType: 'Go', difficulty, mode, simulations,
      komi: sizeKomis[size], temperature: difficultyConfigs[difficulty].temperature,
      history: [{ board: empty, currentPlayer: 'black', blackCaptures: 0, whiteCaptures: 0,
        lastMove: null, move: { x: center, y: center }, consecutivePasses: 0 }],
    } };
  }
  async function run(message, label) {
    const atMs = elapsed();
    const { data } = await exchange(message, 'ai-response');
    const { size, board, mode } = message.data;
    check(data && Number.isFinite(data.winRate) && data.winRate >= 0 && data.winRate <= 100, `${label}: invalid winRate`);
    check(Number.isFinite(data.lead), `${label}: invalid lead`);
    check((Array.isArray(data.ownership) || ArrayBuffer.isView(data.ownership))
      && data.ownership.length === size * size
      && Array.from(data.ownership).every(value => Number.isFinite(value) && Math.abs(value) <= 1), `${label}: invalid ownership`);
    if (mode === 'analyze') check(data.move === null, `${label}: analysis returned a move`);
    else {
      const stones = board.flat().filter(Boolean);
      if (stones.length === 1 && stones[0].color === 'black') {
        const totalBoardAward = size * size - 1 - message.data.komi;
        check(Math.abs(data.lead - totalBoardAward) > 0.01, `${label}: live estimate awarded the whole board after one stone`);
      }
      const move = data.move;
      check(move && Number.isInteger(move.x) && Number.isInteger(move.y)
        && move.x >= 0 && move.x < size && move.y >= 0 && move.y < size
        && board[move.y][move.x] === null, `${label}: move is not an empty intersection`);
    }
    if (message.data.purpose === 'coach') {
      check(data.purpose === 'coach' && data.move === null, `${label}: invalid coach response`);
      check(Number.isFinite(data.estimatedBlackLead), `${label}: invalid coach live estimate`);
      check(Number.isInteger(data.visits) && data.visits >= 1 && data.visits <= 32, `${label}: invalid coach visits`);
      check(Array.isArray(data.candidates) && data.candidates.length <= 3 && data.candidates.every(candidate => {
        const point = candidate?.point;
        return point && Number.isInteger(point.x) && Number.isInteger(point.y)
          && point.x >= 0 && point.x < size && point.y >= 0 && point.y < size
          && board[point.y][point.x] === null && Number.isInteger(candidate.visits) && candidate.visits >= 0;
      }), `${label}: invalid coach candidates`);
    }
    report.cases.push({ label, requestId: message.requestId, generation: message.generation,
      size, difficulty: message.data.difficulty, mode, simulations: message.data.simulations,
      atMs, durationMs: Math.round((elapsed() - atMs) * 100) / 100,
      move: data.move, winRate: data.winRate, lead: data.lead, ownershipLength: data.ownership.length,
      ownershipMin: Math.min(...data.ownership), ownershipMax: Math.max(...data.ownership),
      input: message.data, ownership: Array.from(data.ownership),
      ...(message.data.purpose === 'coach' ? {
        purpose: data.purpose, visits: data.visits, candidates: data.candidates,
        estimatedBlackLead: data.estimatedBlackLead,
      } : {}),
    });
  }
  async function startCancelled(label) {
    const message = compute(19, 'Hard', 'play', 32);
    cancelled.set(message.requestId, { label, sent: false });
    send(message);
    await delay(40);
    if (failure) throw failure;
    cancelled.get(message.requestId).sent = true;
    generation++;
    return message.requestId;
  }
  try {
    check(typeof workerUrl === 'string' && workerUrl.length > 0, 'A production workerUrl is required');
    for (const difficulty of ['Easy', 'Medium', 'Hard']) {
      const config = difficultyConfigs?.[difficulty];
      check(config?.useModel === true && Number.isInteger(config.simulations) && config.simulations > 0
        && Number.isFinite(config.temperature) && config.temperature >= 0,
      `Production getAIConfig output is required for ${difficulty}`);
    }
    for (const size of [5, 9, 10, 13, 19]) {
      check(Number.isFinite(sizeKomis?.[size]), `Production getDefaultKomi output is required for size ${size}`);
    }
    check(Array.isArray(fixtures), 'fixtures must be an array of { label, data } requests');
    const base = new URL('.', baseUrl);
    report.workerUrl = new URL(workerUrl, baseUrl).href;
    report.modelUrl = new URL('models/kata_dynamic.onnx', base).href;
    report.wasmUrl = new URL('wasm/', base).href;
    worker = new Worker(report.workerUrl, { type: 'module' });
    worker.onerror = event => { event.preventDefault(); fail(new Error(event.message || 'Worker failed')); };
    worker.onmessageerror = () => fail(new Error('Worker message could not be deserialized'));
    worker.onmessage = event => {
      const message = event.data;
      if (!message || typeof message !== 'object') { fail(new Error('Invalid Worker reply')); return; }
      log('received', message);
      if (message.type === 'error') { fail(new Error(message.message || 'Worker error')); return; }
      const cancellation = cancelled.get(message.requestId);
      if (message.type === 'ai-response' && cancellation) {
        fail(new Error(cancellation.sent ? `${cancellation.label}: cancelled request returned a response`
          : `${cancellation.label}: request finished before cancellation could be applied`));
        return;
      }
      for (const waiter of [...waiters]) {
        if (message.type === waiter.type && message.generation === waiter.generation
          && message.requestId === waiter.requestId) finish(waiter, null, message);
      }
    };
    await exchange({ type: 'init', generation, payload: {
      modelPath: report.modelUrl, wasmPath: report.wasmUrl, numThreads: 1, onlyRules: false,
    } }, 'init-complete');
    for (const size of [5, 9, 10, 13, 19]) {
      for (const difficulty of ['Easy', 'Medium', 'Hard']) await run(compute(size, difficulty), `${size}-${difficulty}`);
    }
    await run(compute(9, 'Hard', 'analyze', 100), '9-Hard-analysis');
    for (const fixture of fixtures) {
      check(typeof fixture?.label === 'string' && fixture.label.length > 0 && fixture.data,
        'Each fixture needs a label and compute data');
      await run({ type: 'compute', generation, requestId: ++requestId, data: fixture.data }, fixture.label);
    }
    const stoppedId = await startCancelled('stop');
    send({ type: 'stop', generation });
    await run(compute(9, 'Easy'), 'after-stop-9-Easy');
    const releasedId = await startCancelled('release');
    await exchange({ type: 'release', generation }, 'released');
    await exchange({ type: 'reinit', generation: ++generation }, 'init-complete');
    await run(compute(13, 'Easy'), 'after-release-reinit-13-Easy');
    if (failure) throw failure;
    report.cancelledRequestIds = [stoppedId, releasedId];
    report.ok = true;
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  } finally {
    worker?.terminate();
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
    waiters.clear();
    report.totalMs = elapsed();
  }
  return report;
}

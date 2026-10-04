import type { CoachAgentInput, CoachAgentRequest, CoachAgentResponse, CoachAgentResult } from './contract';

const STARTUP_TIMEOUT_MS = 5000;
const EXECUTION_TIMEOUT_MS = 35000;
let nextRequestId = 0;
const abortError = () => new DOMException('讲解已取消', 'AbortError');

async function executeFallback(input: CoachAgentInput, signal?: AbortSignal): Promise<CoachAgentResult> {
  if (signal?.aborted) throw abortError();
  let rejectLoading!: (reason: Error) => void;
  const interrupted = new Promise<never>((_, reject) => { rejectLoading = reject; });
  const cancel = () => rejectLoading(abortError());
  const timer = setTimeout(() => rejectLoading(new Error('教学执行模块加载超时，请重试。')), STARTUP_TIMEOUT_MS);
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    // Import downloads cannot be aborted, but their late completion must never
    // execute a cancelled or timed-out request (and potentially spend API credit).
    const { executeCoachAgent } = await Promise.race([import('./runtime'), interrupted]);
    if (signal?.aborted) throw abortError();
    return executeCoachAgent(input, signal);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export function runCoachAgent(input: CoachAgentInput, signal?: AbortSignal): Promise<CoachAgentResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  if (typeof Worker === 'undefined') return executeFallback(input, signal);
  let worker: Worker;
  try { worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module', name: 'cute-go-coach' }); }
  catch { return executeFallback(input, signal); }
  const requestId = ++nextRequestId;
  return new Promise((resolve, reject) => {
    let settled = false;
    let sent = false;
    let timer: ReturnType<typeof setTimeout>;
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };
    const fallback = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // A request already sent may have reached a billable provider. Recover the
      // local lesson only, never silently issue that cloud request a second time.
      const recovery = sent ? { ...input, kind: 'inspect' as const } : input;
      void executeFallback(recovery, signal).then(result => {
        resolve(sent && input.kind === 'ask'
          ? { ...result, error: '教学执行暂时中断，已恢复本地提示；可重新请求讲解。' } : result);
      }, reject);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(fallback, STARTUP_TIMEOUT_MS);
    worker.onerror = event => { event.preventDefault(); fallback(); };
    worker.onmessageerror = fallback;
    worker.onmessage = ({ data }: MessageEvent<CoachAgentResponse>) => {
      if (settled || !data) return;
      if (data.type === 'ready') {
        if (sent) return;
        clearTimeout(timer);
        timer = setTimeout(fallback, EXECUTION_TIMEOUT_MS);
        const request: CoachAgentRequest = { type: 'run', requestId, input };
        try { worker.postMessage(request); sent = true; } catch { fallback(); }
        return;
      }
      if (!sent || data.requestId !== requestId) return;
      if (data.type === 'error') { fallback(); return; }
      if (data.type !== 'result') return;
      settled = true;
      cleanup();
      resolve(data.result);
    };
  });
}

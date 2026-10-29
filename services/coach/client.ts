import { validateCoachConfig } from './settings';
import type { CoachCloudRequest, CoachReply, CoachRequest } from './types';

const TIMEOUT_MS = 30000;
const MAX_RESPONSE_BYTES = 65536;

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
class CoachServiceError extends Error {}

function encodeEvidence(value: unknown): string {
  const seen = new Set<object>();
  function check(item: unknown, depth: number): void {
    if (depth > 20) throw new Error('局面数据过于复杂。');
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || seen.has(item)) throw new Error('局面数据格式不正确。');
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw new Error('局面数据须为普通 JSON。');
    seen.add(item);
    Object.values(item).forEach(child => check(child, depth + 1));
    seen.delete(item);
  }
  check(value, 0);
  const encoded = JSON.stringify(value);
  if (encoded.length > 50000) throw new Error('局面数据过大，请缩小讲解范围。');
  return encoded;
}

async function readPayload(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!response.body) throw new CoachServiceError('服务没有返回讲解内容。');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new CoachServiceError('服务响应过大，请换用简短回复模型。');
      }
      text += decoder.decode(next.value, { stream: true });
    }
    text += decoder.decode();
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  try { return JSON.parse(text) as unknown; } catch { throw new CoachServiceError('后台返回的格式无法识别，请检查服务地址。'); }
}

function parseReply(payload: unknown, secret: string): CoachReply {
  if (!record(payload) || typeof payload.text !== 'string' || !payload.text.trim()) throw new CoachServiceError('后台返回的格式无法识别。');
  const safe = secret ? payload.text.split(secret).join('[密钥已隐藏]') : payload.text;
  return { text: safe.trim() };
}

export async function requestCoachReply({ config, evidence, question = '', signal }: CoachRequest): Promise<CoachReply> {
  const checked = validateCoachConfig(config, true);
  if (question.length > 500) throw new Error('问题请控制在 500 字以内。');
  const encoded = encodeEvidence(evidence);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('讲解已取消', 'AbortError');
  signal?.addEventListener('abort', abort, { once: true });
  let cancelPending = () => {};
  const aborted = new Promise<never>((_, reject) => {
    cancelPending = () => reject(new DOMException('讲解已取消', 'AbortError'));
    controller.signal.addEventListener('abort', cancelPending, { once: true });
  });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT_MS);
  const send = async () => {
    const response = await fetch(checked.endpoint, {
      method: 'POST', signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${checked.apiKey}` },
      body: JSON.stringify({ evidence: JSON.parse(encoded) as unknown, question: question.trim(),
        provider: checked.provider, model: checked.model } satisfies CoachCloudRequest),
    });
    if (controller.signal.aborted) {
      void response.body?.cancel().catch(() => undefined);
      throw new DOMException('讲解已取消', 'AbortError');
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403) throw new CoachServiceError('服务未授权，请检查所选服务商的 API 密钥及模型权限。');
      if (response.status === 429) throw new CoachServiceError('讲解服务繁忙，请稍后重试。');
      if (response.status === 424 || response.status === 502) throw new CoachServiceError('模型服务暂不可用，请检查模型、API key 和额度后重试。');
      throw new CoachServiceError(`讲解服务暂不可用（HTTP ${response.status}），请检查后台状态后重试。`);
    }
    const reply = parseReply(await readPayload(response, controller.signal), checked.apiKey);
    if (controller.signal.aborted) throw new DOMException('讲解已取消', 'AbortError');
    return reply;
  };
  try {
    return await Promise.race([send(), aborted]);
  } catch (error) {
    if (timedOut) throw new Error('讲解请求超过 30 秒，请稍后重试。');
    if (signal?.aborted) throw new DOMException('讲解已取消', 'AbortError');
    if (error instanceof TypeError) throw new Error('无法连接陪练后台，请检查后台是否启动、地址及跨域配置（CORS）。');
    if (error instanceof CoachServiceError) throw error;
    throw new Error('讲解请求失败，请检查服务配置后重试。');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', cancelPending);
  }
}

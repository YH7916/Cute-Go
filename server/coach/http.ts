import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { parseCoachModel, validateCoachApiKey, type CoachCloudRequest, type CoachCloudReply } from '../../shared/coach';
import type { PiCoachExecutionRequest } from './types';

export interface CoachHttpOptions {
  runReply: (request: PiCoachExecutionRequest, signal?: AbortSignal) => Promise<CoachCloudReply>;
  allowedOrigin?: string;
  timeoutMs?: number;
  maxConcurrent?: number;
}

const MAX_BODY_BYTES = 65536;
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}

function fail(response: ServerResponse, status: number, code: string, error: string) {
  if (!response.destroyed && !response.writableEnded) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff' });
    response.end(JSON.stringify({ error, code }));
  }
}

export function validateCoachOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  let origin: URL;
  try { origin = new URL(value); } catch { throw new Error('COACH_ALLOWED_ORIGIN 必须是完整的 HTTP(S) origin。'); }
  if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== value) {
    throw new Error('COACH_ALLOWED_ORIGIN 必须是单个 HTTP(S) origin，不含路径或通配符。');
  }
  return origin.origin;
}

function checkOrigin(request: IncomingMessage, response: ServerResponse, allowedOrigin?: string): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  // Host is supplied by the caller and cannot establish a trusted browser
  // origin, including when DNS rebinding points that host at this local server.
  if (origin !== allowedOrigin) return false;
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Vary', 'Origin');
  return true;
}

function readApiKey(request: IncomingMessage): string {
  const header = request.headers.authorization?.match(/^Bearer (.+)$/i);
  if (!header) throw new HttpError(401, 'unauthorized', '请提供模型 API 密钥。');
  try { return validateCoachApiKey(header[1]); }
  catch { throw new HttpError(401, 'unauthorized', '模型 API 密钥格式不正确。'); }
}

function readRequest(request: IncomingMessage, signal: AbortSignal): Promise<CoachCloudRequest> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    const cleanup = () => {
      request.off('data', data); request.off('end', end); request.off('error', error);
      signal.removeEventListener('abort', abort);
    };
    const stop = (reason: Error) => { cleanup(); request.resume(); reject(reason); };
    const error = () => stop(new HttpError(400, 'invalid_request', '请求数据无法读取。'));
    const abort = () => stop(new HttpError(499, 'aborted', '讲解已取消。'));
    const data = (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_BODY_BYTES) { stop(new HttpError(413, 'invalid_request', '请求数据过大。')); return; }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      let value: unknown;
      try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { reject(new HttpError(400, 'invalid_request', '请求必须是有效 JSON。')); return; }
      if (!record(value) || !record(value.evidence) || typeof value.question !== 'string' || value.question.length > 500
        || Object.keys(value).some(key => !['evidence', 'question', 'provider', 'model'].includes(key))) {
        reject(new HttpError(400, 'invalid_request', '请求须包含局面证据、模型选择和不超过 500 字的问题。')); return;
      }
      try { resolve({ ...parseCoachModel(value), evidence: value.evidence, question: value.question }); }
      catch { reject(new HttpError(400, 'invalid_request', '模型服务或模型名称不受支持。')); }
    };
    if (signal.aborted) { abort(); return; }
    request.on('data', data); request.once('end', end); request.once('error', error);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function reportError(response: ServerResponse, error: unknown, timedOut: boolean) {
  // Handled execution failures use 424: CDN gateway pages can replace 502/504 and strip CORS/JSON.
  if (timedOut) { fail(response, 424, 'timeout', '讲解请求超时，请稍后重试。'); return; }
  if (error instanceof HttpError) { fail(response, error.status, error.code, error.message); return; }
  const code = record(error) && typeof error.code === 'string' ? error.code : '';
  if (code === 'invalid_request') fail(response, 400, code, '局面证据格式不正确。');
  else if (code === 'timeout') fail(response, 424, code, '讲解请求超时，请稍后重试。');
  else if (code === 'limit_exceeded') fail(response, 424, code, '本次讲解已达到执行上限，请缩小问题范围。');
  else if (code === 'aborted') fail(response, 499, code, '讲解已取消。');
  else fail(response, 424, 'upstream_error', '模型服务暂不可用，请检查模型、API key 和额度后重试。');
}

/** The HTTP lifetime owns one Pi request; user credentials remain header-only and request-local. */
export function createCoachHttpServer(options: CoachHttpOptions) {
  const allowedOrigin = validateCoachOrigin(options.allowedOrigin);
  const timeoutMs = options.timeoutMs ?? 25000;
  const maxConcurrent = options.maxConcurrent ?? 4;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs >= 30000
    || !Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new Error('讲解服务执行预算无效。');
  let active = 0;
  return createServer({ requestTimeout: timeoutMs, headersTimeout: timeoutMs }, async (request, response) => {
    // A partially uploaded request can emit error after aborted; retain a bounded
    // listener even after cancellation has removed the body reader's listeners.
    request.on('error', () => {});
    if (request.url !== '/api/coach') { fail(response, 404, 'not_found', '接口不存在。'); return; }
    if (!checkOrigin(request, response, allowedOrigin)) { fail(response, 403, 'forbidden', '请求来源未获允许。'); return; }
    if (request.method === 'OPTIONS') {
      const headers = (request.headers['access-control-request-headers'] ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
      if (request.headers['access-control-request-method'] !== 'POST' || headers.some(value => !['authorization', 'content-type'].includes(value))) {
        fail(response, 403, 'forbidden', '跨域请求不受支持。'); return;
      }
      response.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' });
      response.end(); return;
    }
    if (request.method !== 'POST') { response.setHeader('Allow', 'POST, OPTIONS'); fail(response, 405, 'method_not_allowed', '请使用 POST 请求。'); return; }
    let apiKey: string;
    try { apiKey = readApiKey(request); }
    catch (error) { reportError(response, error, false); return; }
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? '')) { fail(response, 415, 'invalid_request', '请求须使用 application/json。'); return; }
    if (Number(request.headers['content-length']) > MAX_BODY_BYTES) { response.setHeader('Connection', 'close'); fail(response, 413, 'invalid_request', '请求数据过大。'); return; }
    if (active >= maxConcurrent) { response.setHeader('Retry-After', '1'); fail(response, 429, 'busy', '讲解服务繁忙，请稍后重试。'); return; }
    active += 1;
    const controller = new AbortController();
    let timedOut = false;
    const disconnect = () => { if (!response.writableEnded) controller.abort(); };
    request.once('aborted', disconnect); response.once('close', disconnect);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let rejectAborted: () => void = () => {};
    const interrupted = new Promise<never>((_, reject) => {
      rejectAborted = () => reject(new HttpError(499, 'aborted', '讲解已取消。'));
      controller.signal.addEventListener('abort', rejectAborted, { once: true });
    });
    const work = (async () => {
      const input = await readRequest(request, controller.signal);
      if (controller.signal.aborted) throw new HttpError(499, 'aborted', '讲解已取消。');
      return options.runReply({ ...input, apiKey }, controller.signal);
    })();
    // An uncooperative provider retains its slot until it actually stops; timeout
    // must not silently admit unlimited work that is still spending API credit.
    void work.then(() => { active -= 1; }, () => { active -= 1; });
    try {
      const result = await Promise.race([work, interrupted]);
      if (!result || typeof result.text !== 'string' || !result.text.trim() || Buffer.byteLength(result.text) > 16384) {
        throw new HttpError(424, 'invalid_response', '讲解服务返回了无效内容。');
      }
      if (!response.destroyed && !controller.signal.aborted) {
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        const usage = result.usage;
        const validUsage = usage && Object.values(usage).every(value => Number.isSafeInteger(value) && value >= 0)
          && usage.cachedInputTokens <= usage.inputTokens;
        response.end(JSON.stringify({ text: result.text, ...(validUsage ? { usage: {
          modelCalls: usage.modelCalls, inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens, outputTokens: usage.outputTokens,
        } } : {}) }));
      }
    } catch (error) { reportError(response, error, timedOut); }
    finally {
      clearTimeout(timer); request.off('aborted', disconnect); response.off('close', disconnect);
      controller.signal.removeEventListener('abort', rejectAborted);
    }
  });
}

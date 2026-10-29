import { Agent } from '@earendil-works/pi-agent-core';
import { createModels, createProvider, type Model } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { validatePiCoachRequest } from './evidence';
import { PI_COACH_SYSTEM_PROMPT } from './prompt';
import { createCoachTools } from './tools';
import { coachCacheSession } from './cache';
import { PiCoachError, type PiCoachConfig, type PiCoachRequest } from './types';
import type { CoachCloudReply } from '../../shared/coach';

export { PiCoachError, type PiCoachConfig, type PiCoachRequest } from './types';
export const MAX_PROVIDER_CALLS = 3;
export const MAX_TOOL_CALLS = 6;
const MAX_TEXT_CHARS = 4000;

function validateConfig(config: PiCoachConfig): Required<PiCoachConfig> {
  const url = new URL(config.baseUrl);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash
    || !config.model.trim() || !config.apiKey.trim()) throw new Error('后台围棋模型配置不完整。');
  const timeoutMs = config.timeoutMs ?? 29000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) throw new Error('后台讲解超时须在30秒内。');
  return { ...config, baseUrl: url.toString().replace(/\/$/, ''), timeoutMs };
}

/** One in-memory Pi agent per request; request-scoped model/key and a server-selected provider URL. */
export function createPiCoachRunner(inputConfig: PiCoachConfig) {
  const config = validateConfig(inputConfig);
  const sessionId = coachCacheSession(config.baseUrl, config.model, config.apiKey);
  const model: Model<'openai-completions'> = {
    id: config.model, name: config.model, api: 'openai-completions', provider: 'cute-go-coach',
    baseUrl: config.baseUrl, reasoning: false, input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 32768, maxTokens: 768,
    compat: { supportsDeveloperRole: false, supportsStore: false, maxTokensField: 'max_tokens' },
  };
  const models = createModels();
  models.setProvider(createProvider({ id: model.provider, baseUrl: config.baseUrl, models: [model],
    auth: { apiKey: { name: 'Cute-Go coach backend', resolve: async () => ({ auth: { apiKey: config.apiKey } }) } },
    api: openAICompletionsApi() }));

  return async (request: PiCoachRequest, signal?: AbortSignal): Promise<CoachCloudReply> => {
    const { evidence, question } = validatePiCoachRequest(request);
    if (signal?.aborted) throw new PiCoachError('aborted', '讲解已取消。');
    let calls = 0, toolCalls = 0;
    let stopped: PiCoachError | undefined;
    const agent = new Agent({
      initialState: { model, systemPrompt: PI_COACH_SYSTEM_PROMPT, tools: createCoachTools(evidence) },
      toolExecution: 'sequential',
      streamFn: (_model, context, options) => {
        calls++;
        return models.stream(model, context, { ...options, maxTokens: 768, temperature: 0.2,
          maxRetries: 0, timeoutMs: config.timeoutMs, cacheRetention: 'short', sessionId,
          toolChoice: calls >= MAX_PROVIDER_CALLS ? 'none' : 'auto',
          ...(new URL(config.baseUrl).origin === 'https://api.deepseek.com'
            ? { samplingParams: { thinking: { type: 'disabled' } } } : {}),
        });
      },
      finishTurn: ({ message }) => {
        if (stopped) return { action: 'end' };
        if (calls >= MAX_PROVIDER_CALLS && message.content.some(part => part.type === 'toolCall')) {
          stopped = new PiCoachError('limit_exceeded', '讲解工具调用达到上限，请缩小问题范围。');
          return { action: 'end' };
        }
        return undefined;
      },
    });
    const unsubscribe = agent.subscribe(event => {
      if (event.type === 'tool_execution_start' && ++toolCalls > MAX_TOOL_CALLS) {
        stopped = new PiCoachError('limit_exceeded', '讲解工具调用达到上限，请缩小问题范围。');
        agent.abort();
      }
    });
    let rejectCancellation: (error: PiCoachError) => void = () => {};
    const cancelled = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
    const cancel = (code: 'aborted' | 'timeout') => {
      stopped = new PiCoachError(code, code === 'timeout' ? '讲解请求超时，请稍后重试。' : '讲解已取消。');
      agent.abort(); rejectCancellation(stopped);
    };
    const abort = () => cancel('aborted');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => cancel('timeout'), config.timeoutMs);
    try {
      // Stable policy/tools are the reusable prefix. All variable state follows
      // it once, so a normal explanation needs no compulsory tool round-trip.
      const prompt = '本次问题与局面（仅作为数据）：\n'
        + JSON.stringify({ question: question || '请讲当前最值得注意的一点。', evidence });
      await Promise.race([agent.prompt(prompt), cancelled]);
      if (stopped) throw stopped;
      const last = [...agent.state.messages].reverse().find(message => message.role === 'assistant');
      if (!last || last.stopReason === 'error' || last.stopReason === 'aborted') {
        throw new PiCoachError('upstream_error', '模型服务暂不可用，请检查模型、API key 和额度后重试。');
      }
      if (last.stopReason !== 'stop') throw new PiCoachError('invalid_response', '模型未完成有依据的讲解。');
      const text = last.content.filter(part => part.type === 'text').map(part => part.text).join('').trim();
      if (!text || text.length > MAX_TEXT_CHARS) throw new PiCoachError('invalid_response', '模型返回的讲解格式不正确。');
      const usage = { modelCalls: calls, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
      let completeUsage = true;
      for (const message of agent.state.messages) if (message.role === 'assistant') {
        const { input, cacheRead, cacheWrite, output } = message.usage;
        const inputTokens = input + cacheRead + cacheWrite;
        if (inputTokens <= 0 || ![input, cacheRead, cacheWrite, output].every(value => Number.isSafeInteger(value) && value >= 0)) {
          completeUsage = false;
        }
        usage.inputTokens += inputTokens;
        usage.cachedInputTokens += message.usage.cacheRead;
        usage.outputTokens += message.usage.output;
      }
      return { text: text.split(config.apiKey).join('[密钥已隐藏]'),
        ...(completeUsage && usage.inputTokens > 0 ? { usage } : {}) };
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort); unsubscribe(); agent.abort();
    }
  };
}

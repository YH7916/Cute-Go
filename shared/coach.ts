/** Public wire contract consumed by the browser transport and hosted Pi dispatcher. */
export const COACH_PROVIDERS = [
  { id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-flash' },
  { id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4.1-mini' },
] as const;

export type CoachProvider = typeof COACH_PROVIDERS[number]['id'];
export interface CoachCloudRequest {
  evidence: unknown;
  question: string;
  provider: CoachProvider;
  model: string;
}
export interface CoachUsage {
  modelCalls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}
export interface CoachCloudReply { text: string; usage?: CoachUsage }

export function parseCoachModel(value: unknown): Pick<CoachCloudRequest, 'provider' | 'model'> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请选择模型服务商。');
  const record = value as Record<string, unknown>;
  const provider = COACH_PROVIDERS.find(item => item.id === record.provider);
  if (!provider) throw new Error('请选择支持的模型服务商。');
  if (typeof record.model !== 'string' || !record.model.trim() || record.model.length > 200
    || /\p{Cc}/u.test(record.model)) throw new Error('请填写有效模型名称（最多 200 字符）。');
  return { provider: provider.id, model: record.model.trim() };
}

export function validateCoachApiKey(value: string, required = true): string {
  const key = value.trim();
  if (required && !key) throw new Error('请填写模型 API key。');
  if (key.length > 4096 || /[\s\p{Cc}]/u.test(key)) throw new Error('API key 格式不正确。');
  return key;
}

import type { CoachConfig, StoredCoachSettings } from './types';

export const COACH_STORAGE_KEY = 'cutego.coach.settings.v1';
// Official provider documentation checked 2026-10-01; identifiers remain editable.
export const COACH_PRESETS = [
  { id: 'deepseek', label: 'DeepSeek', endpoint: 'https://api.deepseek.com', model: 'deepseek-flash' },
  { id: 'openai', label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { id: 'custom', label: '自定义', endpoint: '', model: '' },
] as const;
export const defaultCoachConfig = (): CoachConfig => ({
  endpoint: COACH_PRESETS[0].endpoint, model: COACH_PRESETS[0].model, apiKey: '',
});

export function normalizeCoachEndpoint(value: string): string {
  const raw = value.trim();
  if (!raw || raw.length > 2048 || /[\s\\?#]/.test(raw)) throw new Error('请填写有效 API 地址，不含查询参数、片段或空格。');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('API 地址须为完整的 HTTPS URL。'); }
  if (url.username || url.password) throw new Error('API 地址不能包含账号或密码。');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url.hostname))) {
    throw new Error('API 地址须使用 HTTPS；本机 localhost 可使用 HTTP。');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href.replace(/\/$/, '');
}

function isLocalHost(host: string) { return ['localhost', '127.0.0.1', '[::1]'].includes(host); }
export function isLocalCoachEndpoint(endpoint: string): boolean {
  try { return isLocalHost(new URL(endpoint).hostname); } catch { return false; }
}
export function coachCompletionUrl(endpoint: string): string {
  const normalized = normalizeCoachEndpoint(endpoint);
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}
export function validateCoachConfig(config: CoachConfig, requireCredentials = false): CoachConfig {
  const endpoint = normalizeCoachEndpoint(config.endpoint);
  const model = config.model.trim();
  const apiKey = config.apiKey.trim();
  if (!model || model.length > 200 || /[\r\n\x00-\x1f]/.test(model)) throw new Error('请填写有效模型名（不超过 200 字符）。');
  if (apiKey.length > 4096 || /[\r\n\x00-\x20]/.test(apiKey)) throw new Error('密钥格式不正确，请重新粘贴。');
  if (requireCredentials && !apiKey && !isLocalCoachEndpoint(endpoint)) throw new Error('请先在陪练设置中填写 API 密钥。');
  return { endpoint, model, apiKey };
}

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function readCoachSettings(storage: SettingsStorage): StoredCoachSettings {
  const fallback = { config: defaultCoachConfig(), rememberKey: true };
  const raw = storage.getItem(COACH_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return fallback;
    const record = data as Record<string, unknown>;
    if (typeof record.endpoint !== 'string' || typeof record.model !== 'string') return fallback;
    const rememberKey = record.rememberKey === true;
    const apiKey = rememberKey && typeof record.apiKey === 'string' ? record.apiKey : '';
    return { config: validateCoachConfig({ endpoint: record.endpoint, model: record.model, apiKey }), rememberKey };
  } catch { return fallback; }
}
export function writeCoachSettings(storage: SettingsStorage, config: CoachConfig, rememberKey: boolean): void {
  const checked = validateCoachConfig(config);
  // Remove the previous record first: switching to memory-only must not leave an old secret.
  storage.removeItem(COACH_STORAGE_KEY);
  storage.setItem(COACH_STORAGE_KEY, JSON.stringify({
    endpoint: checked.endpoint, model: checked.model, rememberKey,
    ...(rememberKey && checked.apiKey ? { apiKey: checked.apiKey } : {}),
  }));
}

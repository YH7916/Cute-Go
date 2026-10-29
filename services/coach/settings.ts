import { COACH_PROVIDERS, parseCoachModel, validateCoachApiKey } from '../../shared/coach';
import type { CoachConfig, StoredCoachSettings } from './types';

export { COACH_PROVIDERS };
export const COACH_STORAGE_KEY = 'cutego.coach.settings.v3';
export const defaultCoachConfig = (): CoachConfig => ({
  endpoint: import.meta.env?.VITE_COACH_ENDPOINT?.trim() ?? '',
  provider: COACH_PROVIDERS[0].id, model: COACH_PROVIDERS[0].defaultModel, apiKey: '',
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
export function validateCoachConfig(config: CoachConfig, requireReady = false): CoachConfig {
  const endpoint = config.endpoint.trim() ? normalizeCoachEndpoint(config.endpoint) : '';
  if (requireReady && !endpoint) throw new Error('请先在陪练设置中填写后台地址。');
  const { provider, model } = parseCoachModel(config);
  const apiKey = validateCoachApiKey(config.apiKey, requireReady);
  return { endpoint, provider, model, apiKey };
}

type SettingsStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
function removeLegacySettings(storage: SettingsStorage): void {
  storage.removeItem('cutego.coach.settings.v1');
  storage.removeItem('cutego.coach.settings.v2');
}
export function readCoachSettings(storage: SettingsStorage): StoredCoachSettings {
  // Previous direct-provider keys and backend tokens never migrate to the new trust boundary.
  removeLegacySettings(storage);
  const fallback = { config: defaultCoachConfig(), rememberKey: false };
  const raw = storage.getItem(COACH_STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object') return fallback;
    const record = data as Record<string, unknown>;
    if (typeof record.endpoint !== 'string') return fallback;
    const rememberKey = record.rememberKey === true;
    const apiKey = rememberKey && typeof record.apiKey === 'string' ? record.apiKey : '';
    return { config: validateCoachConfig({ endpoint: record.endpoint, ...parseCoachModel(record), apiKey }), rememberKey };
  } catch { return fallback; }
}
export function writeCoachSettings(storage: SettingsStorage, config: CoachConfig, rememberKey: boolean): void {
  const checked = validateCoachConfig(config);
  // Remove the previous record first: switching to memory-only must not leave an old secret.
  removeLegacySettings(storage);
  storage.removeItem(COACH_STORAGE_KEY);
  storage.setItem(COACH_STORAGE_KEY, JSON.stringify({
    endpoint: checked.endpoint, provider: checked.provider, model: checked.model, rememberKey,
    ...(rememberKey && checked.apiKey ? { apiKey: checked.apiKey } : {}),
  }));
}

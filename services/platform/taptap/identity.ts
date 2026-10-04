export interface TapIdentity {
  id: string | null;
  nickname: string | null;
  avatarUrl: string | null;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

function firstString(value: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const candidate = Object.hasOwn(value, key) ? value[key] : null;
    if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
  }
  return null;
}

// Only stable identity fields are accepted. tap.login().code must be exchanged
// by a server; it is never a profile key. Preserve the legacy string-ID shape.
export function parseTapIdentity(value: unknown, source: 'login' | 'userInfo' | 'accountInfo'): TapIdentity {
  const root = record(value);
  const user = record(Object.hasOwn(root, 'user') ? root.user : undefined);
  // Existing profiles use different ID priorities for login and profile APIs.
  // Changing that priority would silently select a new profile and reset ELO.
  const id = source === 'login'
    ? firstString(root, ['unionId', 'union_id', 'unionid', 'openid', 'openId', 'open_id', 'playerId', 'player_id']) ??
      firstString(user, ['unionId', 'openid', 'id'])
    : firstString(root, ['openid', 'unionid', 'playerId']);
  return {
    id: source === 'login' && typeof value === 'string' && value.trim() ? value : id,
    nickname: firstString(root, ['nickName', 'nickname']) ?? firstString(user, ['nickName', 'nickname']),
    avatarUrl: firstString(root, ['avatarUrl', 'avatar_url']) ?? firstString(user, ['avatarUrl', 'avatar_url']),
  };
}

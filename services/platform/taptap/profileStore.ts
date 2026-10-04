import type { UserAchievement } from '../../../types';
import type { AppProfile, AuthState } from '../types';

const PROFILE_STORE_KEY = 'cutego.taptap.profiles';
const ACTIVE_PROFILE_KEY = 'cutego.taptap.activeProfileId';
const ACHIEVEMENTS_PREFIX = 'cutego.taptap.achievements.';
const IDENTITY_KEYS = ['is_taptap_user', 'taptap_user_id', ACTIVE_PROFILE_KEY] as const;

type StoredProfile = AppProfile & { tapId?: string; updatedAt?: string };
type ReadResult = { ok: true; value: unknown } | { ok: false };

function getStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; }
  catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// JSON produces own data properties. Do not inherit fields or invoke accessors
// when a caller passes another object through this runtime boundary.
function own(value: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, 'value') ? descriptor.value : undefined;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readJson(key: string): ReadResult {
  const storage = getStorage();
  if (!storage) return { ok: false };
  let raw: string | null;
  try { raw = storage.getItem(key); }
  catch { return { ok: false }; }
  try { return { ok: true, value: raw ? JSON.parse(raw) : null }; }
  catch { return { ok: true, value: null }; }
}

function writeJson(key: string, value: unknown): boolean {
  try {
    const storage = getStorage();
    if (!storage) return false;
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

function parseProfile(value: unknown, expectedId?: string): AppProfile | null {
  if (!isRecord(value)) return null;
  const id = own(value, 'id');
  const nickname = own(value, 'nickname');
  const elo = own(value, 'elo');
  const avatar = own(value, 'avatarUrl');
  if (!nonempty(id) || (expectedId !== undefined && id !== expectedId)
    || !nonempty(nickname) || typeof elo !== 'number' || !Number.isFinite(elo)
    || (avatar !== undefined && avatar !== null && typeof avatar !== 'string')) return null;
  return { id, nickname, elo, avatarUrl: avatar ?? null };
}

function getStoredProfiles(): Record<string, StoredProfile> | null {
  const result = readJson(PROFILE_STORE_KEY);
  if (!result.ok) return null;
  const profiles: Record<string, StoredProfile> = Object.create(null);
  if (!isRecord(result.value)) return profiles;
  for (const key of Object.keys(result.value)) {
    const candidate = own(result.value, key);
    const profile = parseProfile(candidate, key);
    if (!profile || !isRecord(candidate)) continue;
    const tapId = own(candidate, 'tapId');
    const updatedAt = own(candidate, 'updatedAt');
    profiles[key] = {
      ...profile,
      ...(typeof tapId === 'string' ? { tapId } : {}),
      ...(typeof updatedAt === 'string' ? { updatedAt } : {}),
    };
  }
  return profiles;
}

export function getProfileById(userId: string): AppProfile | null {
  if (!nonempty(userId)) return null;
  const profiles = getStoredProfiles();
  return profiles && Object.hasOwn(profiles, userId) ? parseProfile(profiles[userId], userId) : null;
}

export function upsertProfile(input: {
  id: string; nickname: string; avatarUrl?: string | null; elo?: number;
}): AppProfile | null {
  if (!isRecord(input)) return null;
  const id = own(input, 'id');
  const nickname = own(input, 'nickname');
  const avatar = own(input, 'avatarUrl');
  const elo = own(input, 'elo');
  if (!nonempty(id) || typeof nickname !== 'string'
    || (avatar !== undefined && avatar !== null && typeof avatar !== 'string')
    || (elo !== undefined && (typeof elo !== 'number' || !Number.isFinite(elo)))) return null;
  const profiles = getStoredProfiles();
  // An unreadable store may contain other accounts: never replace it blindly.
  if (!profiles) return null;
  const existing = profiles[id];
  const next: StoredProfile = {
    id, tapId: id,
    nickname: nonempty(nickname) ? nickname : existing?.nickname || `玩家_${id.slice(0, 6)}`,
    avatarUrl: avatar ?? existing?.avatarUrl ?? null,
    elo: elo ?? existing?.elo ?? 1200,
    updatedAt: new Date().toISOString(),
  };
  profiles[id] = next;
  return writeJson(PROFILE_STORE_KEY, profiles) ? parseProfile(next) : null;
}

export function getActiveProfileId(): string | null {
  try {
    const id = getStorage()?.getItem(ACTIVE_PROFILE_KEY);
    return nonempty(id) ? id : null;
  } catch { return null; }
}

export function buildAuthStateFromProfile(profile: AppProfile | null): AuthState {
  const valid = parseProfile(profile);
  if (!valid) return { session: null, profile: null };
  return {
    session: { user: { id: valid.id, email: null }, provider: 'taptap', accessToken: 'taptap-local-session' },
    profile: valid,
  };
}

export function getCurrentAuthState(): AuthState {
  const id = getActiveProfileId();
  return buildAuthStateFromProfile(id ? getProfileById(id) : null);
}

export function persistTapTapIdentity(tapId: string): boolean {
  if (!nonempty(tapId)) return false;
  const storage = getStorage();
  if (!storage) return false;
  let previous: (string | null)[];
  try { previous = IDENTITY_KEYS.map(key => storage.getItem(key)); }
  catch { return false; }
  try {
    storage.setItem('is_taptap_user', 'true');
    storage.setItem('taptap_user_id', tapId);
    storage.setItem(ACTIVE_PROFILE_KEY, tapId);
    return true;
  } catch {
    // localStorage has no multi-key transaction. Rollback is best effort; a
    // persistent storage failure can prevent restoration, so still return false.
    IDENTITY_KEYS.forEach((key, index) => {
      try {
        const old = previous[index];
        if (old === null) storage.removeItem(key);
        else storage.setItem(key, old);
      } catch { /* Continue restoring independent keys after a storage failure. */ }
    });
    return false;
  }
}

export function clearTapTapIdentity(): boolean {
  const storage = getStorage();
  if (!storage) return false;
  let cleared = true;
  for (const key of IDENTITY_KEYS) {
    try { storage.removeItem(key); }
    catch { cleared = false; }
  }
  return cleared;
}

function parseAchievement(value: unknown): UserAchievement | null {
  if (!isRecord(value)) return null;
  const code = own(value, 'achievement_code');
  const progress = own(value, 'current_value');
  const unlocked = own(value, 'is_unlocked');
  const unlockedAt = own(value, 'unlocked_at');
  if (!nonempty(code) || typeof progress !== 'number' || !Number.isFinite(progress) || progress < 0
    || typeof unlocked !== 'boolean' || (unlockedAt !== null && typeof unlockedAt !== 'string')) return null;
  return { achievement_code: code, current_value: progress, is_unlocked: unlocked, unlocked_at: unlockedAt };
}

export function loadAchievements(userId: string): UserAchievement[] {
  if (!nonempty(userId)) return [];
  const result = readJson(`${ACHIEVEMENTS_PREFIX}${userId}`);
  if (!result.ok || !Array.isArray(result.value)) return [];
  return result.value.map(parseAchievement).filter((item): item is UserAchievement => item !== null);
}

export function saveAchievements(userId: string, achievements: UserAchievement[]): boolean {
  if (!nonempty(userId) || !Array.isArray(achievements)) return false;
  const valid = Array.from(achievements, parseAchievement);
  if (valid.some(item => item === null)) return false;
  const key = `${ACHIEVEMENTS_PREFIX}${userId}`;
  // A failed load returns an empty list for display; it must not authorize
  // replacing an unreadable achievement store with just the latest progress.
  if (!readJson(key).ok) return false;
  return writeJson(key, valid);
}

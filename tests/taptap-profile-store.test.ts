import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import {
  buildAuthStateFromProfile, clearTapTapIdentity, getActiveProfileId, getCurrentAuthState,
  getProfileById, loadAchievements, persistTapTapIdentity, saveAchievements, upsertProfile,
} from '../services/platform/taptap/profileStore';

const profilesKey = 'cutego.taptap.profiles';
const activeKey = 'cutego.taptap.activeProfileId';
const identityKeys = ['is_taptap_user', 'taptap_user_id', activeKey];
const achievementsKey = 'cutego.taptap.achievements.player';
const valid = { id: 'player', nickname: '棋友', elo: 1350, avatarUrl: '/avatar.png', tapId: 'player', updatedAt: '2026-10-01' };
const achievement = { achievement_code: 'first_win', current_value: 1, is_unlocked: true, unlocked_at: '2026-10-01' };

function fakeStorage(t: TestContext) {
  const values = new Map<string, string>();
  const storage = {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
    removeItem(key: string) { values.delete(key); },
  };
  // Read only the descriptor, never access the real browser/Node storage getter.
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  });
  return { values, storage };
}

test('legacy profile keys restore the existing profile and local session', t => {
  const { values } = fakeStorage(t);
  values.set(profilesKey, JSON.stringify({ player: valid }));
  values.set(activeKey, 'player');
  assert.deepEqual(getProfileById('player'), { id: 'player', nickname: '棋友', elo: 1350, avatarUrl: '/avatar.png' });
  assert.equal(getActiveProfileId(), 'player');
  assert.deepEqual(getCurrentAuthState(), {
    session: { user: { id: 'player', email: null }, provider: 'taptap', accessToken: 'taptap-local-session' },
    profile: getProfileById('player'),
  });
  assert.deepEqual(buildAuthStateFromProfile(null), { session: null, profile: null });
});

test('malformed JSON and wrong profile roots degrade to no profile', t => {
  const { values } = fakeStorage(t);
  values.set(activeKey, 'player');
  for (const raw of ['{', 'null', '[]', '1', '"text"', 'true']) {
    values.set(profilesKey, raw);
    assert.equal(getProfileById('player'), null, raw);
    assert.deepEqual(getCurrentAuthState(), { session: null, profile: null });
  }
});

test('invalid records are rejected without discarding valid neighbors', t => {
  const { values } = fakeStorage(t);
  const badProfiles: unknown[] = [null, [], 5, {},
    { ...valid, id: 'someone-else' }, { ...valid, id: 5 },
    { ...valid, nickname: 42 }, { ...valid, nickname: ' ' },
    { ...valid, elo: '1350' }, { ...valid, elo: null },
    { ...valid, avatarUrl: {} },
  ];
  for (const invalid of badProfiles) {
    values.set(profilesKey, JSON.stringify({ player: invalid, other: { ...valid, id: 'other' } }));
    assert.equal(getProfileById('player'), null);
    assert.equal(getProfileById('other')?.id, 'other');
  }
  values.set(profilesKey, '{"player":{"id":"player","nickname":"ok","elo":1e400}}');
  assert.equal(getProfileById('player'), null);
});

test('prototype names never resolve inherited profiles and own IDs safely round-trip', t => {
  const { values } = fakeStorage(t);
  values.set(profilesKey, '{}');
  for (const id of ['__proto__', 'toString', 'constructor']) {
    assert.equal(getProfileById(id), null);
    assert.deepEqual(upsertProfile({ id, nickname: `name-${id}` }), { id, nickname: `name-${id}`, elo: 1200, avatarUrl: null });
    assert.equal(getProfileById(id)?.nickname, `name-${id}`);
  }
  const stored: unknown = JSON.parse(values.get(profilesKey)!);
  assert.ok(typeof stored === 'object' && stored !== null && Object.hasOwn(stored, '__proto__'));
  assert.equal(Object.hasOwn(Object.prototype, 'nickname'), false);
});

test('upsert preserves unrelated valid records, metadata and fallback behavior', t => {
  const { values } = fakeStorage(t);
  values.set(profilesKey, JSON.stringify({ player: valid, other: { ...valid, id: 'other' } }));
  assert.deepEqual(upsertProfile({ id: 'player', nickname: '', avatarUrl: null }), {
    id: 'player', nickname: '棋友', elo: 1350, avatarUrl: '/avatar.png',
  });
  assert.equal(getProfileById('other')?.elo, 1350);
  assert.equal(upsertProfile({ id: 'new-user', nickname: '' })?.nickname, '玩家_new-us');
  assert.equal(upsertProfile({ id: 'player', nickname: '新昵称', elo: 1500 })?.elo, 1500);
  const stored = JSON.parse(values.get(profilesKey)!) as Record<string, { tapId: string; updatedAt: string }>;
  assert.equal(stored.player.tapId, 'player');
  assert.ok(Number.isFinite(Date.parse(stored.player.updatedAt)));
  assert.equal(stored.other.updatedAt, valid.updatedAt);
});

test('upsert validates own input fields and does not store invalid values', t => {
  const { values } = fakeStorage(t);
  const inherited: { id: string; nickname: string } = Object.create({ id: 'player', nickname: 'inherited' });
  assert.equal(upsertProfile(inherited), null);
  assert.equal(upsertProfile({ id: '', nickname: 'name' }), null);
  assert.equal(upsertProfile({ id: 'player', nickname: 'name', elo: NaN }), null);
  assert.equal(upsertProfile({ id: 'player', nickname: 'name', elo: Infinity }), null);
  const getterInput = { id: 'player', get nickname(): string { throw new Error('must not invoke accessor'); } };
  assert.equal(upsertProfile(getterInput), null);
  assert.equal(values.has(profilesKey), false);
});

test('achievement loading validates every row and save rejects bad input', t => {
  const { values } = fakeStorage(t);
  for (const raw of ['{', 'null', '{}', '1']) {
    values.set(achievementsKey, raw);
    assert.deepEqual(loadAchievements('player'), []);
  }
  values.set(achievementsKey, JSON.stringify([achievement, null, {},
    { ...achievement, current_value: '1' }, { ...achievement, is_unlocked: 1 },
    { ...achievement, unlocked_at: {} }, { ...achievement, achievement_code: '' },
  ]));
  assert.deepEqual(loadAchievements('player'), [achievement]);
  assert.equal(saveAchievements('player', [{ ...achievement, current_value: NaN }]), false);
  assert.equal(saveAchievements('player', [achievement]), true);
  assert.deepEqual(loadAchievements('player'), [achievement]);
});

test('storage read/write failures never throw or claim successful persistence', t => {
  const { values, storage } = fakeStorage(t);
  values.set(profilesKey, JSON.stringify({ player: valid }));
  t.mock.method(storage, 'getItem', () => { throw new Error('blocked'); });
  assert.equal(getProfileById('player'), null);
  assert.equal(getActiveProfileId(), null);
  assert.deepEqual(getCurrentAuthState(), { session: null, profile: null });
  assert.deepEqual(loadAchievements('player'), []);
  assert.equal(upsertProfile({ id: 'other', nickname: 'new' }), null, 'never overwrite an unreadable profile store');
  assert.equal(persistTapTapIdentity('player'), false);
  assert.equal(saveAchievements('player', [achievement]), false, 'do not overwrite an unreadable achievement store');
  assert.equal(values.get(profilesKey), JSON.stringify({ player: valid }));
  t.mock.restoreAll();
  t.mock.method(storage, 'setItem', () => { throw new Error('quota'); });
  assert.equal(upsertProfile({ id: 'other', nickname: 'new' }), null);
  assert.equal(saveAchievements('player', [achievement]), false);
});

test('sparse achievement input is rejected instead of persisting null rows', t => {
  const { values } = fakeStorage(t);
  const sparse = [achievement];
  sparse.length = 2;
  assert.equal(saveAchievements('player', sparse), false);
  assert.equal(values.has(achievementsKey), false);
});

test('an unavailable storage getter safely degrades all reads and writes', t => {
  fakeStorage(t);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('security'); } });
  assert.equal(getProfileById('player'), null);
  assert.equal(getActiveProfileId(), null);
  assert.deepEqual(getCurrentAuthState(), { session: null, profile: null });
  assert.equal(upsertProfile({ id: 'player', nickname: 'name' }), null);
  assert.equal(persistTapTapIdentity('player'), false);
  assert.equal(clearTapTapIdentity(), false);
  assert.deepEqual(loadAchievements('player'), []);
  assert.equal(saveAchievements('player', [achievement]), false);
});

test('identity commits active ID last and rolls back a failed update to prior identity', t => {
  const { values, storage } = fakeStorage(t);
  assert.equal(persistTapTapIdentity('old'), true);
  const before = new Map(values);
  const writes: string[] = [];
  t.mock.method(storage, 'setItem', (key: string, value: string) => {
    writes.push(key);
    if (key === activeKey && value === 'new') throw new Error('full');
    values.set(key, value);
  });
  assert.equal(persistTapTapIdentity('new'), false);
  assert.deepEqual(writes.slice(0, 3), identityKeys);
  assert.deepEqual(values, before);
});

test('logout removes all identity markers and reports partial removal failure', t => {
  const { values, storage } = fakeStorage(t);
  assert.equal(persistTapTapIdentity('player'), true);
  assert.equal(clearTapTapIdentity(), true);
  assert.ok(identityKeys.every(key => !values.has(key)));
  assert.equal(persistTapTapIdentity('player'), true);
  t.mock.method(storage, 'removeItem', (key: string) => {
    if (key === activeKey) throw new Error('blocked');
    values.delete(key);
  });
  assert.equal(clearTapTapIdentity(), false);
  assert.equal(values.get(activeKey), 'player');
  assert.equal(values.has('taptap_user_id'), false);
});

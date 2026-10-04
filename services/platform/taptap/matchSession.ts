import type { PlatformLiveMatchHandlers, PlatformLiveMatchSession } from '../types';
import type { TapBattleListeners, TapBattleMatchResult } from './battle';
import { getTapTapRoomMessagePayload, getTapTapRoomPlayerInfo } from './battlePayloads';

// SDK delivery must not turn a rejected callback into an unhandled rejection.
// Game-message validation remains in nativeMatchMessages.
function deliver(callback: (() => void | Promise<void>) | undefined) {
  if (!callback) return;
  try {
    void Promise.resolve(callback()).catch(() => console.warn('[Platform] TapTap event handler failed'));
  } catch {
    console.warn('[Platform] TapTap event handler failed');
  }
}

export function createMatchListeners(handlers: PlatformLiveMatchHandlers): TapBattleListeners {
  const playerEvent = (callback: PlatformLiveMatchHandlers['onPeerJoin'], info: unknown) => {
    const player = getTapTapRoomPlayerInfo(info);
    if (player) deliver(() => callback?.({ id: player.id }));
  };
  return {
    onCustomMessage: info => {
      const raw = getTapTapRoomMessagePayload(info);
      if (raw === null || raw === undefined) return;
      let payload: unknown = raw;
      if (typeof raw === 'string') {
        try { payload = JSON.parse(raw); }
        catch { console.warn('[Platform] Invalid TapTap room message JSON'); return; }
      }
      deliver(() => handlers.onMessage(payload));
    },
    playerEnterRoom: info => playerEvent(handlers.onPeerJoin, info),
    playerLeaveRoom: info => playerEvent(handlers.onPeerLeave, info),
    playerOffline: info => playerEvent(handlers.onPeerOffline, info),
    onDisconnected: () => deliver(handlers.onDisconnect),
    onBattleServiceError: info => deliver(() => handlers.onError?.(info)),
  };
}

export function buildLiveMatchSession(result: TapBattleMatchResult | null): PlatformLiveMatchSession | null {
  if (!result) return null;
  return {
    roomId: result.roomInfo.id,
    playerId: result.playerId,
    isHost: result.isHost,
    peers: result.roomInfo.players.filter(player => player.id !== result.playerId).map(player => ({ id: player.id })),
    send: result.send,
    leave: result.leave,
  };
}

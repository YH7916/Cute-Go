import { useCallback, useEffect, useRef, useState } from 'react';
import type { SetStateAction } from 'react';
import type { BoardSize, Player } from '../types';
import { platform } from '../services/platform';
import type { PlatformOpponentSummary } from '../services/platform';
import type { NativeMatchMessage } from '../services/platform/nativeMatchMessages';
import { OnlineSessionLifecycle } from './online/sessionLifecycle';
import { OnlineRoomMessages } from './online/roomMessages';
import { formatOnlineError } from './online/types';
import type { OnlineRequestKind, UseOnlineMatchOptions } from './online/types';

interface OnlineUiState {
  showOnlineMenu: boolean;
  isMatching: boolean;
  matchTime: number;
  matchBoardSize: BoardSize;
  onlineStatus: 'disconnected' | 'connecting' | 'connected';
  myColor: Player | null;
  opponentProfile: PlatformOpponentSummary | null;
  roomId: string | null;
  isCreatingRoom: boolean;
  isJoiningRoom: boolean;
}
const requestLabels = { match: 'TapTap 匹配', create: '创建房间', join: '加入房间' };

export const useOnlineMatch = (options: UseOnlineMatchOptions) => {
  const [state, setState] = useState<OnlineUiState>(() => ({
    showOnlineMenu: false, isMatching: false, matchTime: 0,
    matchBoardSize: [9, 13, 19].includes(options.settings.boardSize) ? options.settings.boardSize : 9,
    onlineStatus: 'disconnected', myColor: null, opponentProfile: null, roomId: null,
    isCreatingRoom: false, isJoiningRoom: false,
  }));
  // This ref is the synchronous snapshot of the single UI state owner. Native
  // events can arrive before React renders, so request guards must not use closures.
  const ui = useRef(state);
  const latest = useRef(options);
  latest.current = options;
  const lifecycle = useRef(new OnlineSessionLifecycle()).current;
  const messages = useRef<OnlineRoomMessages | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mounted = useRef(true);
  const account = useRef(options.session?.user.id);

  const update = useCallback((patch: Partial<OnlineUiState>) => {
    if (!mounted.current) return;
    ui.current = { ...ui.current, ...patch };
    setState(ui.current);
  }, []);
  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current);
    timer.current = null;
  }, []);
  const resetUi = useCallback(() => {
    stopTimer();
    messages.current = null;
    latest.current.myColorRef.current = null;
    update({ onlineStatus: 'disconnected', opponentProfile: null, myColor: null, roomId: null,
      isCreatingRoom: false, isJoiningRoom: false, isMatching: false, matchTime: 0 });
  }, [stopTimer, update]);
  const cleanupOnline = useCallback(async (_isManual = false) => {
    const cleanup = lifecycle.cancel();
    resetUi();
    await cleanup;
  }, [lifecycle, resetUi]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopTimer();
      messages.current = null;
      latest.current.myColorRef.current = null;
      void lifecycle.cancel();
    };
  }, [lifecycle, stopTimer]);
  useEffect(() => {
    if (account.current !== options.session?.user.id) void cleanupOnline(true);
    account.current = options.session?.user.id;
  }, [cleanupOnline, options.session?.user.id]);

  const connected = useCallback(() => {
    stopTimer();
    update({ onlineStatus: 'connected', isMatching: false, showOnlineMenu: false });
    latest.current.settings.setGameMode('PvP');
    latest.current.setShowMenu(false);
    latest.current.setShowStartScreen(false);
  }, [stopTimer, update]);
  const authenticated = useCallback(() => {
    if (latest.current.session && latest.current.userProfile) return true;
    latest.current.setShowLoginModal(true);
    return false;
  }, []);

  const openRoom = useCallback(async (kind: OnlineRequestKind, boardSize: BoardSize, roomId?: string) => {
    const config = { boardSize, gameType: latest.current.settings.gameType };
    const request = lifecycle.begin(kind, config);
    resetUi();
    update({ matchBoardSize: boardSize, isMatching: kind === 'match',
      isCreatingRoom: kind === 'create', isJoiningRoom: kind === 'join' });
    if (kind === 'match') timer.current = setInterval(() => update({ matchTime: ui.current.matchTime + 1 }), 1000);
    const protocol = new OnlineRoomMessages(request, {
      options: () => latest.current, isCurrent: () => lifecycle.isCurrent(request),
      color: myColor => update({ myColor }), opponent: opponentProfile => update({ opponentProfile }),
      connected,
      failed: () => { void cleanupOnline(); update({ showOnlineMenu: true }); },
    });
    messages.current = protocol;
    const disconnected = (message: string) => {
      void cleanupOnline();
      alert(message);
    };
    const peerDeparted = (message: string) => {
      if (!protocol.peerDeparted()) return;
      update({ onlineStatus: 'disconnected' });
      alert(message);
    };
    const handlers = lifecycle.handlers(request, {
      onMessage: payload => protocol.receive(payload), onPeerJoin: peer => protocol.peerJoined(peer),
      onPeerLeave: () => peerDeparted('对方已离开房间'),
      onPeerOffline: () => peerDeparted('对方已离线'),
      onDisconnect: () => disconnected('联机已断开'),
      onError: error => latest.current.setToastMsg(`TapTap 联机错误：${formatOnlineError(error)}`),
    });
    const playerProfile = { nickname: latest.current.userProfile?.nickname, gameType: config.gameType, boardSize };
    const roomType = `${config.gameType.toLowerCase()}_${boardSize}`;
    try {
      const room = await lifecycle.open(request, () => {
        const api = platform.multiplayer;
        if (kind === 'join') return api.joinNativeRoom?.({ roomId: roomId!, playerProfile, handlers }) ?? Promise.resolve(null);
        const input = { roomType, playerProfile, handlers };
        return (kind === 'create' ? api.createNativeRoom?.(input) : api.startNativeMatch?.(input)) ?? Promise.resolve(null);
      }, `${kind === 'match' ? 'TapTap 匹配' : `TapTap ${requestLabels[kind]}`}超时`);
      if (lifecycle.current !== request) return;
      if (!room) {
        void cleanupOnline();
        latest.current.setToastMsg(`${requestLabels[kind]}失败`);
        return;
      }
      update({ isCreatingRoom: false, isJoiningRoom: false,
        roomId: kind === 'match' ? null : room.roomId, onlineStatus: 'connecting' });
      if (room.peers[0]) update({ opponentProfile: room.peers[0] });
      if (kind === 'join' || (kind === 'match' && room.peers.length > 0 && !room.isHost)) connected();
      lifecycle.flush(request);
      if (room.isHost && room.peers.length > 0) await protocol.startHost();
    } catch (error) {
      if (lifecycle.current !== request) return;
      void cleanupOnline();
      latest.current.setToastMsg(`${requestLabels[kind]}失败：${formatOnlineError(error)}`);
    }
  }, [cleanupOnline, connected, lifecycle, resetUi, update]);

  const startMatchmaking = useCallback(async (sizeOverride?: BoardSize) => {
    if (!authenticated() || ui.current.onlineStatus === 'connected') return;
    const size = sizeOverride ?? ui.current.matchBoardSize;
    const current = lifecycle.current;
    if (current?.kind === 'match' && lifecycle.isCurrent(current) && current.config.boardSize === size) return;
    if (!platform.isNative || !platform.multiplayer.usesNativeMatchmaking || !platform.multiplayer.startNativeMatch) {
      latest.current.setToastMsg('联机仅支持 TapTap 小游戏环境');
      return;
    }
    await openRoom('match', size);
  }, [authenticated, lifecycle, openRoom]);
  const createRoom = useCallback(async () => {
    if (!authenticated()) return;
    if (!platform.isNative || !platform.multiplayer.createNativeRoom) {
      latest.current.setToastMsg('当前 TapTap 环境不支持创建房间');
      return;
    }
    await openRoom('create', latest.current.boardSizeRef.current);
  }, [authenticated, openRoom]);
  const joinRoom = useCallback(async (roomId: string) => {
    const trimmed = roomId.trim();
    if (!trimmed) { latest.current.setToastMsg('请输入房间号'); return; }
    if (!authenticated()) return;
    if (!platform.isNative || !platform.multiplayer.joinNativeRoom) {
      latest.current.setToastMsg('当前 TapTap 环境不支持加入房间');
      return;
    }
    await openRoom('join', ui.current.matchBoardSize, trimmed);
  }, [authenticated, openRoom]);
  const sendData = useCallback(async (message: NativeMatchMessage): Promise<boolean> => {
    if (!messages.current || !lifecycle.current?.room) {
      latest.current.setToastMsg('联机尚未建立，消息未发送');
      return false;
    }
    return messages.current.send(message);
  }, [lifecycle]);
  const setShowOnlineMenu = useCallback((value: SetStateAction<boolean>) => {
    update({ showOnlineMenu: typeof value === 'function' ? value(ui.current.showOnlineMenu) : value });
  }, [update]);
  const setMyColor = useCallback((value: SetStateAction<Player | null>) => {
    const myColor = typeof value === 'function' ? value(ui.current.myColor) : value;
    latest.current.myColorRef.current = myColor;
    update({ myColor });
  }, [update]);
  const cancelMatchmaking = useCallback(() => cleanupOnline(true), [cleanupOnline]);

  return { ...state, setShowOnlineMenu, setMyColor, sendData, cleanupOnline,
    startMatchmaking, createRoom, joinRoom, cancelMatchmaking };
};

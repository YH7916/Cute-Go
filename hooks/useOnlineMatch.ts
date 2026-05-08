import { useCallback, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import { BoardSize, GameMode, GameType, Player } from '../types';
import { platform } from '../services/platform';
import type { AppProfile, AppSession, PlatformLiveMatchSession, PlatformOpponentSummary } from '../services/platform';

type NativeMatchMessage =
  | { type: 'MOVE'; x: number; y: number }
  | { type: 'PASS' }
  | { type: 'SYNC'; boardSize: BoardSize; gameType: GameType; startColor: Player; opponentInfo?: PlatformOpponentSummary }
  | { type: 'SYNC_REPLY'; opponentInfo?: PlatformOpponentSummary }
  | { type: 'RESTART' };

const ONLINE_REQUEST_TIMEOUT_MS = 15000;

const withTimeout = async <T,>(promise: Promise<T>, message: string): Promise<T> => {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), ONLINE_REQUEST_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== null) window.clearTimeout(timer);
  }
};

interface OnlineSettings {
  boardSize: BoardSize;
  gameType: GameType;
  setBoardSize: (size: BoardSize) => void;
  setGameType: (gameType: GameType) => void;
  setGameMode: (gameMode: GameMode) => void;
}

interface UseOnlineMatchOptions {
  settings: OnlineSettings;
  session: AppSession | null;
  userProfile: AppProfile | null;
  boardSizeRef: MutableRefObject<BoardSize>;
  gameTypeRef: MutableRefObject<GameType>;
  resetGameRef: MutableRefObject<(keepOnline?: boolean, explicitSize?: number, shouldBroadcast?: boolean) => void>;
  executeMoveRef: MutableRefObject<(x: number, y: number, isRemote: boolean) => void>;
  handlePassRef: MutableRefObject<(isRemote?: boolean) => void>;
  setShowLoginModal: (show: boolean) => void;
  setShowMenu: (show: boolean) => void;
  setShowStartScreen: (show: boolean) => void;
  setToastMsg: (message: string | null) => void;
  vibrate: (pattern: number | number[]) => void;
}

export const useOnlineMatch = ({
  settings,
  session,
  userProfile,
  boardSizeRef,
  gameTypeRef,
  resetGameRef,
  executeMoveRef,
  handlePassRef,
  setShowLoginModal,
  setShowMenu,
  setShowStartScreen,
  setToastMsg,
  vibrate,
}: UseOnlineMatchOptions) => {
  const [showOnlineMenu, setShowOnlineMenu] = useState(false);
  const [isMatching, setIsMatching] = useState(false);
  const [matchTime, setMatchTime] = useState(0);
  const [matchBoardSize, setMatchBoardSize] = useState<BoardSize>(() => ([9, 13, 19].includes(settings.boardSize) ? settings.boardSize : 9));
  const [onlineStatus, setOnlineStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [myColor, setMyColor] = useState<Player | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<PlatformOpponentSummary | null>(null);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [isJoiningRoom, setIsJoiningRoom] = useState(false);

  const matchTimerRef = useRef<number | null>(null);
  const liveMatchRef = useRef<PlatformLiveMatchSession | null>(null);
  const isManualDisconnect = useRef(false);
  const matchmakingRequestIdRef = useRef(0);
  const activeRoomConfigRef = useRef<{ boardSize: BoardSize; gameType: GameType } | null>(null);

  const stopMatchTimer = useCallback(() => {
    if (matchTimerRef.current) {
      clearInterval(matchTimerRef.current);
      matchTimerRef.current = null;
    }
  }, []);

  const sendData = useCallback((msg: NativeMatchMessage) => {
    if (liveMatchRef.current) {
      void liveMatchRef.current.send(msg);
    }
  }, []);

  const cleanupOnline = useCallback((isManual = false) => {
    if (isManual) {
      isManualDisconnect.current = true;
    } else {
      isManualDisconnect.current = false;
    }
    if (liveMatchRef.current) {
      void liveMatchRef.current.leave();
      liveMatchRef.current = null;
    }
    setOnlineStatus('disconnected');
    setOpponentProfile(null);
    setMyColor(null);
    setRoomId(null);
    setIsCreatingRoom(false);
    setIsJoiningRoom(false);
    activeRoomConfigRef.current = null;
  }, []);

  const handleNativeRoomMessage = useCallback((msg: NativeMatchMessage) => {
    if (msg.type === 'MOVE') executeMoveRef.current(msg.x, msg.y, true);
    else if (msg.type === 'PASS') handlePassRef.current(true);
    else if (msg.type === 'SYNC') {
      settings.setBoardSize(msg.boardSize);
      boardSizeRef.current = msg.boardSize;
      settings.setGameType(msg.gameType);
      gameTypeRef.current = msg.gameType;
      setMyColor(msg.startColor);
      if (msg.opponentInfo) {
        setOpponentProfile(msg.opponentInfo);
        if (session) {
          void liveMatchRef.current?.send({
            type: 'SYNC_REPLY',
            opponentInfo: { id: session.user.id },
          });
        }
      }
      resetGameRef.current(true, msg.boardSize, false);
      vibrate(20);
    }
    else if (msg.type === 'SYNC_REPLY') {
      if (msg.opponentInfo) setOpponentProfile(msg.opponentInfo);
    }
    else if (msg.type === 'RESTART') {
      resetGameRef.current(true, undefined, false);
    }
  }, [boardSizeRef, executeMoveRef, gameTypeRef, handlePassRef, resetGameRef, session, settings, vibrate]);

  const startNativeHostGame = useCallback(async (boardSize = boardSizeRef.current, gameType = gameTypeRef.current) => {
    if (!liveMatchRef.current || !session) return;
    setOnlineStatus('connected');
    setIsMatching(false);
    stopMatchTimer();
    setShowOnlineMenu(false);
    setShowMenu(false);
    setShowStartScreen(false);
    settings.setBoardSize(boardSize);
    boardSizeRef.current = boardSize;
    settings.setGameType(gameType);
    gameTypeRef.current = gameType;
    settings.setGameMode('PvP');
    setMyColor('white');
    resetGameRef.current(true, boardSize, false);
    await liveMatchRef.current.send({
      type: 'SYNC',
      boardSize,
      gameType,
      startColor: 'black',
      opponentInfo: { id: session.user.id },
    });
  }, [boardSizeRef, gameTypeRef, resetGameRef, session, setShowMenu, setShowStartScreen, settings, stopMatchTimer]);

  const buildNativeRoomHandlers = useCallback(() => ({
    onMessage: (payload: unknown) => {
      handleNativeRoomMessage(payload as NativeMatchMessage);
    },
    onPeerJoin: (peer: PlatformOpponentSummary) => {
      if (peer.id === liveMatchRef.current?.playerId) {
        setToastMsg('检测到同一 TapTap 玩家进入房间，请换一个账号测试联机。');
        return;
      }
      setOpponentProfile(peer);
      if (liveMatchRef.current?.isHost) {
        const roomConfig = activeRoomConfigRef.current;
        void startNativeHostGame(roomConfig?.boardSize, roomConfig?.gameType);
      }
    },
    onPeerLeave: () => {
      setOnlineStatus('disconnected');
      if (!isManualDisconnect.current) alert("对方已离开房间");
    },
    onPeerOffline: () => {
      setOnlineStatus('disconnected');
      if (!isManualDisconnect.current) alert("对方已离线");
    },
    onDisconnect: () => {
      setOnlineStatus('disconnected');
      if (!isManualDisconnect.current) alert("联机已断开");
    },
  }), [handleNativeRoomMessage, startNativeHostGame]);

  const buildPlayerProfile = useCallback((sizeToUse: BoardSize) => ({
    nickname: userProfile?.nickname,
    gameType: settings.gameType,
    boardSize: sizeToUse,
  }), [settings.gameType, userProfile?.nickname]);

  const startNativeMatchmaking = useCallback(async (sizeToMatch: BoardSize) => {
    if (!session || !userProfile) {
      setShowLoginModal(true);
      return;
    }

    const requestId = matchmakingRequestIdRef.current + 1;
    matchmakingRequestIdRef.current = requestId;
    const gameTypeToMatch = settings.gameType;

    cleanupOnline();
    activeRoomConfigRef.current = { boardSize: sizeToMatch, gameType: gameTypeToMatch };
    setMatchBoardSize(sizeToMatch);
    setIsMatching(true);
    setMatchTime(0);

    matchTimerRef.current = window.setInterval(() => setMatchTime(prev => prev + 1), 1000);

    const roomType = `${gameTypeToMatch.toLowerCase()}_${sizeToMatch}`;
    let matchResult: PlatformLiveMatchSession | null = null;
    try {
      matchResult = platform.multiplayer.startNativeMatch
        ? await withTimeout(platform.multiplayer.startNativeMatch({
          roomType,
          playerProfile: buildPlayerProfile(sizeToMatch),
          handlers: buildNativeRoomHandlers(),
        }), 'TapTap 匹配超时')
        : null;
    } catch (error) {
      if (requestId !== matchmakingRequestIdRef.current) return;
      console.warn('[Online] matchmaking failed:', error);
      setIsMatching(false);
      stopMatchTimer();
      activeRoomConfigRef.current = null;
      setToastMsg('TapTap 匹配超时，请稍后重试');
      return;
    }

    if (requestId !== matchmakingRequestIdRef.current) {
      void matchResult?.leave();
      return;
    }

    if (!matchResult) {
      setIsMatching(false);
      stopMatchTimer();
      activeRoomConfigRef.current = null;
      setToastMsg('TapTap 匹配失败');
      return;
    }

    liveMatchRef.current = matchResult;

    if (matchResult.peers.length > 0) {
      setOpponentProfile(matchResult.peers[0]);
      setOnlineStatus('connected');
      setIsMatching(false);
      stopMatchTimer();
      setShowOnlineMenu(false);
      setShowMenu(false);
      setShowStartScreen(false);
      settings.setGameMode('PvP');

      if (matchResult.isHost) {
        await startNativeHostGame(sizeToMatch, gameTypeToMatch);
      }
    } else {
      setOnlineStatus('connecting');
    }
  }, [
    boardSizeRef,
    buildNativeRoomHandlers,
    buildPlayerProfile,
    cleanupOnline,
    session,
    setShowLoginModal,
    setShowMenu,
    setShowStartScreen,
    setToastMsg,
    settings,
    stopMatchTimer,
    userProfile,
  ]);

  const createRoom = useCallback(async () => {
    if (!session || !userProfile) {
      setShowLoginModal(true);
      return;
    }
    if (!platform.isNative || !platform.multiplayer.createNativeRoom) {
      setToastMsg('当前 TapTap 环境不支持创建房间');
      return;
    }

    const sizeToUse = boardSizeRef.current;
    setMatchBoardSize(sizeToUse);
    setIsCreatingRoom(true);
    cleanupOnline();
    activeRoomConfigRef.current = { boardSize: sizeToUse, gameType: settings.gameType };

    const roomType = `${settings.gameType.toLowerCase()}_${sizeToUse}`;
    let room: PlatformLiveMatchSession | null = null;
    try {
      room = await withTimeout(platform.multiplayer.createNativeRoom({
        roomType,
        playerProfile: buildPlayerProfile(sizeToUse),
        handlers: buildNativeRoomHandlers(),
      }), 'TapTap 创建房间超时');
    } catch (error) {
      console.warn('[Online] createRoom failed:', error);
      setIsCreatingRoom(false);
      activeRoomConfigRef.current = null;
      setToastMsg('创建房间失败，请稍后重试');
      return;
    }

    setIsCreatingRoom(false);

    if (!room) {
      activeRoomConfigRef.current = null;
      setToastMsg('创建房间失败');
      return;
    }

    liveMatchRef.current = room;
    setRoomId(room.roomId);
    setOnlineStatus('connecting');
  }, [
    boardSizeRef,
    buildNativeRoomHandlers,
    buildPlayerProfile,
    cleanupOnline,
    session,
    setShowLoginModal,
    setToastMsg,
    settings,
    userProfile,
  ]);

  const joinRoom = useCallback(async (roomIdToJoin: string) => {
    const trimmedRoomId = roomIdToJoin.trim();
    if (!trimmedRoomId) {
      setToastMsg('请输入房间号');
      return;
    }
    if (!session || !userProfile) {
      setShowLoginModal(true);
      return;
    }
    if (!platform.isNative || !platform.multiplayer.joinNativeRoom) {
      setToastMsg('当前 TapTap 环境不支持加入房间');
      return;
    }

    setIsJoiningRoom(true);
    cleanupOnline();

    let room: PlatformLiveMatchSession | null = null;
    try {
      room = await withTimeout(platform.multiplayer.joinNativeRoom({
        roomId: trimmedRoomId,
        playerProfile: buildPlayerProfile(matchBoardSize),
        handlers: buildNativeRoomHandlers(),
      }), 'TapTap 加入房间超时');
    } catch (error) {
      console.warn('[Online] joinRoom failed:', error);
      setIsJoiningRoom(false);
      setToastMsg('加入房间超时，请确认房间号正确且不要用同一账号测试');
      return;
    }

    setIsJoiningRoom(false);

    if (!room) {
      setToastMsg('加入房间失败');
      return;
    }

    liveMatchRef.current = room;
    setRoomId(room.roomId);
    setOnlineStatus('connected');
    setShowOnlineMenu(false);
    setShowMenu(false);
    setShowStartScreen(false);
    settings.setGameMode('PvP');
    if (room.peers.length > 0) setOpponentProfile(room.peers[0]);
  }, [
    buildNativeRoomHandlers,
    buildPlayerProfile,
    cleanupOnline,
    matchBoardSize,
    session,
    setShowLoginModal,
    setShowMenu,
    setShowStartScreen,
    setToastMsg,
    settings,
    userProfile,
  ]);

  const cancelMatchmaking = useCallback(async () => {
    matchmakingRequestIdRef.current += 1;
    stopMatchTimer();
    setIsMatching(false);
    setMatchTime(0);
    activeRoomConfigRef.current = null;
    cleanupOnline();
  }, [cleanupOnline, stopMatchTimer]);

  const startMatchmaking = useCallback(async (sizeOverride?: BoardSize) => {
    if (!session || !userProfile) {
      setShowLoginModal(true);
      return;
    }
    const sizeToMatch = sizeOverride ?? matchBoardSize;
    if (onlineStatus === 'connected') return;
    if (isMatching) {
      if (sizeToMatch === matchBoardSize) return;
      await cancelMatchmaking();
    }

    if (!platform.isNative || !platform.multiplayer.usesNativeMatchmaking || !platform.multiplayer.startNativeMatch) {
      setToastMsg('联机仅支持 TapTap 小游戏环境');
      return;
    }

    await startNativeMatchmaking(sizeToMatch);
  }, [cancelMatchmaking, isMatching, matchBoardSize, onlineStatus, session, setShowLoginModal, setToastMsg, startNativeMatchmaking, userProfile]);

  return {
    showOnlineMenu,
    setShowOnlineMenu,
    isMatching,
    matchTime,
    matchBoardSize,
    onlineStatus,
    roomId,
    isCreatingRoom,
    isJoiningRoom,
    myColor,
    setMyColor,
    opponentProfile,
    sendData,
    cleanupOnline,
    startMatchmaking,
    createRoom,
    joinRoom,
    cancelMatchmaking,
  };
};

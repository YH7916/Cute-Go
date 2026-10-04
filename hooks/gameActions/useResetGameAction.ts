import { useCallback, useRef } from 'react';
import { createInitialPosition } from '../../domains/game/positionState';
import type { UseGameActionsOptions } from './types';

export const useResetGameAction = ({
  aiTimerRef,
  aiTurnLock,
  boardSizeRef,
  cleanupOnline,
  clearInitialStones,
  gameState,
  onlineStatusRef,
  pendingEndGameRef,
  sendData,
  setEloDiffStyle,
  setEloDiffText,
  setIsThinking,
  setMyColor,
  setShowMenu,
  setShowPassModal,
  settings,
  webAiEngine,
}: UseGameActionsOptions) => {
  const onlineRestartPendingRef = useRef(false);

  return useCallback(
    async (keepOnline: boolean = false, explicitSize?: number, shouldBroadcast: boolean = true) => {
      if (keepOnline && shouldBroadcast && onlineStatusRef.current === 'connected') {
        if (onlineRestartPendingRef.current) return;
        onlineRestartPendingRef.current = true;
        const sent = await sendData({ type: 'RESTART' });
        onlineRestartPendingRef.current = false;
        if (!sent) return;
      }

      const sizeToUse = explicitSize !== undefined ? explicitSize : settings.boardSize;
      if (explicitSize !== undefined) {
        settings.setBoardSize(sizeToUse);
        boardSizeRef.current = sizeToUse;
      }

      if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
      pendingEndGameRef.current = null;
      gameState.writePosition(createInitialPosition(sizeToUse));
      gameState.setGameOver(false);
      gameState.setWinner(null);
      gameState.setWinReason('');
      gameState.setPassNotificationDismissed(false);
      gameState.setFinalScore(null);
      clearInitialStones();
      setShowMenu(false);
      setShowPassModal(false);
      setIsThinking(false);
      aiTurnLock.current = false;
      gameState.setAppMode('playing');
      setEloDiffText(null);
      setEloDiffStyle(null);

      webAiEngine.resetAI();

      if (!keepOnline) {
        cleanupOnline(true);
        setMyColor(null);
      }
    },
    [
      aiTimerRef,
      aiTurnLock,
      boardSizeRef,
      cleanupOnline,
      clearInitialStones,
      gameState,
      onlineStatusRef,
      pendingEndGameRef,
      sendData,
      setEloDiffStyle,
      setEloDiffText,
      setIsThinking,
      setMyColor,
      setShowMenu,
      setShowPassModal,
      settings,
      webAiEngine,
    ]
  );
};

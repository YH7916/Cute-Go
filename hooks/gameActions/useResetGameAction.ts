import { useCallback, useRef } from 'react';
import { createInitialPosition } from '../../domains/game/positionState';
import type { UseGameActionsOptions } from './types';

export const useResetGameAction = ({
  boardSizeRef,
  cleanupOnline,
  gameState,
  onlineStatusRef,
  sendData,
  setEloDiffStyle,
  setEloDiffText,
  setMyColor,
  setShowMenu,
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

      webAiEngine.resetAI();
      gameState.writePosition(createInitialPosition(sizeToUse));
      gameState.setGameOver(false);
      gameState.setWinner(null);
      gameState.setWinReason('');
      gameState.setPassNotificationDismissed(false);
      gameState.setFinalScore(null);
      setShowMenu(false);
      gameState.setAppMode('playing');
      setEloDiffText(null);
      setEloDiffStyle(null);

      if (!keepOnline) {
        cleanupOnline();
        setMyColor(null);
      }
    },
    [
      boardSizeRef,
      cleanupOnline,
      gameState,
      onlineStatusRef,
      sendData,
      setEloDiffStyle,
      setEloDiffText,
      setMyColor,
      setShowMenu,
      settings,
      webAiEngine,
    ]
  );
};

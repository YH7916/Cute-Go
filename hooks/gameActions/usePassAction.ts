import { useCallback, useRef } from 'react';
import { recordPass } from '../../domains/game/positionState';
import type { UseGameActionsOptions } from './types';

export const usePassAction = (
  {
    aiTurnLock,
    gameState,
    isWebThinking,
    myColorRef,
    onlineStatusRef,
    sendData,
    setIsThinking,
    settings,
    stopWebThinking,
    vibrate,
  }: UseGameActionsOptions,
  triggerGoScoring: () => void
) => {
  const onlinePassPendingRef = useRef(false);

  return useCallback(
    async (isRemote: boolean = false) => {
      console.log(
        `[App] handlePass Triggered. Remote: ${isRemote}, GameOver: ${gameState.gameOver}, Consecutive: ${gameState.readPosition().consecutivePasses}, Current: ${gameState.currentPlayerRef.current}`
      );

      if (gameState.gameOver) return;
      vibrate(10);

      const isUserForceScoreInPvAI =
        !isRemote &&
        settings.gameMode === 'PvAI' &&
        settings.gameType === 'Go' &&
        gameState.currentPlayerRef.current === settings.userColor;
      if (isUserForceScoreInPvAI) {
        triggerGoScoring();
        return;
      }

      if (onlineStatusRef.current === 'connected' && !isRemote) {
        if (
          gameState.currentPlayerRef.current !== myColorRef.current ||
          onlinePassPendingRef.current
        )
          return;
        onlinePassPendingRef.current = true;
        const sent = await sendData({ type: 'PASS' });
        onlinePassPendingRef.current = false;
        if (!sent) return;
      }

      if (isRemote) {
        console.log('[App] AI Passed. Unlocking...');
        aiTurnLock.current = false;
        setIsThinking(false);
      }

      const position = gameState.readPosition();
      const nextPosition = recordPass(position);
      gameState.writePosition(nextPosition);

      const isUserPassInPvAI =
        !isRemote &&
        settings.gameMode === 'PvAI' &&
        settings.gameType === 'Go' &&
        position.currentPlayer === settings.userColor;
      const isAIPassInPvAI =
        !isRemote &&
        settings.gameMode === 'PvAI' &&
        settings.gameType === 'Go' &&
        position.currentPlayer !== settings.userColor;

      if (isUserPassInPvAI || isAIPassInPvAI) {
        if (isWebThinking) stopWebThinking();
        setIsThinking(false);
        aiTurnLock.current = false;
      }

      const newPasses = nextPosition.consecutivePasses;
      console.log(`[App] Consecutive Passes: ${position.consecutivePasses} -> ${newPasses}`);
      gameState.setPassNotificationDismissed(false);

      if (newPasses >= 2) {
        console.log('[App] Game End via 2 passes.');
        triggerGoScoring();
      }
    },
    [
      aiTurnLock,
      gameState,
      isWebThinking,
      myColorRef,
      onlineStatusRef,
      sendData,
      setIsThinking,
      settings,
      stopWebThinking,
      triggerGoScoring,
      vibrate,
    ]
  );
};

import { useCallback, useRef } from 'react';
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
        `[App] handlePass Triggered. Remote: ${isRemote}, GameOver: ${gameState.gameOver}, Consecutive: ${gameState.consecutivePasses}, Current: ${gameState.currentPlayerRef.current}`
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

      const newItem = {
        board: gameState.boardRef.current,
        currentPlayer: gameState.currentPlayerRef.current,
        blackCaptures: gameState.blackCaptures,
        whiteCaptures: gameState.whiteCaptures,
        lastMove: gameState.lastMove,
        move: null,
        consecutivePasses: gameState.consecutivePasses,
      };
      const nextHistory = [...gameState.historyRef.current, newItem];
      gameState.historyRef.current = nextHistory;
      gameState.setHistory(nextHistory);

      const isUserPassInPvAI =
        !isRemote &&
        settings.gameMode === 'PvAI' &&
        settings.gameType === 'Go' &&
        gameState.currentPlayerRef.current === settings.userColor;
      const isAIPassInPvAI =
        !isRemote &&
        settings.gameMode === 'PvAI' &&
        settings.gameType === 'Go' &&
        gameState.currentPlayerRef.current !== settings.userColor;

      if (isUserPassInPvAI || isAIPassInPvAI) {
        if (isWebThinking) stopWebThinking();
        setIsThinking(false);
        aiTurnLock.current = false;
      }

      const newPasses = gameState.consecutivePasses + 1;
      console.log(`[App] Consecutive Passes: ${gameState.consecutivePasses} -> ${newPasses}`);
      gameState.setConsecutivePasses(newPasses);
      gameState.setPassNotificationDismissed(false);

      if (newPasses >= 2) {
        console.log('[App] Game End via 2 passes.');
        triggerGoScoring();
      } else {
        const current = gameState.currentPlayerRef.current;
        const next = current === 'black' ? 'white' : 'black';
        console.log(`[App] Switching Player: ${current} -> ${next}`);
        gameState.setCurrentPlayer(next);
        gameState.currentPlayerRef.current = next;
        gameState.setLastMove(null);
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

import { useCallback } from 'react';
import type { UseGameActionsOptions } from './types';

export const usePassAction = ({
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
}: UseGameActionsOptions, triggerGoScoring: () => void) => useCallback((isRemote: boolean = false) => {
  console.log(`[App] handlePass Triggered. Remote: ${isRemote}, GameOver: ${gameState.gameOver}, Consecutive: ${gameState.consecutivePasses}, Current: ${gameState.currentPlayerRef.current}`);

  if (gameState.gameOver) return;
  vibrate(10);

  const isUserForceScoreInPvAI = !isRemote && settings.gameMode === 'PvAI' && settings.gameType === 'Go' && gameState.currentPlayerRef.current === settings.userColor;
  if (isUserForceScoreInPvAI) {
    triggerGoScoring();
    return;
  }

  if (isRemote) {
    console.log("[App] AI Passed. Unlocking...");
    aiTurnLock.current = false;
    setIsThinking(false);
  }

  if (!isRemote) {
    const newItem = {
      board: gameState.boardRef.current,
      currentPlayer: gameState.currentPlayerRef.current,
      blackCaptures: gameState.blackCaptures,
      whiteCaptures: gameState.whiteCaptures,
      lastMove: null,
      consecutivePasses: gameState.consecutivePasses,
    };
    gameState.setHistory(prev => [...prev, newItem]);
    gameState.historyRef.current = [...gameState.historyRef.current, newItem];
  }

  if (onlineStatusRef.current === 'connected' && !isRemote) {
    if (gameState.currentPlayerRef.current !== myColorRef.current) return;
    sendData({ type: 'PASS' });
  }

  const isUserPassInPvAI = !isRemote && settings.gameMode === 'PvAI' && settings.gameType === 'Go' && gameState.currentPlayerRef.current === settings.userColor;
  const isAIPassInPvAI = !isRemote && settings.gameMode === 'PvAI' && settings.gameType === 'Go' && gameState.currentPlayerRef.current !== settings.userColor;

  if (isUserPassInPvAI || isAIPassInPvAI) {
    if (isWebThinking) stopWebThinking();
    setIsThinking(false);
    aiTurnLock.current = false;
  }

  gameState.setConsecutivePasses(prev => {
    const newPasses = prev + 1;
    console.log(`[App] Consecutive Passes: ${prev} -> ${newPasses}`);
    if (newPasses >= 2) {
      console.log("[App] Game End via 2 passes.");
      triggerGoScoring();
    }
    return newPasses;
  });
  gameState.setPassNotificationDismissed(false);

  if (gameState.consecutivePasses < 1) {
    const current = gameState.currentPlayerRef.current;
    const next = current === 'black' ? 'white' : 'black';
    console.log(`[App] Switching Player: ${current} -> ${next}`);
    gameState.setCurrentPlayer(next);
    gameState.currentPlayerRef.current = next;
    gameState.setLastMove(null);
  }
}, [
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
]);

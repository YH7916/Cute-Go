import { useCallback } from 'react';
import type { UseGameActionsOptions } from './types';

export const useUndoAction = ({
  aiTimerRef,
  aiTurnLock,
  gameState,
  isThinking,
  isWebThinking,
  onlineStatus,
  setIsThinking,
  settings,
  setTsumegoCurrentNode,
  stopWebThinking,
  tsumegoCurrentNode,
  vibrate,
}: UseGameActionsOptions) => useCallback(() => {
  if (gameState.history.length === 0 || isThinking || gameState.gameOver || onlineStatus === 'connected') return;
  vibrate(10);
  let stepsToUndo = 1;

  const isTsumego = settings.gameMode === 'Tsumego';

  if (settings.gameMode === 'PvAI' && settings.userColor === gameState.currentPlayer && gameState.history.length >= 2) stepsToUndo = 2;
  else if (settings.gameMode === 'PvAI' && settings.userColor !== gameState.currentPlayer && gameState.history.length >= 1) stepsToUndo = 1;
  else if (isTsumego && gameState.history.length >= 2 && gameState.currentPlayer === settings.userColor) stepsToUndo = 2;
  else if (isTsumego) stepsToUndo = 1;

  if (gameState.history.length < stepsToUndo) stepsToUndo = gameState.history.length;

  const prev = gameState.history[gameState.history.length - stepsToUndo];
  const newHistory = gameState.history.slice(0, gameState.history.length - stepsToUndo);
  gameState.boardRef.current = prev.board;
  gameState.currentPlayerRef.current = prev.currentPlayer;
  gameState.historyRef.current = newHistory;
  gameState.setBoard(prev.board);
  gameState.setCurrentPlayer(prev.currentPlayer);
  gameState.setBlackCaptures(prev.blackCaptures);
  gameState.setWhiteCaptures(prev.whiteCaptures);
  gameState.setLastMove(prev.lastMove);
  gameState.setConsecutivePasses(prev.consecutivePasses);
  gameState.setPassNotificationDismissed(false);

  if (isTsumego && tsumegoCurrentNode) {
    let node = tsumegoCurrentNode;
    for (let i = 0; i < stepsToUndo; i++) {
      if (node.parent) node = node.parent;
    }
    setTsumegoCurrentNode(node);
  }

  if (isWebThinking) stopWebThinking();
  aiTurnLock.current = false;
  setIsThinking(false);
  if (aiTimerRef.current) {
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null;
  }

  gameState.setHistory(newHistory);
}, [
  aiTimerRef,
  aiTurnLock,
  gameState,
  isThinking,
  isWebThinking,
  onlineStatus,
  setIsThinking,
  settings,
  setTsumegoCurrentNode,
  stopWebThinking,
  tsumegoCurrentNode,
  vibrate,
]);

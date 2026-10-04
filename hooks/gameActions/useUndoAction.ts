import { useCallback } from 'react';
import { undoPosition } from '../../domains/game/positionState';
import type { UseGameActionsOptions } from './types';

export const useUndoAction = ({
  aiTimerRef,
  aiTurnLock,
  gameState,
  isThinking,
  isWebThinking,
  onlineStatus,
  pendingEndGameRef,
  setIsThinking,
  settings,
  stopWebThinking,
  vibrate,
}: UseGameActionsOptions) => useCallback(() => {
  const position = gameState.readPosition();
  if (position.history.length === 0 || isThinking || gameState.gameOver || onlineStatus === 'connected') return;
  vibrate(10);
  let stepsToUndo = 1;

  if (settings.gameMode === 'PvAI' && settings.userColor === position.currentPlayer && position.history.length >= 2) stepsToUndo = 2;
  else if (settings.gameMode === 'PvAI' && settings.userColor !== position.currentPlayer && position.history.length >= 1) stepsToUndo = 1;

  if (position.history.length < stepsToUndo) stepsToUndo = position.history.length;
  gameState.writePosition(undoPosition(position, stepsToUndo));
  gameState.setPassNotificationDismissed(false);

  if (isWebThinking) stopWebThinking();
  pendingEndGameRef.current = null;
  aiTurnLock.current = false;
  setIsThinking(false);
  if (aiTimerRef.current) {
    clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null;
  }
}, [
  aiTimerRef,
  aiTurnLock,
  gameState,
  isThinking,
  isWebThinking,
  onlineStatus,
  pendingEndGameRef,
  setIsThinking,
  settings,
  stopWebThinking,
  vibrate,
]);

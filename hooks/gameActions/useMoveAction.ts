import { useCallback } from 'react';
import type { Player } from '../../types';
import { recordMove } from '../../domains/game/positionState';
import { attemptMove, checkGomokuWin } from '../../utils/goLogic';
import { getBoardHash } from './boardHash';
import type { UseGameActionsOptions } from './types';

export const useMoveAction = ({
  checkMoveAchievements,
  gameState,
  gameTypeRef,
  playSfx,
  session,
  settings,
  vibrate,
}: UseGameActionsOptions, endGame: (winnerColor: Player, reason: string) => void) => useCallback((x: number, y: number, isRemote: boolean) => {
  const position = gameState.readPosition();
  const currentBoard = position.board;
  const activePlayer = position.currentPlayer;
  const currentType = gameTypeRef.current;

  let prevHash = null;
  if (position.history.length >= 1) {
    prevHash = getBoardHash(position.history[position.history.length - 1].board);
  }

  const result = attemptMove(currentBoard, x, y, activePlayer, currentType, prevHash);

  if (result) {
    try {
      if (result.captured > 0) {
        playSfx('capture');
        vibrate([20, 30, 20]);
      } else {
        playSfx('move');
        vibrate(15);
      }
    } catch { }

    if (!isRemote && session?.user?.id && !settings.coachMode) {
      try {
        checkMoveAchievements({
          x,
          y,
          color: activePlayer,
          moveNumber: position.history.length + 1,
          boardSize: settings.boardSize,
        });
      } catch (achError) {
        console.warn("Achievement Error:", achError);
      }
    }

    const wins = currentType === 'Gomoku' && checkGomokuWin(result.newBoard, { x, y });
    const nextPosition = recordMove(position, result.newBoard, { x, y }, result.captured, wins);
    gameState.writePosition(nextPosition);
    gameState.setPassNotificationDismissed(false);

    if (wins) {
      setTimeout(() => {
        if (gameState.readPosition() === nextPosition) endGame(activePlayer, '五子连珠！');
      }, 0);
    }
    return true;
  } else if (!isRemote) {
    try {
      playSfx('error');
    } catch { }
  }
  return false;
}, [
  checkMoveAchievements,
  endGame,
  gameState,
  gameTypeRef,
  playSfx,
  session?.user?.id,
  settings.boardSize,
  settings.coachMode,
  vibrate,
]);

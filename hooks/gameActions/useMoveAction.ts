import { useCallback } from 'react';
import type { Player } from '../../types';
import type { HistoryItem } from '../../types';
import { attemptMove, checkGomokuWin } from '../../utils/goLogic';
import { getBoardHash } from './boardHash';
import type { UseGameActionsOptions } from './types';

export const useMoveAction = ({
  checkMoveAchievements,
  gameState,
  gameTypeRef,
  handleTsumegoMoveRef,
  playSfx,
  session,
  settings,
  tsumegoCurrentNode,
  vibrate,
}: UseGameActionsOptions, endGame: (winnerColor: Player, reason: string) => void) => useCallback((x: number, y: number, isRemote: boolean) => {
  const currentBoard = gameState.boardRef.current;
  const activePlayer = gameState.currentPlayerRef.current;
  const currentType = gameTypeRef.current;

  let prevHash = null;
  if (gameState.history.length >= 1) {
    prevHash = getBoardHash(gameState.history[gameState.history.length - 1].board);
  }

  if (settings.gameMode === 'Tsumego' && !isRemote && tsumegoCurrentNode) {
    const isValid = handleTsumegoMoveRef.current(x, y);
    if (!isValid) return;
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

    if (!isRemote && session?.user?.id) {
      try {
        checkMoveAchievements({
          x,
          y,
          color: activePlayer,
          moveNumber: gameState.history.length + 1,
          boardSize: settings.boardSize,
        });
      } catch (achError) {
        console.warn("Achievement Error:", achError);
      }
    }

    const newHistoryItem: HistoryItem = {
      board: currentBoard,
      currentPlayer: activePlayer,
      blackCaptures: gameState.blackCaptures,
      whiteCaptures: gameState.whiteCaptures,
      lastMove: { x, y },
      consecutivePasses: gameState.consecutivePasses,
    };

    if (!isRemote) {
      gameState.setHistory(prev => [...prev, newHistoryItem]);
    }

    gameState.boardRef.current = result.newBoard;
    gameState.historyRef.current = [...gameState.historyRef.current, newHistoryItem];

    gameState.setBoard(result.newBoard);
    gameState.setLastMove({ x, y });
    gameState.setConsecutivePasses(0);
    gameState.setPassNotificationDismissed(false);

    if (result.captured > 0) {
      if (activePlayer === 'black') gameState.setBlackCaptures(prev => prev + result.captured);
      else gameState.setWhiteCaptures(prev => prev + result.captured);
    }

    if (currentType === 'Gomoku' && checkGomokuWin(result.newBoard, { x, y })) {
      setTimeout(() => endGame(activePlayer, '五子连珠！'), 0);
      return;
    }

    const nextPlayer = activePlayer === 'black' ? 'white' : 'black';
    gameState.currentPlayerRef.current = nextPlayer;
    gameState.setCurrentPlayer(nextPlayer);
  } else if (!isRemote) {
    try {
      playSfx('error');
    } catch { }
  }
}, [
  checkMoveAchievements,
  endGame,
  gameState,
  gameTypeRef,
  handleTsumegoMoveRef,
  playSfx,
  session?.user?.id,
  settings.boardSize,
  settings.gameMode,
  tsumegoCurrentNode,
  vibrate,
]);

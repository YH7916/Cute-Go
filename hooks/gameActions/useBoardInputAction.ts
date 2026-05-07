import { useCallback } from 'react';
import type { UseGameActionsOptions } from './types';

export const useBoardInputAction = ({
  aiTurnLock,
  gameState,
  isThinking,
  myColor,
  onlineStatus,
  playSfx,
  sendData,
  settings,
  vibrate,
}: UseGameActionsOptions, executeMove: (x: number, y: number, isRemote: boolean) => void) => useCallback((x: number, y: number) => {
  console.log(`[Click] (${x}, ${y}) Mode: ${gameState.appMode}, Current: ${gameState.currentPlayer}, User: ${settings.userColor}, Lock: ${aiTurnLock.current}, Thinking: ${isThinking}`);

  if (gameState.appMode === 'review') return;
  if (gameState.appMode === 'setup') {
    const newBoard = gameState.board.map(row => row.map(stone => stone));
    if (gameState.setupTool === 'erase') {
      if (newBoard[y][x]) {
        newBoard[y][x] = null;
        playSfx('capture');
        vibrate(10);
      }
    }
    else {
      newBoard[y][x] = { color: gameState.setupTool, x, y, id: `setup-${gameState.setupTool}-${Date.now()}` };
      playSfx('move');
      vibrate(15);
    }
    gameState.setBoard(newBoard);
    return;
  }

  if (gameState.gameOver) {
    console.log("Click ignored: Game Over");
    return;
  }
  if (isThinking) {
    console.log("Click ignored: AI Thinking");
    return;
  }

  const aiColor = settings.userColor === 'black' ? 'white' : 'black';

  if (onlineStatus !== 'connected' && settings.gameMode === 'PvAI' && gameState.currentPlayer === aiColor) {
    console.log("Click ignored: AI Turn", gameState.currentPlayer, aiColor);
    return;
  }

  if (onlineStatus === 'connected') {
    if (gameState.currentPlayer !== myColor) return;
    sendData({ type: 'MOVE', x, y });
  }
  executeMove(x, y, false);
}, [
  aiTurnLock,
  executeMove,
  gameState,
  isThinking,
  myColor,
  onlineStatus,
  playSfx,
  sendData,
  settings,
  vibrate,
]);

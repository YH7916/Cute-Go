import { useCallback, useRef } from 'react';
import type { UseGameActionsOptions } from './types';

export const useBoardInputAction = (
  {
    aiTurnLock,
    gameState,
    isThinking,
    myColor,
    onlineStatus,
    playSfx,
    sendData,
    settings,
    vibrate,
  }: UseGameActionsOptions,
  executeMove: (x: number, y: number, isRemote: boolean) => void
) => {
  const onlineMovePendingRef = useRef(false);

  return useCallback(
    async (x: number, y: number) => {
      console.log(
        `[Click] (${x}, ${y}) Mode: ${gameState.appMode}, Current: ${gameState.currentPlayer}, User: ${settings.userColor}, Lock: ${aiTurnLock.current}, Thinking: ${isThinking}`
      );

      const boardRow = gameState.board[y];
      if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        x < 0 ||
        y < 0 ||
        !boardRow ||
        x >= boardRow.length
      )
        return;

      if (gameState.appMode === 'review') return;
      if (gameState.appMode === 'setup') {
        const newBoard = gameState.board.map((row) => row.map((stone) => stone));
        if (gameState.setupTool === 'erase') {
          if (newBoard[y][x]) {
            newBoard[y][x] = null;
            playSfx('capture');
            vibrate(10);
          }
        } else {
          newBoard[y][x] = {
            color: gameState.setupTool,
            x,
            y,
            id: `setup-${gameState.setupTool}-${Date.now()}`,
          };
          playSfx('move');
          vibrate(15);
        }
        gameState.setBoard(newBoard);
        return;
      }

      if (gameState.gameOver) {
        console.log('Click ignored: Game Over');
        return;
      }
      if (isThinking) {
        console.log('Click ignored: AI Thinking');
        return;
      }

      const aiColor = settings.userColor === 'black' ? 'white' : 'black';

      const activePlayer = gameState.currentPlayerRef.current;
      if (
        onlineStatus !== 'connected' &&
        settings.gameMode === 'PvAI' &&
        activePlayer === aiColor
      ) {
        console.log('Click ignored: AI Turn', activePlayer, aiColor);
        return;
      }

      if (onlineStatus === 'connected') {
        if (activePlayer !== myColor || onlineMovePendingRef.current) return;
        onlineMovePendingRef.current = true;
        const sent = await sendData({ type: 'MOVE', x, y });
        onlineMovePendingRef.current = false;
        if (!sent) return;
      }
      executeMove(x, y, false);
    },
    [
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
    ]
  );
};

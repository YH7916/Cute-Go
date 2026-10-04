import { useCallback, useRef } from 'react';
import type { UseGameActionsOptions } from './types';

export const useBoardInputAction = (
  {
    aiTurnLock,
    gameState,
    gameTypeRef,
    isThinking,
    myColor,
    onlineStatus,
    onIllegalMove,
    playSfx,
    sendData,
    settings,
    vibrate,
  }: UseGameActionsOptions,
  executeMove: (x: number, y: number, isRemote: boolean) => boolean | void
) => {
  const onlineMovePendingRef = useRef(false);

  return useCallback(
    async (x: number, y: number) => {
      console.log(
        `[Click] (${x}, ${y}) Mode: ${gameState.appMode}, Current: ${gameState.currentPlayer}, User: ${settings.userColor}, Lock: ${aiTurnLock.current}, Thinking: ${isThinking}`
      );

      const position = gameState.readPosition();
      const boardRow = position.board[y];
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
        const newBoard = position.board.map((row) => [...row]);
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
        gameState.writePosition({ ...position, board: newBoard });
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

      const activePlayer = position.currentPlayer;
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
        try {
          const sent = await sendData({ type: 'MOVE', x, y });
          if (!sent || gameState.readPosition() !== position) return;
        } finally {
          onlineMovePendingRef.current = false;
        }
      }
      const accepted = executeMove(x, y, false);
      // Only a rejected player gesture may trigger rule teaching. AI and
      // remote replies also call executeMove directly and must remain silent.
      if (accepted === false && settings.coachMode && settings.gameMode === 'PvAI'
        && gameTypeRef.current === 'Go' && gameState.appMode === 'playing'
        && onlineStatus === 'disconnected' && activePlayer === settings.userColor
        && gameState.readPosition() === position) {
        onIllegalMove?.({ x, y }, position);
      }
    },
    [
      aiTurnLock,
      executeMove,
      gameState,
      gameTypeRef,
      isThinking,
      myColor,
      onlineStatus,
      onIllegalMove,
      playSfx,
      sendData,
      settings,
      vibrate,
    ]
  );
};

import { useCallback, useRef } from 'react';
import { createBoard } from '../../utils/goLogic';
import type { UseGameActionsOptions } from './types';

export const useResetGameAction = ({
  aiTurnLock,
  boardSizeRef,
  cleanupOnline,
  clearInitialStones,
  gameState,
  onlineStatusRef,
  sendData,
  setEloDiffStyle,
  setEloDiffText,
  setIsThinking,
  setMyColor,
  setShowMenu,
  setShowPassModal,
  settings,
  setShowTsumegoResult,
  setTsumegoCurrentNode,
  setTsumegoInstruction,
  setTsumegoRoot,
  webAiEngine,
}: UseGameActionsOptions) => {
  const onlineRestartPendingRef = useRef(false);

  return useCallback(
    async (keepOnline: boolean = false, explicitSize?: number, shouldBroadcast: boolean = true) => {
      if (keepOnline && shouldBroadcast && onlineStatusRef.current === 'connected') {
        if (onlineRestartPendingRef.current) return;
        onlineRestartPendingRef.current = true;
        const sent = await sendData({ type: 'RESTART' });
        onlineRestartPendingRef.current = false;
        if (!sent) return;
      }

      const sizeToUse = explicitSize !== undefined ? explicitSize : settings.boardSize;
      if (explicitSize !== undefined) {
        settings.setBoardSize(sizeToUse);
        boardSizeRef.current = sizeToUse;
      }

      const nextBoard = createBoard(sizeToUse);
      gameState.boardRef.current = nextBoard;
      gameState.currentPlayerRef.current = 'black';
      gameState.setBoard(nextBoard);
      gameState.setCurrentPlayer('black');
      gameState.setBlackCaptures(0);
      gameState.setWhiteCaptures(0);
      gameState.setLastMove(null);
      gameState.setGameOver(false);
      gameState.setWinner(null);
      gameState.setWinReason('');
      gameState.setConsecutivePasses(0);
      gameState.setPassNotificationDismissed(false);
      gameState.setFinalScore(null);
      gameState.setHistory([]);
      gameState.historyRef.current = [];
      clearInitialStones();
      setShowMenu(false);
      setShowPassModal(false);
      setIsThinking(false);
      aiTurnLock.current = false;
      gameState.setAppMode('playing');
      setEloDiffText(null);
      setEloDiffStyle(null);
      setTsumegoRoot(null);
      setTsumegoCurrentNode(null);
      setShowTsumegoResult(false);
      setTsumegoInstruction(null);

      webAiEngine.resetAI();

      if (!keepOnline) {
        cleanupOnline(true);
        setMyColor(null);
      }
    },
    [
      aiTurnLock,
      boardSizeRef,
      cleanupOnline,
      clearInitialStones,
      gameState,
      onlineStatusRef,
      sendData,
      setEloDiffStyle,
      setEloDiffText,
      setIsThinking,
      setMyColor,
      setShowMenu,
      setShowPassModal,
      setShowTsumegoResult,
      setTsumegoCurrentNode,
      setTsumegoInstruction,
      setTsumegoRoot,
      settings,
      webAiEngine,
    ]
  );
};

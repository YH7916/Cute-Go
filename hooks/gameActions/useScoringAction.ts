import { useCallback } from 'react';
import type { Player } from '../../types';
import { calculateScore, cleanBoardWithTerritory } from '../../utils/goLogic';
import type { UseGameActionsOptions } from './types';

export const useScoringAction = ({
  aiTurnLock,
  displayTerritory,
  gameState,
  isWebThinking,
  isWorkerReady,
  pendingEndGameRef,
  requestAnalysis,
  setIsThinking,
  setShowPassModal,
  settings,
  stopWebThinking,
}: UseGameActionsOptions, endGame: (winnerColor: Player, reason: string) => void) => useCallback(() => {
  if (settings.gameType !== 'Go' || gameState.gameOver) return;

  if (isWebThinking) stopWebThinking();
  setIsThinking(false);
  aiTurnLock.current = false;
  setShowPassModal(false);

  if (settings.gameMode === 'PvAI' && isWorkerReady) {
    console.log('[App] Requesting KataGo endgame analysis...');
    pendingEndGameRef.current = true;
    requestAnalysis(
      gameState.boardRef.current,
      gameState.currentPlayerRef.current,
      gameState.historyRef.current,
      settings.boardSize === 9 ? 6.5 : 7.5,
      'Go'
    );
    return;
  }

  setTimeout(() => {
    const komi = settings.boardSize === 9 ? 6.5 : 7.5;
    const boardForScoring = displayTerritory
      ? cleanBoardWithTerritory(gameState.boardRef.current, displayTerritory)
      : gameState.boardRef.current;
    const score = calculateScore(boardForScoring, undefined, komi);
    const lead = score.black - score.white;
    gameState.setFinalScore(score);
    setShowPassModal(false);
    if (lead > 0) endGame('black', `计算机计分：黑领先 ${lead.toFixed(1)} 目`);
    else endGame('white', `计算机计分：白领先 ${Math.abs(lead).toFixed(1)} 目`);
  }, 0);
}, [
  aiTurnLock,
  displayTerritory,
  endGame,
  gameState,
  isWebThinking,
  isWorkerReady,
  pendingEndGameRef,
  requestAnalysis,
  setIsThinking,
  setShowPassModal,
  settings,
  stopWebThinking,
]);

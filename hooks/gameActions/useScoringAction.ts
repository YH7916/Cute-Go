import { getDefaultKomi } from '../../core/go/config';
import { useCallback } from 'react';
import type { Player } from '../../types';
import { evaluateScoring, type ScoringRequest } from '../../domains/game/scoringResult';
import type { UseGameActionsOptions } from './types';

export const useScoringAction = ({
  aiTimerRef,
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
}: UseGameActionsOptions, endGame: (
  winnerColor: Player, reason: string, settledScore?: { black: number; white: number },
) => void) => useCallback(() => {
  if (settings.gameType !== 'Go' || gameState.gameOver) return;

  if (isWebThinking) stopWebThinking();
  if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
  aiTimerRef.current = null;
  pendingEndGameRef.current = null;
  setIsThinking(false);
  aiTurnLock.current = false;
  setShowPassModal(false);

  const position = gameState.readPosition();
  const request: ScoringRequest = {
    board: position.board,
    history: position.history,
    player: position.currentPlayer,
    komi: getDefaultKomi(settings.boardSize),
    captures: { black: position.blackCaptures, white: position.whiteCaptures },
  };

  if (settings.gameMode === 'PvAI' && isWorkerReady) {
    console.log('[App] Requesting KataGo endgame analysis...');
    pendingEndGameRef.current = request;
    aiTurnLock.current = true;
    const started = requestAnalysis(
      request.board,
      request.player,
      request.history,
      request.komi,
      'Go'
    );
    if (started) return;
    pendingEndGameRef.current = null;
    aiTurnLock.current = false;
  }

  const { score, lead } = evaluateScoring(request, displayTerritory);
  gameState.setFinalScore(score);
  setShowPassModal(false);
  if (lead > 0) endGame('black', `计算机计分：黑领先 ${lead.toFixed(1)} 目`, score);
  else endGame('white', `计算机计分：白领先 ${Math.abs(lead).toFixed(1)} 目`, score);
}, [
  aiTimerRef,
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

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CoachEngineEvidence } from '../agent/coach/contract';
import { getDefaultKomi } from '../core/go/config';
import { coachPositionKey } from '../domains/coach/evidence';
import type { GamePosition } from '../domains/game/positionState';
import { deferAiMove } from '../domains/game/deferredAiMove';
import { evaluateScoring, takeScoringRequest, type ScoringRequest } from '../domains/game/scoringResult';
import { isSamePosition, type PositionSnapshot } from '../domains/game/positionSnapshot';
import type { Player } from '../types';
import type { useGameState } from './useGameState';
import { useWebKataGo } from './useWebKataGo';

interface Options {
  boardSize: number;
  gameState: ReturnType<typeof useGameState>;
  executeMoveRef: { current: (x: number, y: number, isRemote: boolean) => void };
  handlePassRef: { current: (isRemote?: boolean) => void };
  endGameRef: { current: (winner: Player, reason: string, score?: { black: number; white: number }) => void };
  setToastMsg: (message: string | null) => void;
  setShowPassModal: (show: boolean) => void;
}
interface PendingCoachAnalysis {
  position: GamePosition;
  finish(evidence?: CoachEngineEvidence, aborted?: boolean): void;
}

// Owns applying AI responses to a still-current game, distinct from Worker I/O
// and useGameFlow's policy for when the next AI turn should be requested.
export function useGameAiSession(options: Options) {
  const { boardSize, gameState, executeMoveRef, handlePassRef, endGameRef, setToastMsg, setShowPassModal } = options;
  const [isThinking, setIsThinking] = useState(false);
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTurnLock = useRef(false);
  const pendingEndGameRef = useRef<ScoringRequest | null>(null);
  const playRequest = useRef<PositionSnapshot | null>(null);
  const pendingCoach = useRef<PendingCoachAnalysis | null>(null);
  const latestGameState = useRef(gameState);
  latestGameState.current = gameState;
  const readSnapshot = () => {
    const { board, history, currentPlayer: player } = gameState.readPosition();
    return { board, history, player };
  };
  const acceptPlayResponse = () => {
    const request = playRequest.current;
    playRequest.current = null;
    const current = latestGameState.current;
    if (request && current.appMode === 'playing' && !current.gameOver && isSamePosition(request, readSnapshot())) return true;
    aiTurnLock.current = false;
    setIsThinking(false);
    return false;
  };
  const webAiEngine = useWebKataGo({
    boardSize,
    onAiMove: (x, y) => {
      if (!acceptPlayResponse()) return;
      deferAiMove({
        timer: aiTimerRef, readPosition: readSnapshot,
        allowed: () => aiTurnLock.current && latestGameState.current.appMode === 'playing' && !latestGameState.current.gameOver,
        apply: () => executeMoveRef.current(x, y, false),
      });
    },
    onAiPass: () => { if (acceptPlayResponse()) handlePassRef.current(false); },
    onAiError: message => {
      if (pendingCoach.current) {
        pendingCoach.current.finish();
        // Optional analysis must not leave lifecycle.failed blocking the rules
        // opponent after a model download or initialization failure.
        webAiEngine.terminateAI();
        return;
      }
      aiTurnLock.current = false;
      pendingEndGameRef.current = null;
      playRequest.current = null;
      setIsThinking(false);
      setToastMsg(`AI 出错: ${message}`);
    },
    onAnalysisComplete: data => {
      if (data.purpose === 'coach') {
        const request = pendingCoach.current;
        if (!request) return;
        const position = request.position;
        request.finish(gameState.readPosition() === position && !gameState.gameOver && data.visits
          ? { positionKey: coachPositionKey(position, position.currentPlayer, getDefaultKomi(position.board.length)),
            source: 'local-katago', perspective: 'black', visits: data.visits, winRateBlack: data.winRate,
            estimatedBlackLead: data.estimatedBlackLead, candidates: data.candidates ?? [] } : undefined);
        return;
      }
      const request = takeScoringRequest(pendingEndGameRef, readSnapshot());
      if (!request || gameState.gameOver) return;
      // Dead-stone removal belongs to settlement, never to the recorded game.
      const { score, lead } = evaluateScoring(request, data.ownership);
      gameState.setFinalScore(score);
      setShowPassModal(false);
      endGameRef.current(lead > 0 ? 'black' : 'white', `AI判定：${lead > 0 ? '黑' : '白'}领先 ${Math.abs(lead).toFixed(1)} 目`, score);
    },
  });
  const rawStopThinking = webAiEngine.stopThinking;
  const cancelCoachAnalysis = useCallback(() => {
    if (!pendingCoach.current) return;
    pendingCoach.current.finish();
    rawStopThinking();
  }, [rawStopThinking]);
  const requestMove = webAiEngine.requestWebAiMove;
  const requestWebAiMove = useCallback<typeof requestMove>((...args) => {
    cancelCoachAnalysis();
    const accepted = requestMove(...args);
    if (accepted) playRequest.current = { board: args[0], player: args[1], history: args[2] };
    return accepted;
  }, [requestMove, cancelCoachAnalysis]);
  const rawRequestAnalysis = webAiEngine.requestAnalysis;
  const requestAnalysis = useCallback<typeof rawRequestAnalysis>((...args) => {
    cancelCoachAnalysis();
    return rawRequestAnalysis(...args);
  }, [rawRequestAnalysis, cancelCoachAnalysis]);
  const requestCoachAnalysis = useCallback((position: GamePosition, signal?: AbortSignal): Promise<CoachEngineEvidence | undefined> => {
    if (signal?.aborted) return Promise.reject(new DOMException('分析已取消', 'AbortError'));
    const current = latestGameState.current;
    if (current.readPosition() !== position || current.gameOver || current.appMode !== 'playing'
      || pendingEndGameRef.current || playRequest.current || aiTurnLock.current) return Promise.resolve(undefined);
    cancelCoachAnalysis();
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const request: PendingCoachAnalysis = { position, finish(evidence, aborted = false) {
        if (pendingCoach.current !== request) return;
        pendingCoach.current = null;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        if (aborted) reject(new DOMException('分析已取消', 'AbortError'));
        else resolve(evidence);
      } };
      const cancel = () => {
        if (pendingCoach.current !== request) return;
        request.finish(undefined, true);
        rawStopThinking();
      };
      pendingCoach.current = request;
      signal?.addEventListener('abort', cancel, { once: true });
      timer = setTimeout(() => {
        if (pendingCoach.current === request) cancelCoachAnalysis();
      }, 20000);
      const accepted = rawRequestAnalysis(position.board, position.currentPlayer, position.history,
        getDefaultKomi(position.board.length), 'Go', 8, 'coach');
      if (!accepted) request.finish();
    });
  }, [rawRequestAnalysis, rawStopThinking, cancelCoachAnalysis]);
  const stopThinking = useCallback(() => {
    pendingCoach.current?.finish();
    rawStopThinking();
  }, [rawStopThinking]);
  const rawResetAI = webAiEngine.resetAI;
  const resetAI = useCallback(() => { pendingCoach.current?.finish(); rawResetAI(); }, [rawResetAI]);
  const rawTerminateAI = webAiEngine.terminateAI;
  const terminateAI = useCallback(() => { pendingCoach.current?.finish(); rawTerminateAI(); }, [rawTerminateAI]);
  useEffect(() => () => pendingCoach.current?.finish(), []);
  const currentPosition = gameState.readPosition();
  useEffect(() => {
    if (pendingCoach.current && (pendingCoach.current.position !== currentPosition || gameState.gameOver || gameState.appMode !== 'playing')) {
      cancelCoachAnalysis();
    }
  }, [currentPosition, gameState.gameOver, gameState.appMode, cancelCoachAnalysis]);
  const cancelAiSession = useCallback(() => {
    // Clear application ownership before invalidating the Worker generation.
    playRequest.current = null;
    pendingEndGameRef.current = null;
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null;
    aiTurnLock.current = false;
    setIsThinking(false);
    stopThinking();
  }, [stopThinking]);
  // The shared Worker is busy for two different owners. Optional teaching work
  // must not activate the game's loading overlay or disable its move controls.
  const optionalAnalysis = pendingCoach.current !== null;
  return { webAiEngine: { ...webAiEngine,
    isLoading: !optionalAnalysis && webAiEngine.isLoading,
    isInitializing: !optionalAnalysis && webAiEngine.isInitializing,
    isThinking: !optionalAnalysis && webAiEngine.isThinking,
    initStatus: optionalAnalysis ? '' : webAiEngine.initStatus,
    requestWebAiMove, requestAnalysis, stopThinking, resetAI, terminateAI }, isThinking, setIsThinking,
    aiTimerRef, aiTurnLock, pendingEndGameRef, cancelAiSession, requestCoachAnalysis };
}

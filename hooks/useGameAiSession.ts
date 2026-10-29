import { useCallback, useEffect, useRef } from 'react';
import type { CoachEngineEvidence } from '../agent/coach/contract';
import { getDefaultKomi } from '../core/go/config';
import { getBoardHash } from '../core/board';
import { attemptMove } from '../core/go/rules';
import { coachPositionKey } from '../domains/coach/evidence';
import type { GamePosition } from '../domains/game/positionState';
import { deferAiMove } from '../domains/game/deferredAiMove';
import { evaluateScoring, takeScoringRequest, type ScoringRequest } from '../domains/game/scoringResult';
import { isSamePosition, type PositionSnapshot } from '../domains/game/positionSnapshot';
import type { Player, Point } from '../types';
import type { useGameState } from './useGameState';
import { useWebKataGo } from './useWebKataGo';

interface Options {
  boardSize: number;
  gameState: ReturnType<typeof useGameState>;
  executeMoveRef: { current: (x: number, y: number, isRemote: boolean) => void };
  handlePassRef: { current: (isRemote?: boolean) => void };
  endGameRef: { current: (winner: Player, reason: string, score?: { black: number; white: number }) => void };
  setToastMsg: (message: string | null) => void;
}
interface PendingCoachAnalysis {
  position: GamePosition;
  finish(evidence?: CoachEngineEvidence, aborted?: boolean): void;
}

// Owns applying AI responses to a still-current game, distinct from Worker I/O
// and useGameFlow's policy for when the next AI turn should be requested.
export function useGameAiSession(options: Options) {
  const { boardSize, gameState, executeMoveRef, handlePassRef, endGameRef, setToastMsg } = options;
  const aiTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aiTurnLock = useRef(false);
  const pendingEndGameRef = useRef<ScoringRequest | null>(null);
  const playRequest = useRef<PositionSnapshot | null>(null);
  const pendingCoach = useRef<PendingCoachAnalysis | null>(null);
  // One mounted model owner, at most eight completed semantic positions. Model
  // reset/termination clears this cache; no additional Worker or session exists.
  const coachCache = useRef(new Map<string, { budget: number; evidence: CoachEngineEvidence }>());
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
        coachCache.current.clear();
        // Optional analysis must not leave lifecycle.failed blocking the rules
        // opponent after a model download or initialization failure.
        webAiEngine.terminateAI();
        return;
      }
      aiTurnLock.current = false;
      pendingEndGameRef.current = null;
      playRequest.current = null;
      setToastMsg(`AI 出错: ${message}`);
    },
    onAnalysisComplete: data => {
      if (data.purpose === 'coach') {
        const request = pendingCoach.current;
        if (!request) return;
        const position = request.position;
        const ownership = data.ownership === null ? null : data.ownership instanceof Float32Array
          && data.ownership.length === position.board.length ** 2
          && data.ownership.every(value => Number.isFinite(value) && Math.abs(value) <= 1)
          ? new Float32Array(data.ownership) : undefined;
        request.finish(gameState.readPosition() === position && !gameState.gameOver && data.visits
          ? { positionKey: coachPositionKey(position, position.currentPlayer, getDefaultKomi(position.board.length)),
            source: 'local-katago', perspective: 'black', visits: data.visits, winRateBlack: data.winRate,
            estimatedBlackLead: data.estimatedBlackLead, candidates: data.candidates ?? [],
            ...(ownership !== undefined ? { ownership } : {}), ...(data.pass ? { pass: { ...data.pass } } : {}) } : undefined);
        return;
      }
      const request = takeScoringRequest(pendingEndGameRef, readSnapshot());
      if (!request || gameState.gameOver) return;
      // Dead-stone removal belongs to settlement, never to the recorded game.
      const { score, lead } = evaluateScoring(request, data.ownership);
      gameState.setFinalScore(score);
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
  const requestCoachAnalysis = useCallback((position: GamePosition, signal?: AbortSignal, requestedFocus: Point[] = []): Promise<CoachEngineEvidence | undefined> => {
    if (signal?.aborted) return Promise.reject(new DOMException('分析已取消', 'AbortError'));
    const current = latestGameState.current;
    if (current.readPosition() !== position || current.gameOver || current.appMode !== 'playing'
      || pendingEndGameRef.current || playRequest.current || aiTurnLock.current) return Promise.resolve(undefined);
    cancelCoachAnalysis();
    const komi = getDefaultKomi(position.board.length);
    const previous = position.history.at(-1);
    const previousHash = previous ? getBoardHash(previous.board) : null;
    const focusPoints = requestedFocus.filter((point, index, points) => Number.isInteger(point.x) && Number.isInteger(point.y)
      && point.x >= 0 && point.y >= 0 && point.x < position.board.length && point.y < position.board.length
      && points.findIndex(other => other.x === point.x && other.y === point.y) === index
      && attemptMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previousHash))
      .slice(0, 3).map(point => ({ x: point.x, y: point.y })).sort((a, b) => a.y - b.y || a.x - b.x);
    const budget = 8 + 8 * focusPoints.length;
    const cacheKey = `${coachPositionKey(position, position.currentPlayer, komi)}:${JSON.stringify(focusPoints)}`;
    const cached = coachCache.current.get(cacheKey);
    if (cached && cached.budget >= budget) {
      coachCache.current.delete(cacheKey);
      coachCache.current.set(cacheKey, cached);
      return Promise.resolve(cached.evidence);
    }
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;
      const request: PendingCoachAnalysis = { position, finish(evidence, aborted = false) {
        if (pendingCoach.current !== request) return;
        pendingCoach.current = null;
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        if (evidence) {
          coachCache.current.set(cacheKey, { budget, evidence });
          if (coachCache.current.size > 8) coachCache.current.delete(coachCache.current.keys().next().value!);
        }
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
        komi, 'Go', budget, 'coach', focusPoints);
      if (!accepted) request.finish();
    });
  }, [rawRequestAnalysis, rawStopThinking, cancelCoachAnalysis]);
  const stopThinking = useCallback(() => {
    pendingCoach.current?.finish();
    rawStopThinking();
  }, [rawStopThinking]);
  const invalidateApplicationRequests = useCallback(() => {
    coachCache.current.clear();
    // Clear application ownership before invalidating the Worker generation.
    playRequest.current = null;
    pendingEndGameRef.current = null;
    if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    aiTimerRef.current = null;
    aiTurnLock.current = false;
  }, []);
  const rawResetAI = webAiEngine.resetAI;
  const resetAI = useCallback(() => {
    invalidateApplicationRequests();
    pendingCoach.current?.finish();
    rawResetAI();
  }, [invalidateApplicationRequests, rawResetAI]);
  const rawTerminateAI = webAiEngine.terminateAI;
  const terminateAI = useCallback(() => { coachCache.current.clear(); pendingCoach.current?.finish(); rawTerminateAI(); }, [rawTerminateAI]);
  useEffect(() => () => { pendingCoach.current?.finish(); coachCache.current.clear(); }, []);
  const currentPosition = gameState.readPosition();
  useEffect(() => {
    if (pendingCoach.current && (pendingCoach.current.position !== currentPosition || gameState.gameOver || gameState.appMode !== 'playing')) {
      cancelCoachAnalysis();
    }
  }, [currentPosition, gameState.gameOver, gameState.appMode, cancelCoachAnalysis]);
  const cancelAiSession = useCallback(() => {
    invalidateApplicationRequests();
    stopThinking();
  }, [invalidateApplicationRequests, stopThinking]);
  // The shared Worker is busy for two different owners. Optional teaching work
  // must not activate the game's loading overlay or disable its move controls.
  const optionalAnalysis = pendingCoach.current !== null;
  return { webAiEngine: { ...webAiEngine,
    isLoading: !optionalAnalysis && webAiEngine.isLoading,
    isInitializing: !optionalAnalysis && webAiEngine.isInitializing,
    isThinking: !optionalAnalysis && webAiEngine.isThinking,
    initStatus: optionalAnalysis ? '' : webAiEngine.initStatus,
    requestWebAiMove, requestAnalysis, stopThinking, resetAI, terminateAI },
    aiTimerRef, aiTurnLock, pendingEndGameRef, cancelAiSession, requestCoachAnalysis };
}

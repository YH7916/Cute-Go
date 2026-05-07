import { useEffect, useMemo, useState } from 'react';
import type { MutableRefObject } from 'react';
import { BoardState, Difficulty, GameMode, GameType, HistoryItem, Player } from '../types';
import { getAIConfig } from '../utils/aiConfig';

interface GameFlowSettings {
  boardSize: number;
  gameType: GameType;
  gameMode: GameMode;
  difficulty: Difficulty;
  userColor: Player;
  showWinRate: boolean;
}

interface GameFlowGameState {
  board: BoardState;
  boardRef: MutableRefObject<BoardState>;
  currentPlayer: Player;
  currentPlayerRef: MutableRefObject<Player>;
  historyRef: MutableRefObject<HistoryItem[]>;
  gameOver: boolean;
  appMode: string;
}

interface GameFlowWebAi {
  isWorkerReady: boolean;
  isWebLoading: boolean;
  isWebThinking: boolean;
  isWebInitializing: boolean;
  webWinRate: number;
  webLead: number | null;
  webTerritory: Float32Array | null;
  stopWebThinking: () => void;
  requestWebAiMove: (
    board: BoardState,
    aiColor: Player,
    history: HistoryItem[],
    simulations: number,
    komi: number,
    difficulty: Difficulty,
    temperature: number,
    gameType: GameType,
  ) => void;
}

interface UseGameFlowOptions {
  settings: GameFlowSettings;
  gameState: GameFlowGameState;
  isThinking: boolean;
  setIsThinking: (thinking: boolean) => void;
  showStartScreen: boolean;
  showPassModal: boolean;
  aiTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  aiTurnLock: MutableRefObject<boolean>;
  webAi: GameFlowWebAi;
}

export const useGameFlow = ({
  settings,
  gameState,
  isThinking,
  setIsThinking,
  showStartScreen,
  showPassModal,
  aiTimerRef,
  aiTurnLock,
  webAi,
}: UseGameFlowOptions) => {
  const {
    isWorkerReady,
    isWebLoading,
    isWebThinking,
    isWebInitializing,
    webWinRate,
    webLead,
    webTerritory,
    stopWebThinking,
    requestWebAiMove,
  } = webAi;

  const [isFirstRun] = useState(() => !localStorage.getItem('has_run_ai_before'));
  const [hideOfflineLoading, setHideOfflineLoading] = useState(false);
  const [isPageVisible, setIsPageVisible] = useState(!document.hidden);
  const showThinkingStatus = isThinking || isWebThinking;

  useEffect(() => {
    if (isWebInitializing) setHideOfflineLoading(false);
  }, [isWebInitializing]);

  useEffect(() => {
    const handleAppVisibility = () => {
      const visible = !document.hidden;
      setIsPageVisible(visible);
      if (!visible) {
        if (aiTurnLock.current) {
          console.log("[App] App hidden, resetting AI lock");
          aiTurnLock.current = false;
          setIsThinking(false);
          stopWebThinking();
        }
        if (aiTimerRef.current) {
          clearTimeout(aiTimerRef.current);
          aiTimerRef.current = null;
        }
      }
    };
    document.addEventListener("visibilitychange", handleAppVisibility);
    return () => document.removeEventListener("visibilitychange", handleAppVisibility);
  }, [aiTimerRef, aiTurnLock, setIsThinking, stopWebThinking]);

  useEffect(() => {
    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [aiTimerRef]);

  useEffect(() => {
    if (isWorkerReady && !isWebLoading) {
      localStorage.setItem('has_run_ai_before', 'true');
    }
  }, [isWorkerReady, isWebLoading]);

  const displayWinRate = useMemo(() => {
    if (!settings.showWinRate || settings.difficulty === 'Fun' || gameState.gameOver || gameState.appMode !== 'playing') {
      return 50;
    }

    if (isWorkerReady && settings.gameMode === 'PvAI' && webWinRate !== 50) {
      return webWinRate;
    }

    return 50;
  }, [
    gameState.appMode,
    gameState.gameOver,
    settings.difficulty,
    settings.gameMode,
    settings.showWinRate,
    isWorkerReady,
    webWinRate,
  ]);

  const displayLead = useMemo(() => {
    let lead: number | null = null;
    if (settings.gameMode === 'PvAI' && settings.difficulty !== 'Fun') {
      if (webLead !== null && isWorkerReady) {
        lead = webLead;
      }
    }
    return lead;
  }, [settings.difficulty, settings.gameMode, isWorkerReady, webLead]);

  const displayTerritory = useMemo(() => {
    if (settings.gameType !== 'Go') return null;
    if (settings.difficulty === 'Fun') return null;
    return webTerritory;
  }, [settings.difficulty, settings.gameType, webTerritory]);

  useEffect(() => {
    if (!isPageVisible || showStartScreen) return;
    if (gameState.appMode !== 'playing' || gameState.gameOver || showPassModal || settings.gameMode !== 'PvAI') return;
    const aiColor = settings.userColor === 'black' ? 'white' : 'black';

    if (gameState.currentPlayer === aiColor) {
      if (aiTurnLock.current) {
        if (!isWorkerReady && !isWebInitializing && !isWebThinking) {
          console.warn("[App] AI turn lock was stale. Resetting and retrying local AI request.");
          aiTurnLock.current = false;
        } else {
          return;
        }
      }

      const aiConfig = getAIConfig(settings.difficulty);
      if (!aiTurnLock.current) {
        aiTurnLock.current = true;

        let sims = aiConfig.simulations;
        if (sims < 1) sims = 1;

        const komi = settings.boardSize === 9 ? 6.5 : 7.5;
        const t = aiConfig.temperature ?? 0;

        requestWebAiMove(
          gameState.boardRef.current,
          aiColor,
          gameState.historyRef.current,
          sims,
          komi,
          settings.difficulty,
          t,
          settings.gameType
        );
      }
    } else if (gameState.currentPlayer === settings.userColor) {
      aiTurnLock.current = false;
    }
  }, [
    aiTurnLock,
    gameState.appMode,
    gameState.board,
    gameState.boardRef,
    gameState.currentPlayer,
    gameState.gameOver,
    gameState.historyRef,
    isPageVisible,
    isWebInitializing,
    isWebThinking,
    isWorkerReady,
    requestWebAiMove,
    settings.boardSize,
    settings.difficulty,
    settings.gameMode,
    settings.gameType,
    settings.userColor,
    showPassModal,
    showStartScreen,
  ]);

  return {
    displayLead,
    displayTerritory,
    displayWinRate,
    hideOfflineLoading,
    isFirstRun,
    setHideOfflineLoading,
    showThinkingStatus,
  };
};

import { useCallback, useEffect, useState } from 'react';
import type { MutableRefObject } from 'react';
import { GameMode, GameType, Difficulty } from '../types';
import { getAIConfig } from '../utils/aiConfig';

interface StartGameSettings {
  gameType: GameType;
  gameMode: GameMode;
  difficulty: Difficulty;
  setGameType: (gameType: GameType) => void;
  setGameMode: (gameMode: GameMode) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  setCoachMode: (enabled: boolean) => void;
  setUserColor: (color: 'black' | 'white') => void;
}

interface StartGameWebAi {
  isWorkerReady: boolean;
  isInitializing: boolean;
  initializeAI: (options: { needModel: boolean }) => void;
  terminateAI: () => void;
}

interface UseStartGameFlowOptions {
  settings: StartGameSettings;
  showStartScreen: boolean;
  setShowStartScreen: (show: boolean) => void;
  appMode: string;
  webAiEngine: StartGameWebAi;
  gameTypeRef: MutableRefObject<GameType>;
  resetGame: (keepOnline?: boolean, explicitSize?: number, shouldBroadcast?: boolean) => void;
  vibrate: (pattern: number | number[]) => void;
}

export const useStartGameFlow = ({
  settings,
  showStartScreen,
  setShowStartScreen,
  appMode,
  webAiEngine,
  gameTypeRef,
  resetGame,
  vibrate,
}: UseStartGameFlowOptions) => {
  const { isWorkerReady, isInitializing, initializeAI, terminateAI } = webAiEngine;
  const [isPageVisible, setIsPageVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const visibilityChanged = () => setIsPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibilityChanged);
    return () => document.removeEventListener('visibilitychange', visibilityChanged);
  }, []);

  useEffect(() => {
    if (!isPageVisible || showStartScreen || appMode !== 'playing') return;

    if (settings.gameMode !== 'PvAI') {
      console.log("[App] Non-AI Mode detected: Terminating AI engines to save power.");
      terminateAI();
      return;
    }

    if (settings.gameType === 'Go') {
      const aiConfig = getAIConfig(settings.difficulty);
      if (!aiConfig.useModel) {
        // Explicit mode-change actions already release the Worker. Do not cancel
        // a Fun move that useGameFlow queued earlier in this render's effects.
        return;
      }
      if (!isWorkerReady && !isInitializing) {
        const needModel = aiConfig.useModel;
        console.log(`[App] Auto-triggering AI Init (Playing Mode, needModel=${needModel})...`);
        initializeAI({ needModel });
      }
    }
  }, [
    appMode,
    initializeAI,
    isInitializing,
    isPageVisible,
    isWorkerReady,
    settings.difficulty,
    settings.gameMode,
    settings.gameType,
    showStartScreen,
    terminateAI,
  ]);

  const handleStartGame = useCallback((mode: 'PvP' | 'PvAI', aiType?: 'local' | 'fun', gameType = settings.gameType) => {
    settings.setCoachMode(false);
    console.log('[handleStartGame] Called with mode:', mode, 'aiType:', aiType, 'gameType:', gameType);
    console.log('[handleStartGame] Before: showStartScreen =', showStartScreen);

    setShowStartScreen(false);

    settings.setGameType(gameType);
    gameTypeRef.current = gameType;
    settings.setGameMode(mode);

    resetGame(false, undefined, false);

    if (mode === 'PvAI') {
      if (aiType === 'fun') {
        settings.setDifficulty('Fun');
        terminateAI();
      } else {
        const localDifficulty = settings.difficulty === 'Fun' ? 'Easy' : settings.difficulty;
        settings.setDifficulty(localDifficulty);
        const aiConfigLocal = getAIConfig(localDifficulty);
        if (!isWorkerReady && !isInitializing) {
          const needModel = aiConfigLocal.useModel && gameType === 'Go';
          console.log(`[handleStartGame] Initializing AI (needModel=${needModel})...`);
          initializeAI({ needModel });
        }
      }
    } else {
      terminateAI();
    }

    console.log('[handleStartGame] showStartScreen set to false');
    vibrate(20);
  }, [
    gameTypeRef,
    initializeAI,
    isInitializing,
    isWorkerReady,
    resetGame,
    setShowStartScreen,
    settings,
    showStartScreen,
    terminateAI,
    vibrate,
  ]);

  const handleStartCoach = () => {
    settings.setGameType('Go');
    gameTypeRef.current = 'Go';
    settings.setGameMode('PvAI');
    settings.setCoachMode(true);
    settings.setUserColor('black');
    settings.setDifficulty('Fun');
    // A complete 9x9 reset also cancels pending move/analysis requests.
    resetGame(false, 9, false);
    terminateAI();
    setShowStartScreen(false);
    vibrate(20);
  };

  return { handleStartGame, handleStartCoach };
};

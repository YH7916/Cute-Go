import { useCallback, useEffect } from 'react';
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
  exitTsumegoMode: (nextGameMode?: GameMode) => void;
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
  exitTsumegoMode,
  vibrate,
}: UseStartGameFlowOptions) => {
  const { isWorkerReady, isInitializing, initializeAI, terminateAI } = webAiEngine;

  useEffect(() => {
    if (showStartScreen || appMode !== 'playing') return;

    if (settings.gameMode !== 'PvAI') {
      console.log("[App] Non-AI Mode detected: Terminating AI engines to save power.");
      terminateAI();
      return;
    }

    if (settings.gameType === 'Go') {
      const aiConfig = getAIConfig(settings.difficulty);
      if (!aiConfig.useModel) {
        terminateAI();
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
    isWorkerReady,
    settings.difficulty,
    settings.gameMode,
    settings.gameType,
    showStartScreen,
    terminateAI,
  ]);

  const handleStartGame = useCallback((mode: 'PvP' | 'PvAI', aiType?: 'local' | 'fun', gameType = settings.gameType) => {
    console.log('[handleStartGame] Called with mode:', mode, 'aiType:', aiType, 'gameType:', gameType);
    console.log('[handleStartGame] Before: showStartScreen =', showStartScreen);

    setShowStartScreen(false);
    exitTsumegoMode(mode);

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
    exitTsumegoMode,
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

  return { handleStartGame };
};

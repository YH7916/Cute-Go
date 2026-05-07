import { useCallback } from 'react';
import type { MutableRefObject } from 'react';
import type { GameSettingsData } from '../components/SettingsModal';
import { getAIConfig } from '../utils/aiConfig';
import type { AppProfile } from '../services/platform';

interface ApplySettingsSettings {
  setBoardSize: (boardSize: GameSettingsData['boardSize']) => void;
  setDifficulty: (difficulty: GameSettingsData['difficulty']) => void;
  setGameMode: (gameMode: GameSettingsData['gameMode']) => void;
  setGameType: (gameType: GameSettingsData['gameType']) => void;
  setUserColor: (userColor: GameSettingsData['userColor']) => void;
}

interface ApplySettingsWebAi {
  initializeAI: (options: { needModel: boolean }) => void;
  isInitializing: boolean;
  isWorkerReady: boolean;
  terminateAI: () => void;
}

interface UseApplySettingsFlowOptions {
  aiTimerRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  aiTurnLock: MutableRefObject<boolean>;
  exitTsumegoMode: (nextGameMode: GameSettingsData['gameMode']) => void;
  resetGame: (keepOnline?: boolean, explicitSize?: number, shouldBroadcast?: boolean) => void;
  settings: ApplySettingsSettings;
  setToastMsg: (message: string | null) => void;
  stopWebThinking: () => void;
  userProfile: AppProfile | null;
  vibrate: (pattern: number | number[]) => void;
  webAiEngine: ApplySettingsWebAi;
}

export const useApplySettingsFlow = ({
  aiTimerRef,
  aiTurnLock,
  exitTsumegoMode,
  resetGame,
  settings,
  setToastMsg,
  stopWebThinking,
  userProfile,
  vibrate,
  webAiEngine,
}: UseApplySettingsFlowOptions) => {
  return useCallback((newSettings: GameSettingsData) => {
    vibrate(20);
    stopWebThinking();
    aiTurnLock.current = false;
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    exitTsumegoMode(newSettings.gameMode);
    settings.setBoardSize(newSettings.boardSize);
    settings.setGameType(newSettings.gameType);
    settings.setDifficulty(newSettings.difficulty);
    settings.setGameMode(newSettings.gameMode);
    settings.setUserColor(newSettings.userColor);

    if (newSettings.gameMode === 'PvAI' && userProfile?.elo !== undefined) {
      const lowAi = newSettings.difficulty === 'Easy' || newSettings.difficulty === 'Medium';
      if (userProfile.elo >= 1450 && lowAi) {
        setToastMsg('以你现在的实力，战胜这个难度的 AI 将无法获得积分，建议挑战更高级别或联机对战！');
        setTimeout(() => setToastMsg(null), 3500);
      }
    }

    resetGame(false, newSettings.boardSize);

    if (newSettings.gameMode === 'PvAI' && newSettings.gameType === 'Go') {
      const aiConfig = getAIConfig(newSettings.difficulty);

      if (!aiConfig.useModel) {
        webAiEngine.terminateAI();
        return;
      }

      if (aiConfig.useModel && !webAiEngine.isWorkerReady && !webAiEngine.isInitializing) {
        const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        if (!isMobile) {
          console.log("[App] Triggering Lazy AI Init (Model Required)...");
          webAiEngine.initializeAI({ needModel: true });
        } else {
          console.log("[App] Mobile: Deferring AI Init to first move.");
        }
      }
    }
  }, [
    aiTimerRef,
    aiTurnLock,
    exitTsumegoMode,
    resetGame,
    settings,
    setToastMsg,
    stopWebThinking,
    userProfile?.elo,
    vibrate,
    webAiEngine,
  ]);
};

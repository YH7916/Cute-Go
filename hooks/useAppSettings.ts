import { useState, useEffect } from 'react';
import { BoardSize, GameType, GameMode, Player, ExtendedDifficulty } from '../types';

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : fallback;
  } catch (e) {
    return fallback;
  }
};

export const useAppSettings = () => {
  // Global App State (使用 loadState 初始化)
  const [boardSize, setBoardSize] = useState<BoardSize>(() => loadState('boardSize', 9));
  const [gameType, setGameType] = useState<GameType>(() => loadState('gameType', 'Go'));
  const [gameMode, setGameMode] = useState<GameMode>(() => loadState('gameMode', 'PvP'));
  const [difficulty, setDifficulty] = useState<ExtendedDifficulty>(() => loadState('difficulty', 'Easy'));
  
  // 思考量状态 (默认 1)
  const [maxVisits, setMaxVisits] = useState<number>(() => loadState('maxVisits', 1));

  // Player Color Preference (vs AI)
  const [userColor, setUserColor] = useState<Player>(() => loadState('userColor', 'black'));
  
  // Visual/Audio Settings
  const [showQi, setShowQi] = useState<boolean>(() => loadState('showQi', false));
  const [showWinRate, setShowWinRate] = useState<boolean>(() => loadState('showWinRate', true));
  const [showCoordinates, setShowCoordinates] = useState<boolean>(() => loadState('showCoordinates', false));
  const [musicVolume, setMusicVolume] = useState<number>(() => loadState('musicVolume', 0.3));
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => loadState('hapticEnabled', true));

  // Skins
  const [boardSkin, setBoardSkin] = useState<string>(() => loadState('boardSkin', 'wood'));
  const [stoneSkin, setStoneSkin] = useState<string>(() => loadState('stoneSkin', 'classic'));

  // 监听状态变化并自动保存
  useEffect(() => {
    localStorage.setItem('boardSize', JSON.stringify(boardSize));
    localStorage.setItem('gameType', JSON.stringify(gameType));
    localStorage.setItem('gameMode', JSON.stringify(gameMode));
    localStorage.setItem('difficulty', JSON.stringify(difficulty));
    localStorage.setItem('maxVisits', JSON.stringify(maxVisits));
    localStorage.setItem('userColor', JSON.stringify(userColor));
    
    localStorage.setItem('showQi', JSON.stringify(showQi));
    localStorage.setItem('showWinRate', JSON.stringify(showWinRate));
    localStorage.setItem('showCoordinates', JSON.stringify(showCoordinates));
    localStorage.setItem('musicVolume', JSON.stringify(musicVolume));
    localStorage.setItem('hapticEnabled', JSON.stringify(hapticEnabled));
    
    localStorage.setItem('boardSkin', JSON.stringify(boardSkin));
    localStorage.setItem('stoneSkin', JSON.stringify(stoneSkin));
  }, [boardSize, gameType, gameMode, difficulty, maxVisits, userColor, 
      showQi, showWinRate, showCoordinates, musicVolume, hapticEnabled,
      boardSkin, stoneSkin]); // Added deps

  return {
    boardSize, setBoardSize,
    gameType, setGameType,
    gameMode, setGameMode,
    difficulty, setDifficulty,
    maxVisits, setMaxVisits,
    userColor, setUserColor,
    showQi, setShowQi,
    showWinRate, setShowWinRate,
    showCoordinates, setShowCoordinates,
    musicVolume, setMusicVolume,
    hapticEnabled, setHapticEnabled,
    boardSkin, setBoardSkin,
    stoneSkin, setStoneSkin
  };
};

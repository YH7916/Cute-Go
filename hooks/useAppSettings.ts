import { useState, useEffect } from 'react';
import { BoardSize, GameType, GameMode, Player, Difficulty } from '../types';
import { STONE_THEMES, StoneThemeId } from '../utils/themes';

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : fallback;
  } catch (e) {
    return fallback;
  }
};

const loadDifficulty = (): Difficulty => {
  const saved = loadState<string>('difficulty', 'Easy');
  return saved === 'Medium' || saved === 'Hard' ? saved : 'Easy';
};

const loadStoneSkin = (): StoneThemeId => {
  const saved = loadState<string>('stoneSkin', 'skeuomorphic');
  return saved in STONE_THEMES ? (saved as StoneThemeId) : 'classic';
};

export const useAppSettings = () => {
  const [boardSize, setBoardSize] = useState<BoardSize>(() => loadState('boardSize', 9));
  const [gameType, setGameType] = useState<GameType>(() => loadState('gameType', 'Go'));
  const [gameMode, setGameMode] = useState<GameMode>(() => loadState('gameMode', 'PvAI'));
  const [difficulty, setDifficulty] = useState<Difficulty>(loadDifficulty);
  const [userColor, setUserColor] = useState<Player>(() => loadState('userColor', 'black'));
  const [showQi, setShowQi] = useState<boolean>(() => loadState('showQi', false));
  const [showWinRate, setShowWinRate] = useState<boolean>(() => loadState('showWinRate', true));
  const [showCoordinates, setShowCoordinates] = useState<boolean>(() => loadState('showCoordinates', false));
  const [musicVolume, setMusicVolume] = useState<number>(() => loadState('musicVolume', 0.3));
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(() => loadState('hapticEnabled', true));
  const [boardSkin, setBoardSkin] = useState<string>(() => loadState('boardSkin', 'wood'));
  const [stoneSkin, setStoneSkin] = useState<string>(loadStoneSkin);
  const [skipStartScreen, setSkipStartScreen] = useState<boolean>(() => loadState('skipStartScreen', true));
  const [separatePieces, setSeparatePieces] = useState<boolean>(() => loadState('separatePieces', false));

  useEffect(() => {
    localStorage.setItem('boardSize', JSON.stringify(boardSize));
    localStorage.setItem('gameType', JSON.stringify(gameType));
    localStorage.setItem('gameMode', JSON.stringify(gameMode));
    localStorage.setItem('difficulty', JSON.stringify(difficulty));
    localStorage.setItem('userColor', JSON.stringify(userColor));
    localStorage.setItem('showQi', JSON.stringify(showQi));
    localStorage.setItem('showWinRate', JSON.stringify(showWinRate));
    localStorage.setItem('showCoordinates', JSON.stringify(showCoordinates));
    localStorage.setItem('musicVolume', JSON.stringify(musicVolume));
    localStorage.setItem('hapticEnabled', JSON.stringify(hapticEnabled));
    localStorage.setItem('boardSkin', JSON.stringify(boardSkin));
    localStorage.setItem('stoneSkin', JSON.stringify(stoneSkin));
    localStorage.setItem('skipStartScreen', JSON.stringify(skipStartScreen));
    localStorage.setItem('separatePieces', JSON.stringify(separatePieces));
  }, [boardSize, gameType, gameMode, difficulty, userColor,
      showQi, showWinRate, showCoordinates, musicVolume, hapticEnabled,
      boardSkin, stoneSkin, skipStartScreen, separatePieces]);

  return {
    boardSize, setBoardSize,
    gameType, setGameType,
    gameMode, setGameMode,
    difficulty, setDifficulty,
    userColor, setUserColor,
    showQi, setShowQi,
    showWinRate, setShowWinRate,
    showCoordinates, setShowCoordinates,
    musicVolume, setMusicVolume,
    hapticEnabled, setHapticEnabled,
    boardSkin, setBoardSkin,
    stoneSkin, setStoneSkin,
    skipStartScreen, setSkipStartScreen,
    separatePieces, setSeparatePieces
  };
};

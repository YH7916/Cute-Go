import { useReducer, useEffect } from 'react';
import { BoardSize, GameType, GameMode, Player, Difficulty } from '../types';
import { STONE_THEMES, StoneThemeId } from '../utils/themes';

const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const saved = localStorage.getItem(key);
    return saved !== null ? JSON.parse(saved) : fallback;
  } catch {
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

interface AppSettings {
  boardSize: BoardSize;
  gameType: GameType;
  gameMode: GameMode;
  difficulty: Difficulty;
  userColor: Player;
  showQi: boolean;
  showWinRate: boolean;
  showCoordinates: boolean;
  musicVolume: number;
  hapticEnabled: boolean;
  boardSkin: string;
  stoneSkin: string;
  skipStartScreen: boolean;
  separatePieces: boolean;
}

type SettingsAction = { [K in keyof AppSettings]: { type: K; value: AppSettings[K] } }[keyof AppSettings];

const initialSettings: AppSettings = {
  boardSize: loadState<BoardSize>('boardSize', 9),
  gameType: loadState<GameType>('gameType', 'Go'),
  gameMode: loadState<GameMode>('gameMode', 'PvAI'),
  difficulty: loadDifficulty(),
  userColor: loadState<Player>('userColor', 'black'),
  showQi: loadState<boolean>('showQi', false),
  showWinRate: loadState<boolean>('showWinRate', true),
  showCoordinates: loadState<boolean>('showCoordinates', false),
  musicVolume: loadState<number>('musicVolume', 0.3),
  hapticEnabled: loadState<boolean>('hapticEnabled', true),
  boardSkin: loadState<string>('boardSkin', 'wood'),
  stoneSkin: loadStoneSkin(),
  skipStartScreen: loadState<boolean>('skipStartScreen', true),
  separatePieces: loadState<boolean>('separatePieces', false),
};

const settingsReducer = (state: AppSettings, action: SettingsAction): AppSettings => ({
  ...state,
  [action.type]: action.value,
});

const PERSIST_KEYS: (keyof AppSettings)[] = [
  'boardSize', 'gameType', 'gameMode', 'difficulty', 'userColor',
  'showQi', 'showWinRate', 'showCoordinates', 'musicVolume', 'hapticEnabled',
  'boardSkin', 'stoneSkin', 'skipStartScreen', 'separatePieces',
];

export const useAppSettings = () => {
  const [settings, dispatch] = useReducer(settingsReducer, initialSettings);

  useEffect(() => {
    PERSIST_KEYS.forEach(key => {
      localStorage.setItem(key, JSON.stringify(settings[key]));
    });
  }, [settings]);

  const make = <K extends keyof AppSettings>(key: K) =>
    (value: AppSettings[K]) => dispatch({ type: key, value } as SettingsAction);

  return {
    boardSize: settings.boardSize,
    setBoardSize: make('boardSize'),
    gameType: settings.gameType,
    setGameType: make('gameType'),
    gameMode: settings.gameMode,
    setGameMode: make('gameMode'),
    difficulty: settings.difficulty,
    setDifficulty: make('difficulty'),
    userColor: settings.userColor,
    setUserColor: make('userColor'),
    showQi: settings.showQi,
    setShowQi: make('showQi'),
    showWinRate: settings.showWinRate,
    setShowWinRate: make('showWinRate'),
    showCoordinates: settings.showCoordinates,
    setShowCoordinates: make('showCoordinates'),
    musicVolume: settings.musicVolume,
    setMusicVolume: make('musicVolume'),
    hapticEnabled: settings.hapticEnabled,
    setHapticEnabled: make('hapticEnabled'),
    boardSkin: settings.boardSkin,
    setBoardSkin: make('boardSkin'),
    stoneSkin: settings.stoneSkin,
    setStoneSkin: make('stoneSkin'),
    skipStartScreen: settings.skipStartScreen,
    setSkipStartScreen: make('skipStartScreen'),
    separatePieces: settings.separatePieces,
    setSeparatePieces: make('separatePieces'),
  };
};

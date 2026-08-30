import { useCallback, useState } from 'react';
import { BoardSize, GameType, HistoryItem, Player } from '../types';
import { deserializeGame, generateSGF, parseSGF } from '../utils/goLogic';

interface ImportExportSettings {
  boardSize: BoardSize;
  setBoardSize: (size: BoardSize) => void;
  setGameType: (gameType: GameType) => void;
}

interface ImportExportGameState {
  board: HistoryItem['board'];
  currentPlayer: Player;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove: { x: number; y: number } | null;
  consecutivePasses: number;
  history: HistoryItem[];
  setBoard: (board: HistoryItem['board']) => void;
  setCurrentPlayer: (player: Player) => void;
  setBlackCaptures: (captures: number) => void;
  setWhiteCaptures: (captures: number) => void;
  setLastMove: (move: { x: number; y: number } | null) => void;
  setHistory: (history: HistoryItem[]) => void;
  setGameOver: (gameOver: boolean) => void;
  setWinner: (winner: Player | null) => void;
  setConsecutivePasses: (passes: number) => void;
  setAppMode: (mode: 'playing' | 'review' | 'setup') => void;
}

interface UseImportExportFlowOptions {
  settings: ImportExportSettings;
  gameState: ImportExportGameState;
  exitTsumegoMode: (nextGameMode?: 'PvP') => void;
  playSfx: (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => void;
  vibrate: (pattern: number | number[]) => void;
}

export const useImportExportFlow = ({
  settings,
  gameState,
  exitTsumegoMode,
  playSfx,
  vibrate,
}: UseImportExportFlowOptions) => {
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [gameCopied, setGameCopied] = useState(false);
  const [initialStones, setInitialStones] = useState<{ x: number, y: number, color: Player }[]>([]);

  const clearInitialStones = useCallback(() => {
    setInitialStones([]);
  }, []);

  const handleImport = useCallback(() => {
    if (importKey.trim().startsWith('(;')) {
      const sgfState = parseSGF(importKey);
      if (sgfState) {
        exitTsumegoMode('PvP');
        gameState.setBoard(sgfState.board);
        gameState.setCurrentPlayer(sgfState.currentPlayer);
        settings.setGameType(sgfState.gameType);
        settings.setBoardSize(sgfState.boardSize);
        gameState.setBlackCaptures(sgfState.blackCaptures);
        gameState.setWhiteCaptures(sgfState.whiteCaptures);
        gameState.setLastMove(sgfState.lastMove);
        gameState.setHistory(sgfState.history);
        setInitialStones(sgfState.initialStones);
        gameState.setGameOver(false);
        gameState.setWinner(null);
        gameState.setConsecutivePasses(0);
        gameState.setAppMode('playing');
        setShowImportModal(false);
        playSfx('move');
        vibrate(20);
        return;
      }
    }

    const gs = deserializeGame(importKey);
    if (gs) {
      exitTsumegoMode('PvP');
      gameState.setBoard(gs.board);
      gameState.setCurrentPlayer(gs.currentPlayer);
      settings.setGameType(gs.gameType);
      settings.setBoardSize(gs.boardSize);
      gameState.setBlackCaptures(gs.blackCaptures);
      gameState.setWhiteCaptures(gs.whiteCaptures);
      gameState.setLastMove(null);
      gameState.setHistory([]);
      gameState.setGameOver(false);
      gameState.setWinner(null);
      setInitialStones([]);
      gameState.setConsecutivePasses(0);
      gameState.setAppMode('playing');
      setShowImportModal(false);
      playSfx('move');
      vibrate(20);
    } else {
      alert('无效的棋谱格式 (支持 SGF 或 CuteGo 代码)');
    }
  }, [exitTsumegoMode, gameState, importKey, playSfx, settings, vibrate]);

  const getFullHistory = useCallback(() => {
    return gameState.history;
  }, [gameState.history]);

  const handleCopy = useCallback(() => {
    const sgf = generateSGF(getFullHistory(), settings.boardSize, 7.5, initialStones);

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sgf).then(() => {
        setGameCopied(true);
        setTimeout(() => setGameCopied(false), 2000);
        vibrate(10);
      }).catch(err => {
        console.error('Clipboard failed', err);
        alert("复制失败，请手动导出 SGF");
      });
    } else {
      alert("浏览器限制，请使用下方‘导出 SGF’按钮");
    }
  }, [getFullHistory, initialStones, settings.boardSize, vibrate]);

  const handleExportSGF = useCallback(() => {
    const sgf = generateSGF(getFullHistory(), settings.boardSize, 7.5, initialStones);

    const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cutego_${new Date().getTime()}.sgf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    vibrate(10);
  }, [getFullHistory, initialStones, settings.boardSize, vibrate]);

  return {
    clearInitialStones,
    gameCopied,
    handleCopy,
    handleExportSGF,
    handleImport,
    importKey,
    setImportKey,
    setShowImportModal,
    showImportModal,
  };
};

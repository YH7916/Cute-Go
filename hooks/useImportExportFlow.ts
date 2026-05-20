import { useCallback, useState, type MutableRefObject } from 'react';
import { BoardSize, GameType, HistoryItem, Player } from '../types';
import { deserializeGame, generateSGF, parseSGF } from '../utils/goLogic';

interface ImportExportSettings {
  boardSize: BoardSize;
  gameType: GameType;
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
  historyRef: MutableRefObject<HistoryItem[]>;
  setBoard: (board: HistoryItem['board']) => void;
  setCurrentPlayer: (player: Player) => void;
  setBlackCaptures: (captures: number) => void;
  setWhiteCaptures: (captures: number) => void;
  setHistory: (history: HistoryItem[]) => void;
  setLastMove: (move: { x: number; y: number } | null) => void;
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

  const collectBoardStones = useCallback((board: HistoryItem['board']) => {
    const stones: { x: number, y: number, color: Player }[] = [];
    board.forEach((row, y) => {
      row.forEach((stone, x) => {
        if (stone) stones.push({ x, y, color: stone.color });
      });
    });
    return stones;
  }, []);

  const getExportInitialStones = useCallback((history: HistoryItem[]) => {
    if (initialStones.length > 0) return initialStones;
    if (history.length > 0) return collectBoardStones(history[0].board);
    return collectBoardStones(gameState.board);
  }, [collectBoardStones, gameState.board, initialStones]);

  const getSgfFileName = useCallback(() => {
    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, '0');
    const date = [
      now.getFullYear(),
      pad(now.getMonth() + 1),
      pad(now.getDate()),
    ].join('-');
    const time = [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('-');
    return `go_${date}_${time}.sgf`;
  }, []);

  const buildExportSGF = useCallback(() => {
    if (settings.gameType !== 'Go') {
      alert('当前只有围棋对局支持 SGF 导出');
      return null;
    }

    const history = [...gameState.historyRef.current];
    return generateSGF(history, settings.boardSize, 7.5, getExportInitialStones(history));
  }, [gameState.historyRef, getExportInitialStones, settings.boardSize, settings.gameType]);

  const handleImport = useCallback(() => {
    if (importKey.trim().startsWith('(;')) {
      const sgfState = parseSGF(importKey);
      if (sgfState) {
        const lastHistoryItem = sgfState.history[sgfState.history.length - 1];

        exitTsumegoMode('PvP');
        gameState.setBoard(sgfState.board);
        gameState.setCurrentPlayer(sgfState.currentPlayer);
        settings.setGameType(sgfState.gameType);
        settings.setBoardSize(sgfState.boardSize);
        gameState.setBlackCaptures(sgfState.blackCaptures);
        gameState.setWhiteCaptures(sgfState.whiteCaptures);
        gameState.setHistory(sgfState.history);
        gameState.historyRef.current = sgfState.history;
        gameState.setLastMove(lastHistoryItem?.lastMove ?? null);
        setInitialStones(sgfState.initialStones);
        gameState.setGameOver(false);
        gameState.setWinner(null);
        gameState.setConsecutivePasses(
          lastHistoryItem?.lastMove === null ? lastHistoryItem.consecutivePasses + 1 : 0
        );
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
      gameState.setHistory([]);
      gameState.historyRef.current = [];
      gameState.setGameOver(false);
      gameState.setWinner(null);
      gameState.setLastMove(null);
      setInitialStones([]);
      gameState.setConsecutivePasses(0);
      gameState.setAppMode('playing');
      setShowImportModal(false);
      playSfx('move');
      vibrate(20);
    } else {
      alert('无效的棋谱格式 (请粘贴 SGF 文本)');
    }
  }, [exitTsumegoMode, gameState, importKey, playSfx, settings, vibrate]);

  const handleCopy = useCallback(() => {
    const sgf = buildExportSGF();
    if (!sgf) return;

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
  }, [buildExportSGF, vibrate]);

  const handleExportSGF = useCallback(() => {
    const sgf = buildExportSGF();
    if (!sgf) return;

    const blob = new Blob([sgf], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getSgfFileName();
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    vibrate(10);
  }, [buildExportSGF, getSgfFileName, vibrate]);

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

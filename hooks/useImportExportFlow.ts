import { getDefaultKomi } from '../core/go/config';
import { useCallback, useState } from 'react';
import { BoardSize, GameType, Player } from '../types';
import { deserializeGame, generateSGF, parseSGF } from '../core/go/sgf';
import type { PositionAccess } from '../domains/game/positionState';

interface ImportExportSettings {
  boardSize: BoardSize;
  setBoardSize: (size: BoardSize) => void;
  setGameType: (gameType: GameType) => void;
}

interface ImportExportGameState extends PositionAccess {
  setGameOver: (gameOver: boolean) => void;
  setWinner: (winner: Player | null) => void;
  setAppMode: (mode: 'playing' | 'review' | 'setup') => void;
}

interface UseImportExportFlowOptions {
  settings: ImportExportSettings;
  gameState: ImportExportGameState;
  onImported: () => void;
  playSfx: (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => void;
  vibrate: (pattern: number | number[]) => void;
}

export const useImportExportFlow = ({
  settings,
  gameState,
  onImported,
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
        gameState.writePosition({
          board: sgfState.board, currentPlayer: sgfState.currentPlayer,
          blackCaptures: sgfState.blackCaptures, whiteCaptures: sgfState.whiteCaptures,
          lastMove: sgfState.lastMove, history: sgfState.history, consecutivePasses: 0,
        });
        settings.setGameType(sgfState.gameType);
        settings.setBoardSize(sgfState.boardSize);
        setInitialStones(sgfState.initialStones);
        gameState.setGameOver(false);
        gameState.setWinner(null);
        gameState.setAppMode('playing');
        setShowImportModal(false);
        onImported();
        playSfx('move');
        vibrate(20);
        return;
      }
    }

    const gs = deserializeGame(importKey);
    if (gs) {
      gameState.writePosition({
        board: gs.board, currentPlayer: gs.currentPlayer,
        blackCaptures: gs.blackCaptures, whiteCaptures: gs.whiteCaptures,
        lastMove: null, history: [], consecutivePasses: 0,
      });
      settings.setGameType(gs.gameType);
      settings.setBoardSize(gs.boardSize);
      gameState.setGameOver(false);
      gameState.setWinner(null);
      setInitialStones([]);
      gameState.setAppMode('playing');
      setShowImportModal(false);
      onImported();
      playSfx('move');
      vibrate(20);
    } else {
      alert('无效的棋谱格式 (支持 SGF 或 CuteGo 代码)');
    }
  }, [gameState, importKey, onImported, playSfx, settings, vibrate]);

  const handleCopy = useCallback(() => {
    const position = gameState.readPosition();
    const size = position.board.length;
    const sgf = generateSGF(position.history, size, getDefaultKomi(size), initialStones);

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
  }, [gameState, initialStones, vibrate]);

  const handleExportSGF = useCallback(() => {
    const position = gameState.readPosition();
    const size = position.board.length;
    const sgf = generateSGF(position.history, size, getDefaultKomi(size), initialStones);

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
  }, [gameState, initialStones, vibrate]);

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

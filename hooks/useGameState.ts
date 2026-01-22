import { useState, useRef, useEffect } from 'react';
import { BoardState, Player, AppMode, HistoryItem, BoardSize } from '../types';
import { createBoard } from '../utils/goLogic';

export const useGameState = (initialBoardSize: BoardSize) => {
  // Game State
  const [board, setBoard] = useState<BoardState>(() => createBoard(initialBoardSize));

  const [currentPlayer, setCurrentPlayer] = useState<Player>('black');
  const [blackCaptures, setBlackCaptures] = useState(0);
  const [whiteCaptures, setWhiteCaptures] = useState(0);
  const [lastMove, setLastMove] = useState<{ x: number; y: number } | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<string>('');
  const [consecutivePasses, setConsecutivePasses] = useState(0);
  const [passNotificationDismissed, setPassNotificationDismissed] = useState(false); 
  const [finalScore, setFinalScore] = useState<{black: number, white: number} | null>(null);
  
  // App Modes
  const [appMode, setAppMode] = useState<AppMode>('playing');
  const [reviewIndex, setReviewIndex] = useState(0); 
  const [setupTool, setSetupTool] = useState<'black' | 'white' | 'erase'>('black'); 
  
  // Undo Stack
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Refs for State (needed for callbacks/intervals to access fresh state)
  const boardRef = useRef(board);
  const currentPlayerRef = useRef(currentPlayer);

  useEffect(() => { boardRef.current = board; }, [board]);
  useEffect(() => { currentPlayerRef.current = currentPlayer; }, [currentPlayer]);

  return {
      board, setBoard,
      currentPlayer, setCurrentPlayer,
      blackCaptures, setBlackCaptures,
      whiteCaptures, setWhiteCaptures,
      lastMove, setLastMove,
      gameOver, setGameOver,
      winner, setWinner,
      winReason, setWinReason,
      consecutivePasses, setConsecutivePasses,
      passNotificationDismissed, setPassNotificationDismissed,
      finalScore, setFinalScore,
      appMode, setAppMode,
      reviewIndex, setReviewIndex,
      setupTool, setSetupTool,
      history, setHistory,
      boardRef, currentPlayerRef
  };
};

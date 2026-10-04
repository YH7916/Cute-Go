import { useState, useRef, useCallback } from 'react';
import type { RefObject } from 'react';
import type { Player, AppMode, BoardSize } from '../types';
import { createInitialPosition, type GamePosition, type PositionAccess } from '../domains/game/positionState';

// Latest-value compatibility reads cannot bypass the complete position writer.
function positionFieldRef<Key extends keyof GamePosition>(position: RefObject<GamePosition>, key: Key): Readonly<RefObject<GamePosition[Key]>> {
  return {
    get current(): GamePosition[Key] { return position.current[key]; },
  };
}

export const useGameState = (initialBoardSize: BoardSize) => {
  const [position, setRenderedPosition] = useState(() => createInitialPosition(initialBoardSize));
  const positionRef = useRef(position);
  const readPosition = useCallback(() => positionRef.current, []);
  const writePosition = useCallback<PositionAccess['writePosition']>(next => {
    const value = typeof next === 'function' ? next(positionRef.current) : next;
    positionRef.current = value;
    setRenderedPosition(value);
  }, []);
  const [boardRef] = useState(() => positionFieldRef(positionRef, 'board'));
  const [currentPlayerRef] = useState(() => positionFieldRef(positionRef, 'currentPlayer'));
  const [historyRef] = useState(() => positionFieldRef(positionRef, 'history'));

  // Presentation/endgame flags do not belong to an undo position.
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [winReason, setWinReason] = useState<string>('');
  const [passNotificationDismissed, setPassNotificationDismissed] = useState(false); 
  const [finalScore, setFinalScore] = useState<{black: number, white: number} | null>(null);
  
  // App Modes
  const [appMode, setAppMode] = useState<AppMode>('playing');
  const [reviewIndex, setReviewIndex] = useState(0); 
  const [setupTool, setSetupTool] = useState<'black' | 'white' | 'erase'>('black'); 
  
  return {
      ...position, readPosition, writePosition,
      gameOver, setGameOver,
      winner, setWinner,
      winReason, setWinReason,
      passNotificationDismissed, setPassNotificationDismissed,
      finalScore, setFinalScore,
      appMode, setAppMode,
      reviewIndex, setReviewIndex,
      setupTool, setSetupTool,
      boardRef, currentPlayerRef, historyRef
  };
};

import type { UseGameActionsOptions } from './gameActions/types';
import { useBoardInputAction } from './gameActions/useBoardInputAction';
import { useEndGameAction } from './gameActions/useEndGameAction';
import { useMoveAction } from './gameActions/useMoveAction';
import { usePassAction } from './gameActions/usePassAction';
import { useResetGameAction } from './gameActions/useResetGameAction';
import { useScoringAction } from './gameActions/useScoringAction';
import { useUndoAction } from './gameActions/useUndoAction';

export const useGameActions = (options: UseGameActionsOptions) => {
  const resetGame = useResetGameAction(options);
  const endGame = useEndGameAction(options);
  const executeMove = useMoveAction(options, endGame);
  const triggerGoScoring = useScoringAction(options, endGame);
  const handlePass = usePassAction(options, triggerGoScoring);
  const handleUndo = useUndoAction(options);
  const handleIntersectionClick = useBoardInputAction(options, executeMove);

  return {
    endGame,
    executeMove,
    handleIntersectionClick,
    handlePass,
    handleUndo,
    resetGame,
    triggerGoScoring,
  };
};

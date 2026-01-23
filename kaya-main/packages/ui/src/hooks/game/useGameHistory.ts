import { useState, useCallback, useRef } from 'react';
import { GameTree } from '@kaya/gametree';
import { type SGFProperty } from '../../types/game';

/**
 * Represents a snapshot of the game tree state for undo/redo
 */
interface HistoryEntry {
  tree: GameTree<SGFProperty>;
  currentNodeId: number | string;
}

interface UseGameHistoryOptions {
  maxHistorySize?: number;
}

interface UseGameHistoryReturn {
  /** Push current state to history (call before making a change) */
  pushHistory: (tree: GameTree<SGFProperty>, currentNodeId: number | string) => void;
  /** Undo last change, returns the previous state or null if nothing to undo */
  undo: () => HistoryEntry | null;
  /** Redo last undone change, returns the next state or null if nothing to redo */
  redo: () => HistoryEntry | null;
  /** Whether undo is available */
  canUndo: boolean;
  /** Whether redo is available */
  canRedo: boolean;
  /** Clear all history (e.g., when loading a new game) */
  clearHistory: () => void;
  /** Number of undo steps available */
  undoCount: number;
  /** Number of redo steps available */
  redoCount: number;
}

const DEFAULT_MAX_HISTORY_SIZE = 100;

/**
 * Hook for managing undo/redo history for game tree modifications.
 *
 * Usage:
 * 1. Call `pushHistory(currentTree, currentNodeId)` BEFORE making any change
 * 2. Call `undo()` or `redo()` to get the previous/next state
 * 3. Update your state with the returned values
 */
export function useGameHistory(options: UseGameHistoryOptions = {}): UseGameHistoryReturn {
  const { maxHistorySize = DEFAULT_MAX_HISTORY_SIZE } = options;

  // Use refs to avoid unnecessary re-renders when history changes
  // Only canUndo/canRedo trigger re-renders
  const undoStackRef = useRef<HistoryEntry[]>([]);
  const redoStackRef = useRef<HistoryEntry[]>([]);

  // State for triggering re-renders when undo/redo availability changes
  const [undoCount, setUndoCount] = useState(0);
  const [redoCount, setRedoCount] = useState(0);

  const pushHistory = useCallback(
    (tree: GameTree<SGFProperty>, currentNodeId: number | string) => {
      const entry: HistoryEntry = { tree, currentNodeId };

      // Add to undo stack
      undoStackRef.current.push(entry);

      // Limit stack size
      if (undoStackRef.current.length > maxHistorySize) {
        undoStackRef.current.shift();
      }

      // Clear redo stack when new action is performed
      redoStackRef.current = [];

      // Update counts to trigger re-render
      setUndoCount(undoStackRef.current.length);
      setRedoCount(0);
    },
    [maxHistorySize]
  );

  const undo = useCallback((): HistoryEntry | null => {
    if (undoStackRef.current.length === 0) return null;

    const entry = undoStackRef.current.pop()!;

    // Note: The caller should push the current state to redo stack
    // We'll handle this in the hook that consumes this

    // Update counts
    setUndoCount(undoStackRef.current.length);

    return entry;
  }, []);

  const redo = useCallback((): HistoryEntry | null => {
    if (redoStackRef.current.length === 0) return null;

    const entry = redoStackRef.current.pop()!;

    // Update counts
    setRedoCount(redoStackRef.current.length);

    return entry;
  }, []);

  const pushToRedo = useCallback(
    (tree: GameTree<SGFProperty>, currentNodeId: number | string) => {
      const entry: HistoryEntry = { tree, currentNodeId };
      redoStackRef.current.push(entry);

      // Limit stack size
      if (redoStackRef.current.length > maxHistorySize) {
        redoStackRef.current.shift();
      }

      setRedoCount(redoStackRef.current.length);
    },
    [maxHistorySize]
  );

  const clearHistory = useCallback(() => {
    undoStackRef.current = [];
    redoStackRef.current = [];
    setUndoCount(0);
    setRedoCount(0);
  }, []);

  return {
    pushHistory,
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
    clearHistory,
    undoCount,
    redoCount,
    // Internal: expose pushToRedo for the undo handler
    pushToRedo,
  } as UseGameHistoryReturn & { pushToRedo: typeof pushToRedo };
}

export type { HistoryEntry, UseGameHistoryReturn };

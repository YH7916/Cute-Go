/**
 * BoardControls - Control bar below the Go board
 *
 * Displays:
 * - Captures for both players
 * - Player names and ranks
 * - Pass button
 * - Resign button
 * - Navigation controls
 * - Current player indicator
 */

import React, { useCallback, useEffect, memo, useState, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LuChevronLeft,
  LuChevronRight,
  LuChevronUp,
  LuChevronDown,
  LuSkipBack,
  LuSkipForward,
  LuRewind,
  LuFastForward,
  LuFlag,
  LuCalculator,
  LuLoader,
  LuX,
} from 'react-icons/lu';
import {
  useGameTreeNavigation,
  useGameTreeBoard,
  useGameTreeActions,
  useGameTreeScore,
} from '../../contexts/selectors';
import { useBoardNavigation } from '../../contexts/BoardNavigationContext';
import { useKeyboardShortcuts } from '../../contexts/KeyboardShortcutsContext';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';
import './BoardControls.css';

export const BoardControls: React.FC = memo(() => {
  const { t } = useTranslation();

  // Use optimized selectors instead of full useGameTree
  const {
    goBack,
    goForward,
    goBackSteps,
    goForwardSteps,
    goToStart,
    goToEnd,
    goToPreviousSibling,
    goToNextSibling,
    goToSiblingIndex,
    navigateToMove,
    siblingInfo,
    // Enhanced branch navigation
    branchInfo,
    switchBranch,
    switchToBranchIndex,
    canGoBack,
    canGoForward,
    moveNumber,
    totalMovesInBranch,
  } = useGameTreeNavigation();
  const { currentBoard, currentNode, gameInfo } = useGameTreeBoard();
  const { playMove, resign } = useGameTreeActions();
  const { scoringMode, toggleScoringMode, autoEstimateDeadStones, clearDeadStones, isEstimating } =
    useGameTreeScore();
  const { navigationMode } = useBoardNavigation();
  const { matchesShortcut } = useKeyboardShortcuts();
  const [showResignConfirm, setShowResignConfirm] = useState(false);

  // State for inline editing
  const [editingMove, setEditingMove] = useState(false);
  const [editingBranch, setEditingBranch] = useState(false);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if ((editingMove || editingBranch) && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingMove, editingBranch]);

  // Determine whose turn it is
  // Check PL property first, then handicap, then alternate based on move number
  const currentPlayer = useMemo(() => {
    // If current node has a move, next player is the opposite
    if (currentNode?.data.B) return -1; // Black just played, White's turn
    if (currentNode?.data.W) return 1; // White just played, Black's turn

    // No move on current node (root or setup position)
    // Check PL (Player to play) property
    if (currentNode?.data.PL?.[0]) {
      return currentNode.data.PL[0] === 'W' ? -1 : 1;
    }

    // Check handicap - if handicap >= 2, White plays first
    if (gameInfo.handicap && gameInfo.handicap >= 2) {
      // In handicap game, White plays first (at move 0)
      return moveNumber % 2 === 0 ? -1 : 1;
    }

    // Default: Black plays first
    return moveNumber % 2 === 0 ? 1 : -1;
  }, [currentNode, gameInfo.handicap, moveNumber]);

  // Get captures from current board
  const capturesBlack = currentBoard.getCaptures(1);
  const capturesWhite = currentBoard.getCaptures(-1);

  // Player names with defaults
  const playerBlack = gameInfo.playerBlack || t('gameInfo.black');
  const playerWhite = gameInfo.playerWhite || t('gameInfo.white');
  const rankBlack = gameInfo.rankBlack;
  const rankWhite = gameInfo.rankWhite;

  // Keyboard and wheel navigation (ultra-optimized for main thread)
  useEffect(() => {
    // Don't handle keyboard navigation if navigation mode is active
    // BUT allow wheel navigation even in navigation mode

    // Throttle keyboard navigation to prevent rapid fire when keys are held
    let keyThrottled = false;
    const KEY_THROTTLE_MS = 80; // ~12.5 navigations per second max

    const handleKeyDown = (e: KeyboardEvent) => {
      if (navigationMode) return; // Skip keyboard nav in navigation mode

      // Ignore if typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Throttle repeated key presses
      if (keyThrottled && e.repeat) return;

      // Navigation shortcuts using the configurable keyboard shortcuts
      if (matchesShortcut(e, 'nav.back')) {
        e.preventDefault();
        if (canGoBack && !keyThrottled) {
          keyThrottled = true;
          requestAnimationFrame(() => goBack());
          setTimeout(() => {
            keyThrottled = false;
          }, KEY_THROTTLE_MS);
        }
        return;
      }
      if (matchesShortcut(e, 'nav.forward')) {
        e.preventDefault();
        if (canGoForward && !keyThrottled) {
          keyThrottled = true;
          requestAnimationFrame(() => goForward());
          setTimeout(() => {
            keyThrottled = false;
          }, KEY_THROTTLE_MS);
        }
        return;
      }
      if (matchesShortcut(e, 'nav.branchUp')) {
        e.preventDefault();
        if (!keyThrottled && branchInfo.hasBranches) {
          keyThrottled = true;
          requestAnimationFrame(() => switchBranch('next'));
          setTimeout(() => {
            keyThrottled = false;
          }, KEY_THROTTLE_MS);
        }
        return;
      }
      if (matchesShortcut(e, 'nav.branchDown')) {
        e.preventDefault();
        if (!keyThrottled && branchInfo.hasBranches) {
          keyThrottled = true;
          requestAnimationFrame(() => switchBranch('previous'));
          setTimeout(() => {
            keyThrottled = false;
          }, KEY_THROTTLE_MS);
        }
        return;
      }
      if (matchesShortcut(e, 'nav.start')) {
        e.preventDefault();
        requestAnimationFrame(() => goToStart());
        return;
      }
      if (matchesShortcut(e, 'nav.end')) {
        e.preventDefault();
        requestAnimationFrame(() => goToEnd());
        return;
      }
    };

    // THROTTLE instead of debounce - execute immediately, then cooldown
    let isThrottled = false;
    let lastDelta = 0;
    const WHEEL_THRESHOLD = 30;
    const THROTTLE_MS = 50; // Minimum time between wheel navigations

    const handleWheel = (e: WheelEvent) => {
      // Only handle wheel events when scrolling over the board wrapper (goban) or game tree
      // Exclude scrollable elements like edit toolbar, score estimator, etc.
      const target = e.target as HTMLElement;
      const isOnBoardWrapper = target.closest('.gameboard-board-wrapper');
      const isOnGameTree = target.closest('.react-flow');
      const isOnScrollableElement = target.closest(
        '.edit-toolbar, .score-estimator, .ai-analysis-config'
      );

      if ((isOnBoardWrapper || isOnGameTree) && !isOnScrollableElement && !isThrottled) {
        // Don't preventDefault - causes warnings with passive listeners
        lastDelta += e.deltaY;

        if (Math.abs(lastDelta) > WHEEL_THRESHOLD) {
          isThrottled = true;

          // Execute navigation immediately in next frame
          requestAnimationFrame(() => {
            if (lastDelta < 0 && canGoBack) {
              goBack();
            } else if (lastDelta > 0 && canGoForward) {
              goForward();
            }
            lastDelta = 0;
          });

          // Reset throttle after cooldown
          setTimeout(() => {
            isThrottled = false;
          }, THROTTLE_MS);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Add passive flag to prevent warnings
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    goToStart,
    goToEnd,
    switchBranch,
    branchInfo.hasBranches,
    navigationMode,
    matchesShortcut,
  ]);

  const handlePass = useCallback(() => {
    // Pass is represented by empty coordinate
    const passVertex: [number, number] = [-1, -1];
    playMove(passVertex, currentPlayer);
  }, [playMove, currentPlayer]);

  const handleResign = useCallback(() => {
    setShowResignConfirm(true);
  }, []);

  const handleResignConfirm = useCallback(() => {
    resign(currentPlayer);
    setShowResignConfirm(false);
  }, [currentPlayer, resign]);

  const handleResignCancel = useCallback(() => {
    setShowResignConfirm(false);
  }, []);

  // Handlers for inline editing
  const handleMoveClick = useCallback(() => {
    setEditValue(String(moveNumber));
    setEditingMove(true);
  }, [moveNumber]);

  const handleBranchClick = useCallback(() => {
    setEditValue(String(branchInfo.currentIndex));
    setEditingBranch(true);
  }, [branchInfo.currentIndex]);

  const handleEditSubmit = useCallback(() => {
    const value = parseInt(editValue, 10);
    if (!isNaN(value) && value >= 0) {
      if (editingMove) {
        navigateToMove(value);
      } else if (editingBranch) {
        // Use enhanced branch switching that works even when deep in a branch
        switchToBranchIndex(value);
      }
    }
    setEditingMove(false);
    setEditingBranch(false);
  }, [editValue, editingMove, editingBranch, navigateToMove, switchToBranchIndex]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleEditSubmit();
      } else if (e.key === 'Escape') {
        setEditingMove(false);
        setEditingBranch(false);
      }
      e.stopPropagation(); // Prevent navigation shortcuts while editing
    },
    [handleEditSubmit]
  );

  const handleEditBlur = useCallback(() => {
    setEditingMove(false);
    setEditingBranch(false);
  }, []);

  return (
    <div className="board-controls">
      {/* Left: Black player info */}
      <div className="player-info player-black">
        <div
          className={`player-indicator ${currentPlayer === 1 ? 'active' : ''}`}
          style={{
            background: 'radial-gradient(circle at 35% 35%, #555 0%, #222 30%, #000 100%)',
            boxShadow: '0 2px 3px rgba(0, 0, 0, 0.4)',
          }}
        />
        <div className="player-details">
          <div className="player-name">
            {playerBlack}
            {rankBlack && <span className="player-rank"> ({rankBlack})</span>}
          </div>
          <div className="player-captures">
            {capturesBlack} {t('boardControls.captured')}
          </div>
        </div>
      </div>

      {/* Center: Navigation controls or Scoring controls */}
      <div className="navigation-section">
        {scoringMode ? (
          <div className="scoring-controls-row">
            <button
              onClick={clearDeadStones}
              title={t('scoring.clearAllDeadStones')}
              className="scoring-button"
            >
              {t('scoring.clear')}
            </button>
            <button
              onClick={autoEstimateDeadStones}
              disabled={isEstimating}
              title={t('scoring.autoEstimateDescription')}
              className="scoring-button scoring-auto"
            >
              {isEstimating ? (
                <>
                  <LuLoader size={18} className="spinner" />
                  {t('scoring.estimating')}
                </>
              ) : (
                <>
                  <LuCalculator size={18} />
                  {t('scoring.autoEstimate')}
                </>
              )}
            </button>
            <button
              onClick={toggleScoringMode}
              title={t('scoring.exitScoringMode')}
              className="scoring-button scoring-done"
            >
              <LuX size={18} />
              {t('scoring.done')}
            </button>
          </div>
        ) : (
          <>
            {/* Branch navigation row - works even when deep in a branch */}
            {branchInfo.hasBranches && (
              <div className="branch-controls-row">
                <button
                  onClick={() => switchBranch('previous')}
                  title={t('boardControls.previousBranch')}
                  className="branch-nav-button"
                >
                  <LuChevronDown size={14} />
                </button>
                {editingBranch ? (
                  <div className="branch-edit-container">
                    <input
                      ref={inputRef}
                      type="number"
                      min="1"
                      max={branchInfo.totalBranches}
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={handleEditBlur}
                      className="edit-input edit-input-small"
                    />
                    <span className="branch-total">/{branchInfo.totalBranches}</span>
                  </div>
                ) : (
                  <div
                    className="branch-info-display editable-value"
                    onClick={handleBranchClick}
                    title={
                      branchInfo.isAtFork
                        ? t('boardControls.clickToSetBranch')
                        : `${t('boardControls.clickToSetBranch')} (${t('boardControls.movesIntoBranch', { count: branchInfo.depthFromBranchRoot })})`
                    }
                  >
                    <span className="branch-label">{t('boardControls.branch')}</span>
                    <span className="branch-current">{branchInfo.currentIndex}</span>
                    <span className="branch-separator">/</span>
                    <span className="branch-total">{branchInfo.totalBranches}</span>
                    {!branchInfo.isAtFork && (
                      <span
                        className="branch-depth"
                        title={t('boardControls.movesIntoBranch', {
                          count: branchInfo.depthFromBranchRoot,
                        })}
                      >
                        +{branchInfo.depthFromBranchRoot}
                      </span>
                    )}
                    <LuCalculator className="edit-hint-icon" size={10} />
                  </div>
                )}
                <button
                  onClick={() => switchBranch('next')}
                  title={t('boardControls.nextBranch')}
                  className="branch-nav-button"
                >
                  <LuChevronUp size={14} />
                </button>
              </div>
            )}

            {/* Main navigation row */}
            <div className="main-nav-row">
              <button
                onClick={goToStart}
                disabled={!canGoBack}
                title={t('boardControls.goToStart')}
                className="nav-button"
              >
                <LuSkipBack size={20} />
              </button>
              <button
                onClick={() => goBackSteps(10)}
                disabled={!canGoBack}
                title={t('boardControls.goBack10')}
                className="nav-button"
              >
                <LuRewind size={20} />
              </button>
              <button
                onClick={goBack}
                disabled={!canGoBack}
                title={t('boardControls.previousMove')}
                className="nav-button"
              >
                <LuChevronLeft size={20} />
              </button>

              <div className="move-display">
                <div className="move-number">
                  {editingMove ? (
                    <input
                      ref={inputRef}
                      type="number"
                      min="0"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={handleEditKeyDown}
                      onBlur={handleEditBlur}
                      className="edit-input"
                    />
                  ) : (
                    <span
                      onClick={handleMoveClick}
                      className="editable-value move-number-display"
                      title={t('boardControls.clickToJumpMove')}
                    >
                      {t('boardControls.move')} {moveNumber} / {totalMovesInBranch}
                      <LuCalculator className="edit-hint-icon" size={10} />
                    </span>
                  )}
                </div>
                <div className="current-player">
                  <div
                    className="current-player-stone"
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background:
                        currentPlayer === 1
                          ? 'radial-gradient(circle at 30% 30%, #555 0%, #000 100%)'
                          : 'radial-gradient(circle at 30% 30%, #fff 0%, #f0f0f0 25%, #d5d5d5 60%, #bbb 100%)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
                      border:
                        currentPlayer === 1
                          ? '1px solid rgba(255,255,255,0.1)'
                          : '1px solid rgba(0,0,0,0.1)',
                    }}
                  />
                  {currentPlayer === 1 ? t('gameInfo.black') : t('gameInfo.white')}
                </div>
              </div>

              <button
                onClick={goForward}
                disabled={!canGoForward}
                title={t('boardControls.nextMove')}
                className="nav-button"
              >
                <LuChevronRight size={20} />
              </button>
              <button
                onClick={() => goForwardSteps(10)}
                disabled={!canGoForward}
                title={t('boardControls.goForward10')}
                className="nav-button"
              >
                <LuFastForward size={20} />
              </button>
              <button
                onClick={goToEnd}
                disabled={!canGoForward}
                title={t('boardControls.goToEnd')}
                className="nav-button"
              >
                <LuSkipForward size={20} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Right: White player info */}
      <div className="player-info player-white">
        <div className="player-details">
          <div className="player-name">
            {playerWhite}
            {rankWhite && <span className="player-rank"> ({rankWhite})</span>}
          </div>
          <div className="player-captures">
            {capturesWhite} {t('boardControls.captured')}
          </div>
        </div>
        <div
          className={`player-indicator ${currentPlayer === -1 ? 'active' : ''}`}
          style={{
            background:
              'radial-gradient(circle at 30% 30%, #fff 0%, #f0f0f0 25%, #d5d5d5 60%, #bbb 100%)',
            boxShadow: '0 2px 3px rgba(0, 0, 0, 0.3)',
          }}
        />
      </div>

      {/* Resign Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={showResignConfirm}
        title={t('boardControls.resignGame')}
        message={t('boardControls.resignConfirm', {
          player: currentPlayer === 1 ? t('gameInfo.black') : t('gameInfo.white'),
        })}
        confirmLabel={t('boardControls.resign')}
        cancelLabel={t('cancel')}
        onConfirm={handleResignConfirm}
        onCancel={handleResignCancel}
      />
    </div>
  );
});

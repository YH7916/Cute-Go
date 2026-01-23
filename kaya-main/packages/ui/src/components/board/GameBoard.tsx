/**
 * GameBoard Component
 *
 * Main Go game board integrated with GameTreeContext
 * Includes the board and control bar at the bottom
 */

import React, { useCallback, useRef, useEffect, useState, memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Goban } from '@kaya/shudan';
import type { Vertex, Sign, Marker } from '@kaya/shudan';
import {
  LuSkipForward,
  LuFlag,
  LuCalculator,
  LuGamepad2,
  LuPencil,
  LuBot,
  LuBrain,
  LuEye,
  LuEyeOff,
  LuMap,
  LuZap,
  LuSquare,
  LuTrash2,
  LuInfo,
  LuX,
  LuLayers,
  LuLoader,
  LuChevronDown,
  LuChevronUp,
} from 'react-icons/lu';
import { createPortal } from 'react-dom';
import { sgfToVertex } from '@kaya/sgf';
import { useGameSounds } from '../../useGameSounds';
import {
  useGameTreeBoard,
  useGameTreeActions,
  useGameTreeScore,
  useGameTreeAI,
  useGameTreeEdit,
  useGameTreeNavigation,
} from '../../contexts/selectors';
import { useBoardNavigation } from '../../contexts/BoardNavigationContext';
import { useFuzzyPlacement } from '../../useFuzzyPlacement';
import { useBoardSwipeNavigation } from '../../hooks/useSwipeGesture';
import { useIsTouchDevice, useLayoutMode } from '../../hooks/useMediaQuery';
import { useKeyboardShortcuts } from '../../contexts/KeyboardShortcutsContext';
import { BoardControls } from './BoardControls';
import { ScoreEstimator, type ScoreData } from './ScoreEstimator';
import { calculateTerritory, countDeadStones } from '../../services/scoring';
import { EditToolbar } from '../editors/EditToolbar';
import { useAIAnalysis } from '../ai/AIAnalysisOverlay';
import { useAIEngine } from '../../contexts/AIEngineContext';
import { useGameTree } from '../../contexts/GameTreeContext';
import { useToast } from '../ui/Toast';
import { parseGTPCoordinate } from '../../utils/gtpUtils';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';
import { AnalysisLegendModal } from '../analysis/AnalysisLegendModal';
import './GameBoard.css';

interface GameBoardProps {
  onScoreData?: (scoreData: ScoreData | null) => void;
}

export const GameBoard: React.FC<GameBoardProps> = memo(({ onScoreData }) => {
  const { t } = useTranslation();
  // Use optimized selectors instead of full useGameTree
  const {
    currentBoard,
    currentNode,
    nextMoveNode,
    markerMap,
    gameInfo,
    moveNumber,
    gameId,
    gameSettings,
    setGameSettings,
  } = useGameTreeBoard();
  const { playMove, resign, placeStoneDirect, removeSetupStone } = useGameTreeActions();
  const { scoringMode, deadStones, toggleDeadStones, toggleScoringMode, territoryMap } =
    useGameTreeScore();
  const { analysisMode, toggleAnalysisMode, showAnalysisBar, toggleShowAnalysisBar } =
    useGameTreeAI();
  const [showMoveStrengthInfo, setShowMoveStrengthInfo] = useState(false);
  const { editMode, toggleEditMode, editTool, editPlayMode, addMarker, removeMarker } =
    useGameTreeEdit();
  const { goBack, goForward, canGoBack, canGoForward } = useGameTreeNavigation();

  const { navigationMode, cursorX, cursorY, toggleNavigationMode, setActionHandler } =
    useBoardNavigation();
  const [vertexSize, setVertexSize] = useState<number>(28);
  const containerRef = useRef<HTMLDivElement>(null);
  const { soundEnabled, toggleSound, playSound } = useGameSounds();

  // Touch/swipe support
  const isTouch = useIsTouchDevice();
  const layoutMode = useLayoutMode();
  const isMobile = layoutMode === 'mobile';
  const swipeEnabled = isTouch && !scoringMode && !editMode;
  const swipeHandlers = useBoardSwipeNavigation(goBack, goForward, swipeEnabled);

  const [showNextMove, setShowNextMove] = useState(false);
  const [showResignConfirm, setShowResignConfirm] = useState(false);
  const [isGeneratingMove, setIsGeneratingMove] = useState(false);
  const [pendingSuggestMove, setPendingSuggestMove] = useState(false);

  // AI Move generation - get engine directly from AIEngineContext
  const { isModelLoaded } = useGameTree();
  const {
    engine: aiEngine,
    isEngineReady,
    isInitializing: isEngineInitializing,
    initializeEngine,
  } = useAIEngine();
  const { showToast } = useToast();

  const nextMove = useMemo(() => {
    if (!showNextMove || !nextMoveNode) return null;
    const moveData = nextMoveNode.data.B?.[0] || nextMoveNode.data.W?.[0];
    if (!moveData) return null;
    return sgfToVertex(moveData);
  }, [showNextMove, nextMoveNode]);

  const nextMovePlayer = useMemo(() => {
    if (!nextMoveNode) return undefined;
    return nextMoveNode.data.B ? 1 : -1;
  }, [nextMoveNode]);

  // AI Analysis integration
  const {
    heatMap,
    ownershipMap,
    showOwnership,
    toggleOwnership,
    showTopMoves,
    toggleTopMoves,
    isInitializing,
    isAnalyzing,
    error: analysisError,
    analysisResult,
    analyzeFullGame,
    stopFullGameAnalysis,
    isFullGameAnalyzing,
    isStopping,
    fullGameProgress,
    fullGameCurrentMove,
    fullGameTotalMoves,
    fullGameETA,
    allAnalyzedMessage,
    analysisCacheSize,
    clearAnalysisCache,
    pendingFullGameAnalysis,
    nativeUploadProgress,
    backendFallbackMessage,
  } = useAIAnalysis();

  const formatWinRate = useCallback((value?: number | null) => {
    if (value === null || value === undefined) return '—';
    return `${(value * 100).toFixed(1)}%`;
  }, []);

  const formatScoreLead = useCallback((value?: number | null) => {
    if (value === null || value === undefined) return '—';
    return value.toFixed(1);
  }, []);

  // Track last placed color for alternate mode
  // Start with white (-1) so first placement is black (1)
  const [lastPlacedColor, setLastPlacedColor] = useState<Sign>(-1);

  // Track dragging state for marker tools (drag to paint multiple markers)
  const [isDraggingMarker, setIsDraggingMarker] = useState(false);
  // Track visited vertices during drag to avoid re-processing the same vertex
  const draggedVerticesRef = useRef<Set<string>>(new Set());
  // Track if we handled marker in mousedown to prevent double-processing in click
  const handledInMouseDownRef = useRef(false);

  // Track board dimensions separately to detect changes
  const boardHeight = currentBoard.signMap.length;
  const boardWidth = currentBoard.signMap[0]?.length ?? boardHeight;

  // CRITICAL: Memoize signMap to prevent Goban re-renders
  // signMap changes reference every navigation, but content might be same
  const signMap = useMemo(() => currentBoard.signMap, [currentBoard]);

  // Fuzzy placement: Completely decoupled from board state
  // Maps are stable per game and never regenerate during play
  const fuzzyEnabled = gameSettings.fuzzyStonePlacement;
  const { shiftMap, randomMap } = useFuzzyPlacement({
    enabled: fuzzyEnabled,
    width: boardWidth,
    height: boardHeight,
    gameId,
  });

  // Determine whose turn it is
  // Check PL property first, then handicap, then alternate based on move number
  const currentPlayer: Sign = useMemo(() => {
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
      // So move 0 = White (-1), move 1 = Black (1), etc.
      return moveNumber % 2 === 0 ? -1 : 1;
    }

    // Default: Black plays first
    // move 0 = Black (1), move 1 = White (-1), etc.
    return moveNumber % 2 === 0 ? 1 : -1;
  }, [currentNode, gameInfo.handicap, moveNumber]);

  // Determine if we should show ghost stone (disable for non-stone edit tools)
  const shouldShowGhostStone = useMemo(() => {
    if (scoringMode) return false;
    if (editMode) {
      // Only show ghost stone for stone placement tools
      return editTool === 'black' || editTool === 'white' || editTool === 'alternate';
    }
    // In navigation mode, we still want to show the ghost stone at the cursor position
    // if it's a valid move, just like in normal mode (but controlled by cursor)
    return true;
  }, [scoringMode, editMode, editTool]);

  // Wrapper to toggle edit mode
  const handleToggleEditMode = useCallback(() => {
    toggleEditMode();
  }, [toggleEditMode]);

  // Toggle board controls visibility
  const handleToggleBoardControls = useCallback(() => {
    setGameSettings({ showBoardControls: !gameSettings.showBoardControls });
  }, [setGameSettings, gameSettings.showBoardControls]);

  // Determine ghost stone color based on mode and tool
  const ghostStonePlayer = useMemo((): Sign | undefined => {
    if (!shouldShowGhostStone) return undefined;

    if (editMode) {
      // Only show ghost stones for stone placement tools
      if (editTool === 'black') return 1; // Black is 1
      if (editTool === 'white') return -1; // White is -1
      if (editTool === 'alternate') {
        // In Setup Mode with alternate tool, show the next color
        return lastPlacedColor === -1 ? 1 : -1;
      }

      // No ghost stone for marker/label/erase tools
      return undefined;
    }

    // In both normal play and navigation mode, use the current player
    return currentPlayer;
  }, [shouldShowGhostStone, editMode, editTool, currentPlayer, lastPlacedColor]);

  // Determine ghost marker for marker tools in edit mode
  const ghostMarker = useMemo((): Marker | null => {
    if (scoringMode) {
      // In scoring mode, show no ghost marker (and no ghost stone)
      // We use a special 'none' type that renders nothing but prevents default ghost stone
      return { type: 'none' };
    }

    if (!editMode) return null;

    // Map edit tools to marker types
    switch (editTool) {
      case 'triangle':
        return { type: 'triangle' };
      case 'square':
        return { type: 'square' };
      case 'circle':
        return { type: 'circle' };
      case 'cross':
        return { type: 'cross' };
      case 'label-alpha':
        return { type: 'label', label: 'A' }; // Show "A" as preview
      case 'label-num':
        return { type: 'label', label: '1' }; // Show "1" as preview
      default:
        return null; // No ghost marker for other tools
    }
  }, [editMode, editTool, scoringMode]);

  // Helper function to place/toggle a marker at a vertex
  // For marker tools (triangle, square, circle, cross): toggle if same marker exists
  // If different marker exists, replace it with the new one (handled by addMarker)
  // For labels: always add (they auto-increment)
  const placeOrToggleMarker = useCallback(
    (vertex: Vertex, tool: string) => {
      const [x, y] = vertex;
      const existingMarker = markerMap?.[y]?.[x];

      // Check if it's a shape marker tool
      const isShapeMarker =
        tool === 'triangle' || tool === 'square' || tool === 'circle' || tool === 'cross';

      if (isShapeMarker && existingMarker?.type === tool) {
        // Same marker type exists: remove it (toggle off)
        removeMarker(vertex);
      } else {
        // Different marker or no marker: add the new marker
        // addMarker will automatically remove any existing marker of a different type
        addMarker(vertex, tool);
      }
    },
    [markerMap, addMarker, removeMarker]
  );

  // Set up action handler for navigation mode
  useEffect(() => {
    if (navigationMode) {
      const handler = () => {
        const vertex: Vertex = [cursorX, cursorY];
        const [x, y] = vertex;

        // Edit mode: use selected tool
        if (editMode) {
          switch (editTool) {
            case 'black':
              if (editPlayMode) {
                // Play mode: create new node with B move
                playMove(vertex, 1);
              } else {
                // Setup mode: modify current node with AB
                placeStoneDirect(vertex, 1);
              }
              playSound('move');
              break;
            case 'white':
              if (editPlayMode) {
                // Play mode: create new node with W move
                playMove(vertex, -1);
              } else {
                // Setup mode: modify current node with AW
                placeStoneDirect(vertex, -1);
              }
              playSound('move');
              break;
            case 'alternate': {
              // Alternate between black and white
              const nextColor = lastPlacedColor === -1 ? 1 : -1; // Toggle between white and black
              if (editPlayMode) {
                // Play mode: create new node
                playMove(vertex, nextColor);
              } else {
                // Setup mode: modify current node
                placeStoneDirect(vertex, nextColor);
              }
              setLastPlacedColor(nextColor);
              playSound('move');
              break;
            }
            case 'triangle':
            case 'square':
            case 'circle':
            case 'cross':
              placeOrToggleMarker(vertex, editTool);
              break;
            case 'label-alpha':
            case 'label-num':
              addMarker(vertex, editTool);
              break;
            case 'erase-marker':
              removeMarker(vertex);
              break;
          }
          return;
        }

        // Check if position is already occupied
        if (currentBoard.signMap[y]?.[x] !== 0) {
          return;
        }

        try {
          const analysis = currentBoard.analyzeMove(currentPlayer, vertex);

          // Check if move is legal
          if (!analysis.valid) {
            return;
          }

          const hasCaptured = analysis.capturing;

          // Play appropriate sound immediately for better responsiveness
          if (hasCaptured) {
            playSound('capture');
          } else {
            playSound('move');
          }

          // Play move
          playMove(vertex, currentPlayer);
        } catch (error) {
          console.error('Invalid move:', error);
        }
      };
      setActionHandler(() => handler);
    } else {
      setActionHandler(() => null);
    }
  }, [
    navigationMode,
    cursorX,
    cursorY,
    currentBoard,
    currentPlayer,
    playMove,
    playSound,
    setActionHandler,
    editMode,
    editTool,
    editPlayMode,
    lastPlacedColor,
    placeStoneDirect,
    addMarker,
    removeMarker,
    setLastPlacedColor,
    placeOrToggleMarker,
  ]);

  // Get last move from current node
  const lastMove: Vertex | null = React.useMemo(() => {
    if (!currentNode) return null;

    // Check for black move
    if (currentNode.data.B && currentNode.data.B[0]) {
      const coord = currentNode.data.B[0];
      if (coord.length === 2) {
        const x = coord.charCodeAt(0) - 97;
        const y = coord.charCodeAt(1) - 97;
        return [x, y];
      }
    }

    // Check for white move
    if (currentNode.data.W && currentNode.data.W[0]) {
      const coord = currentNode.data.W[0];
      if (coord.length === 2) {
        const x = coord.charCodeAt(0) - 97;
        const y = coord.charCodeAt(1) - 97;
        return [x, y];
      }
    }

    return null;
  }, [currentNode]);

  // Calculate optimal vertex size based on actual board dimensions
  // Recalculates when container resizes (window resize or layout changes)
  useEffect(() => {
    if (!containerRef.current) return;

    const calculateSize = (width: number, height: number) => {
      // Use actual board dimensions + margin for coordinates (if shown)
      // When coordinates are hidden, use the full space
      const coordMargin = gameSettings.showCoordinates ? 2 : 0;
      const divisionsX = Math.max(boardWidth + coordMargin, 1);
      const divisionsY = Math.max(boardHeight + coordMargin, 1);
      const maxVertexWidth = Math.floor(width / divisionsX);
      const maxVertexHeight = Math.floor(height / divisionsY);
      const newVertexSize = Math.min(maxVertexWidth, maxVertexHeight);
      return Math.max(newVertexSize, 10);
    };

    // Initial calculation
    const { width, height } = containerRef.current.getBoundingClientRect();
    setVertexSize(calculateSize(width, height));

    // Use ResizeObserver to handle container resizing
    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const newSize = calculateSize(width, height);
        setVertexSize(prev => (prev === newSize ? prev : newSize));
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [boardWidth, boardHeight, gameSettings.showCoordinates]);

  const handleVertexClick = useCallback(
    (evt: React.MouseEvent, vertex: Vertex) => {
      // Scoring mode: toggle dead stones for entire chain
      if (scoringMode) {
        const [x, y] = vertex;
        const sign = currentBoard.signMap[y]?.[x];
        if (sign !== 0) {
          // Get all stones in the same chain/group
          const chain = currentBoard.getChain(vertex);

          // Check if any stone in the chain is already marked as dead
          const key = `${x},${y}`;
          const isCurrentlyDead = deadStones.has(key);

          // Filter stones that need to be toggled
          const stonesToToggle = chain.filter(([cx, cy]: [number, number]) => {
            const chainKey = `${cx},${cy}`;
            // If group is dead (based on clicked stone), we want to revive (remove from deadStones)
            // So we only toggle stones that ARE in deadStones
            if (isCurrentlyDead) {
              return deadStones.has(chainKey);
            }
            // If group is alive, we want to kill (add to deadStones)
            // So we only toggle stones that are NOT in deadStones
            return !deadStones.has(chainKey);
          });

          if (stonesToToggle.length > 0) {
            toggleDeadStones(stonesToToggle);
          }
        }
        return;
      }

      // Edit mode: use selected tool
      if (editMode) {
        const [x, y] = vertex;

        switch (editTool) {
          case 'black':
            if (editPlayMode) {
              // Play mode: create new node with B move
              playMove(vertex, 1);
            } else {
              // Setup mode: modify current node with AB
              placeStoneDirect(vertex, 1);
            }
            playSound('move');
            break;
          case 'white':
            if (editPlayMode) {
              // Play mode: create new node with W move
              playMove(vertex, -1);
            } else {
              // Setup mode: modify current node with AW
              placeStoneDirect(vertex, -1);
            }
            playSound('move');
            break;
          case 'alternate': {
            // Alternate between black and white
            const nextColor = lastPlacedColor === -1 ? 1 : -1; // Toggle between white and black
            if (editPlayMode) {
              // Play mode: create new node
              playMove(vertex, nextColor);
            } else {
              // Setup mode: modify current node
              placeStoneDirect(vertex, nextColor);
            }
            setLastPlacedColor(nextColor);
            playSound('move');
            break;
          }
          case 'triangle':
          case 'square':
          case 'circle':
          case 'cross':
            // Skip if already handled in mousedown (for drag-to-paint)
            if (!handledInMouseDownRef.current) {
              placeOrToggleMarker(vertex, editTool);
            }
            handledInMouseDownRef.current = false;
            break;
          case 'label-alpha':
          case 'label-num':
            addMarker(vertex, editTool);
            break;
          case 'erase-marker':
            // Skip if already handled in mousedown (for drag-to-erase)
            if (!handledInMouseDownRef.current) {
              removeMarker(vertex);
            }
            handledInMouseDownRef.current = false;
            break;
        }
        return;
      }

      // Normal game mode: play move
      // Check if there's already a stone at this position
      const [x, y] = vertex;
      if (currentBoard.signMap[y]?.[x] !== 0) {
        // Position is already occupied, ignore the click
        return;
      }

      try {
        const analysis = currentBoard.analyzeMove(currentPlayer, vertex);

        // Check if the move is legal (not suicide, not ko)
        if (!analysis.valid) {
          // Invalid move, ignore silently
          return;
        }

        const hasCaptured = analysis.capturing;

        // Play sound immediately for better responsiveness
        if (hasCaptured) {
          playSound('capture');
        } else {
          playSound('move');
        }

        // Play move in game tree (will create variation if move already exists)
        playMove(vertex, currentPlayer);
      } catch (error) {
        console.error('Invalid move:', error);
        // Don't play error sound, just ignore invalid moves
      }
    },
    [
      currentBoard,
      currentPlayer,
      playMove,
      playSound,
      scoringMode,
      deadStones,
      editMode,
      editTool,
      editPlayMode,
      placeStoneDirect,
      addMarker,
      removeMarker,
      lastPlacedColor,
      setLastPlacedColor,
      placeOrToggleMarker,
    ]
  );

  const handlePass = useCallback(() => {
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

  // Core move generation logic (used by both manual trigger and auto-trigger)
  const executeGenerateMove = useCallback(async () => {
    if (!aiEngine || !isModelLoaded) return;

    setIsGeneratingMove(true);
    setPendingSuggestMove(false);
    try {
      // Get the current board state
      const signMap = currentBoard.signMap;

      // Determine whose turn it is (use existing currentPlayer from component scope)
      const nextToPlay = currentPlayer === 1 ? 'B' : 'W';

      const moveStr = await aiEngine.generateMove(signMap, {
        komi: gameInfo.komi ?? 7.5,
        nextToPlay,
      });

      // Parse the move and play it
      const vertex = parseGTPCoordinate(moveStr, currentBoard.width);

      if (vertex === null) {
        // PASS move
        playMove([-1, -1], currentPlayer);
      } else {
        // Valid coordinate move
        playMove(vertex, currentPlayer);
      }

      // Play sound after successful move
      playSound('move');
    } catch (error) {
      console.error('Failed to generate AI move:', error);
      showToast(t('gameboardActions.failedToGenerateMove'), 'error');
    } finally {
      setIsGeneratingMove(false);
    }
  }, [
    aiEngine,
    isModelLoaded,
    currentBoard,
    currentPlayer,
    gameInfo.komi,
    playMove,
    playSound,
    showToast,
    t,
  ]);

  // Handler for AI move suggestion (separate from analysis)
  // Note: This uses the same engine as analysis but doesn't affect:
  // - Analysis cache (no results stored)
  // - Win rate graph (no setAnalysisResult called)
  // - Analysis UI overlays (no ownership/heatmap updates)
  const handleSuggestMove = useCallback(async () => {
    if (!isModelLoaded) {
      showToast(t('gameboardActions.loadAiModelFirst'), 'error');
      return;
    }

    // If engine is ready, generate move immediately
    if (isEngineReady && aiEngine) {
      await executeGenerateMove();
      return;
    }

    // Engine not ready - queue the request and trigger initialization
    setPendingSuggestMove(true);
    setIsGeneratingMove(true);

    // Initialize the engine directly (no longer toggles analysisMode)
    initializeEngine();

    showToast(t('gameboardActions.initializingAiEngine'), 'info');
  }, [isModelLoaded, isEngineReady, aiEngine, executeGenerateMove, showToast, t, initializeEngine]);

  // Auto-trigger move generation when engine becomes available and a request is pending
  useEffect(() => {
    if (pendingSuggestMove && isEngineReady && aiEngine && isModelLoaded) {
      executeGenerateMove();
    }
  }, [pendingSuggestMove, isEngineReady, aiEngine, isModelLoaded, executeGenerateMove]);

  // Calculate score when in scoring mode
  const scoreData: ScoreData | null = useMemo(() => {
    if (!scoringMode) return null;

    const { blackTerritory, whiteTerritory } = calculateTerritory(currentBoard.signMap, deadStones);
    const { blackDeadStones, whiteDeadStones } = countDeadStones(currentBoard.signMap, deadStones);

    // Get captures from current board state
    const blackCaptures = currentBoard.getCaptures(1);
    const whiteCaptures = currentBoard.getCaptures(-1);
    const komi = gameInfo.komi || 6.5;

    return {
      blackTerritory,
      whiteTerritory,
      blackCaptures,
      whiteCaptures,
      blackDeadStones,
      whiteDeadStones,
      komi,
    };
  }, [scoringMode, currentBoard.signMap, currentBoard, deadStones, gameInfo.komi]);

  // Convert deadStones Set to Vertex array for Goban
  const dimmedVertices = useMemo(() => {
    if (!scoringMode) return [];
    const vertices: Vertex[] = [];
    deadStones.forEach(key => {
      const [x, y] = key.split(',').map(Number);
      vertices.push([x, y]);
    });
    return vertices;
  }, [scoringMode, deadStones]);

  // Notify parent of score data changes
  useEffect(() => {
    onScoreData?.(scoreData);
  }, [scoreData, onScoreData]);

  // Get keyboard shortcuts
  const { matchesShortcut, getBinding, bindingToDisplayString } = useKeyboardShortcuts();

  // Keyboard shortcuts for modes
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      // Board mode shortcuts
      if (matchesShortcut(e, 'board.toggleEditMode')) {
        handleToggleEditMode();
        return;
      }
      if (matchesShortcut(e, 'board.toggleNavigationMode')) {
        toggleNavigationMode();
        return;
      }
      if (matchesShortcut(e, 'board.toggleScoringMode')) {
        toggleScoringMode();
        return;
      }
      if (matchesShortcut(e, 'board.toggleAnalysis')) {
        toggleShowAnalysisBar();
        return;
      }
      if (matchesShortcut(e, 'board.toggleNextMove')) {
        setShowNextMove(prev => !prev);
        return;
      }

      // AI shortcuts
      if (matchesShortcut(e, 'ai.suggestMove')) {
        if (isModelLoaded && !scoringMode && !editMode && !isGeneratingMove) {
          handleSuggestMove();
        }
        return;
      }
      if (matchesShortcut(e, 'ai.toggleTopMoves')) {
        toggleTopMoves();
        return;
      }
      if (matchesShortcut(e, 'ai.toggleOwnership')) {
        toggleOwnership();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    handleToggleEditMode,
    toggleNavigationMode,
    toggleScoringMode,
    toggleShowAnalysisBar,
    setShowNextMove,
    currentBoard.signMap.length,
    isModelLoaded,
    scoringMode,
    editMode,
    isGeneratingMove,
    handleSuggestMove,
    toggleTopMoves,
    toggleOwnership,
    matchesShortcut,
  ]);

  // Check if current tool is a draggable marker tool
  const isMarkerTool = useCallback((tool: string) => {
    return (
      tool === 'triangle' ||
      tool === 'square' ||
      tool === 'circle' ||
      tool === 'cross' ||
      tool === 'erase-marker'
    );
  }, []);

  // Handle mouse down for drag-to-paint markers
  const handleVertexMouseDown = useCallback(
    (evt: React.MouseEvent, vertex: Vertex) => {
      // Only handle left mouse button (button 0) - ignore right-click (button 2) and middle-click (button 1)
      if (evt.button !== 0) return;
      // Only enable drag-to-paint for marker tools in edit mode
      if (!editMode || !isMarkerTool(editTool)) return;

      // Mark that we're handling this in mousedown to prevent double-processing in click
      handledInMouseDownRef.current = true;

      // Start dragging
      setIsDraggingMarker(true);
      draggedVerticesRef.current.clear();

      // Place/toggle marker at the initial vertex
      const key = `${vertex[0]},${vertex[1]}`;
      draggedVerticesRef.current.add(key);

      if (editTool === 'erase-marker') {
        removeMarker(vertex);
      } else {
        placeOrToggleMarker(vertex, editTool);
      }
    },
    [editMode, editTool, isMarkerTool, placeOrToggleMarker, removeMarker]
  );

  // Handle mouse move for drag-to-paint markers
  const handleVertexMouseMove = useCallback(
    (evt: React.MouseEvent, vertex: Vertex) => {
      // Only process if we're dragging and have a marker tool
      if (!isDraggingMarker || !editMode || !isMarkerTool(editTool)) return;

      const key = `${vertex[0]},${vertex[1]}`;

      // Skip if we've already processed this vertex in this drag operation
      if (draggedVerticesRef.current.has(key)) return;

      draggedVerticesRef.current.add(key);

      if (editTool === 'erase-marker') {
        removeMarker(vertex);
      } else {
        // During drag, also use toggle logic so dragging over existing markers removes them
        placeOrToggleMarker(vertex, editTool);
      }
    },
    [isDraggingMarker, editMode, editTool, isMarkerTool, placeOrToggleMarker, removeMarker]
  );

  // Handle mouse up to end drag (global listener)
  useEffect(() => {
    const handleMouseUp = () => {
      if (isDraggingMarker) {
        setIsDraggingMarker(false);
        draggedVerticesRef.current.clear();
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingMarker]);

  const handleVertexRightClick = useCallback(
    (evt: React.MouseEvent, vertex: Vertex) => {
      // Prevent default context menu
      evt.preventDefault();

      const [x, y] = vertex;
      const marker = markerMap?.[y]?.[x];
      const hasStone = currentBoard.signMap[y]?.[x] !== 0;

      if (editMode) {
        // Check if there's a marker at this vertex and remove it
        if (marker && marker.type !== 'setup') {
          // Remove marker (triangle, square, circle, cross, label)
          removeMarker(vertex);
          return;
        }

        // Only remove setup stone if there's actually a setup stone marker
        // This prevents adding AE property to empty positions
        if (marker?.type === 'setup' || hasStone) {
          removeSetupStone(vertex);
        }
        return;
      }

      // Not in edit mode: toggle cross marker
      if (marker && marker.type === 'cross') {
        // Remove existing cross marker
        removeMarker(vertex);
      } else {
        // Add cross marker (removes any other marker first)
        addMarker(vertex, 'cross');
      }
    },
    [editMode, currentBoard.signMap, removeSetupStone, removeMarker, addMarker, markerMap]
  );

  return (
    <div className="gameboard-container">
      {/* Action toolbar */}
      <div className="gameboard-actions-bar">
        <button
          onClick={handlePass}
          className="gameboard-action-button gameboard-pass-button"
          title={t('gameboardActions.pass')}
          disabled={scoringMode || editMode}
        >
          <LuSkipForward size={16} />
          <span className="btn-text">{t('gameboardActions.pass')}</span>
        </button>
        <button
          onClick={handleResign}
          className="gameboard-action-button gameboard-resign-button"
          title={t('gameboardActions.resign')}
          disabled={scoringMode || editMode}
        >
          <LuFlag size={16} />
          <span className="btn-text">{t('gameboardActions.resign')}</span>
        </button>
        <div className="gameboard-actions-spacer" />
        <button
          onClick={toggleScoringMode}
          className={`gameboard-action-button gameboard-score-button ${scoringMode ? 'active' : ''}`}
          title={
            scoringMode
              ? `${t('gameboardActions.exitScoringMode')} (${bindingToDisplayString(getBinding('board.toggleScoringMode'))})`
              : `${t('gameboardActions.enterScoringMode')} (${bindingToDisplayString(getBinding('board.toggleScoringMode'))})`
          }
        >
          <LuCalculator size={16} />
          <span className="btn-text">
            {scoringMode ? t('gameboardActions.scoring') : t('gameboardActions.score')}
          </span>
        </button>
        <button
          onClick={toggleShowAnalysisBar}
          className={`gameboard-action-button gameboard-analysis-button ${showAnalysisBar ? 'active' : ''}`}
          title={
            showAnalysisBar
              ? `${t('gameboardActions.hideAnalysis')} (${bindingToDisplayString(getBinding('board.toggleAnalysis'))})`
              : `${t('gameboardActions.showAnalysis')} (${bindingToDisplayString(getBinding('board.toggleAnalysis'))})`
          }
        >
          <LuBrain size={16} />
          <span className="btn-text">
            {showAnalysisBar ? t('gameboardActions.analysis') : t('gameboardActions.analyze')}
          </span>
        </button>
        <button
          onClick={toggleNavigationMode}
          className={`gameboard-action-button gameboard-navigation-button ${navigationMode ? 'active' : ''}`}
          title={
            navigationMode
              ? `${t('gameboardActions.exitNavigationMode')} (${bindingToDisplayString(getBinding('board.toggleNavigationMode'))})`
              : `${t('gameboardActions.enterNavigationMode')} (${bindingToDisplayString(getBinding('board.toggleNavigationMode'))})`
          }
        >
          <LuGamepad2 size={16} />
          <span className="btn-text">{t('gameboardActions.navigate')}</span>
        </button>
        <button
          onClick={handleToggleEditMode}
          className={`gameboard-action-button gameboard-edit-button ${editMode ? 'active' : ''}`}
          title={
            editMode
              ? `${t('gameboardActions.exitEditMode')} (${bindingToDisplayString(getBinding('board.toggleEditMode'))})`
              : `${t('gameboardActions.enterEditMode')} (${bindingToDisplayString(getBinding('board.toggleEditMode'))})`
          }
        >
          <LuPencil size={16} />
          <span className="btn-text">{t('gameboardActions.edit')}</span>
        </button>
        <button
          onClick={() => setShowNextMove(!showNextMove)}
          className={`gameboard-action-button gameboard-next-move-button ${showNextMove ? 'active' : ''}`}
          title={
            showNextMove
              ? `${t('gameboardActions.hideNextMove')} (${bindingToDisplayString(getBinding('board.toggleNextMove'))})`
              : `${t('gameboardActions.showNextMove')} (${bindingToDisplayString(getBinding('board.toggleNextMove'))})`
          }
        >
          {showNextMove ? <LuEyeOff size={16} /> : <LuEye size={16} />}
          <span className="btn-text">
            {showNextMove ? t('gameboardActions.hide') : t('gameboardActions.show')}
          </span>
        </button>
        {isModelLoaded && (
          <button
            onClick={handleSuggestMove}
            disabled={isGeneratingMove || scoringMode || editMode}
            className="gameboard-action-button gameboard-suggest-move-button"
            title={`${t('gameboardActions.suggestMoveTitle')} (${bindingToDisplayString(getBinding('ai.suggestMove'))})`}
          >
            {isGeneratingMove ? <LuLoader size={16} className="spinner" /> : <LuBot size={16} />}
            <span className="btn-text">
              {isGeneratingMove
                ? t('gameboardActions.suggesting')
                : t('gameboardActions.suggestMove')}
            </span>
          </button>
        )}
      </div>
      {(showAnalysisBar || isFullGameAnalyzing) && (
        <div className="ai-analysis-summary">
          {analysisError ? (
            <div className="ai-analysis-summary__error">
              <span>⚠️</span> {analysisError}
            </div>
          ) : (
            <div
              className="ai-analysis-summary__container"
              style={{ width: '100%', display: 'flex', flexDirection: 'column' }}
            >
              <div className="ai-analysis-summary__content">
                <div className="ai-analysis-summary__metrics-group">
                  {/* Loading/Analyzing indicator - always reserves space to prevent layout shift */}
                  <div
                    className="ai-analysis-summary__loading-indicator"
                    style={{
                      visibility: isInitializing || isAnalyzing ? 'visible' : 'hidden',
                    }}
                  >
                    <span className="ai-analysis-summary__spinner">⟳</span>
                    <span className="ai-analysis-summary__loading-text">
                      {isInitializing
                        ? nativeUploadProgress
                          ? nativeUploadProgress.stage === 'uploading'
                            ? t('analysisBar.uploadingModel', {
                                progress: nativeUploadProgress.progress,
                              })
                            : nativeUploadProgress.stage === 'checking-cache'
                              ? t('analysisBar.checkingCache')
                              : t('analysisBar.initializing')
                          : t('analysisBar.loading')
                        : t('analysisBar.analyzing')}
                    </span>
                  </div>
                  <div className="ai-analysis-summary__metric" style={{ minWidth: '90px' }}>
                    <span className="ai-analysis-summary__metric-value">
                      {formatWinRate(analysisResult?.winRate)}
                    </span>
                    <span className="ai-analysis-summary__metric-label">
                      {t('analysisBar.blackWinRate')}
                    </span>
                  </div>

                  <div className="ai-analysis-summary__separator" />

                  <div className="ai-analysis-summary__metric" style={{ minWidth: '70px' }}>
                    <span className="ai-analysis-summary__metric-value">
                      {analysisResult ? (
                        <>
                          {analysisResult.scoreLead >= 0 ? 'B+' : 'W+'}
                          {formatScoreLead(Math.abs(analysisResult.scoreLead))}
                        </>
                      ) : (
                        '—'
                      )}
                    </span>
                    <span className="ai-analysis-summary__metric-label">
                      {t('analysisBar.scoreLead')}
                    </span>
                  </div>
                </div>

                <div className="ai-analysis-summary__actions">
                  <button
                    className={`gameboard-action-button gameboard-heatmap-button ${showOwnership ? 'active' : ''}`}
                    title={`${t('analysis.toggleOwnership')} (${bindingToDisplayString(getBinding('ai.toggleOwnership'))})`}
                    onClick={toggleOwnership}
                    disabled={isInitializing}
                  >
                    <LuMap />
                  </button>
                  <button
                    className={`gameboard-action-button gameboard-topmoves-button ${showTopMoves ? 'active' : ''}`}
                    title={`${t('analysis.toggleTopMoves')} (${bindingToDisplayString(getBinding('ai.toggleTopMoves'))})`}
                    onClick={toggleTopMoves}
                    disabled={isInitializing}
                  >
                    <LuLayers />
                  </button>
                  <button
                    className={`gameboard-action-button ${isFullGameAnalyzing ? 'active analyzing' : ''}`}
                    title={
                      isFullGameAnalyzing
                        ? t('analysis.stopAnalysis')
                        : pendingFullGameAnalysis
                          ? t('analysis.waitingForEngine')
                          : t('analysisBar.analyzeFullGameLong')
                    }
                    onClick={isFullGameAnalyzing ? stopFullGameAnalysis : analyzeFullGame}
                    disabled={isInitializing || isStopping || pendingFullGameAnalysis}
                  >
                    {isFullGameAnalyzing ? <LuSquare /> : <LuZap />}
                  </button>
                  <button
                    className="gameboard-action-button gameboard-clear-cache-button"
                    title={
                      analysisCacheSize > 0
                        ? t('analysis.clearCacheWithCount', { count: analysisCacheSize })
                        : t('analysis.noCachedAnalysis')
                    }
                    onClick={clearAnalysisCache}
                    disabled={analysisCacheSize === 0 || isFullGameAnalyzing}
                  >
                    <LuTrash2 />
                  </button>
                  <button
                    className="gameboard-action-button"
                    title={t('analysis.analysisLegend')}
                    onClick={() => setShowMoveStrengthInfo(true)}
                  >
                    <LuInfo />
                  </button>
                </div>
              </div>
              <div className="ai-analysis-summary__progress-row">
                <span
                  className={`ai-analysis-summary__progress ${allAnalyzedMessage ? 'ai-analysis-summary__progress--success' : ''}`}
                  style={{
                    opacity: isFullGameAnalyzing || allAnalyzedMessage ? 1 : 0,
                    display: isFullGameAnalyzing || allAnalyzedMessage ? 'block' : 'none',
                  }}
                >
                  {isStopping
                    ? t('analysis.stopping')
                    : allAnalyzedMessage
                      ? `✓ ${allAnalyzedMessage}`
                      : isFullGameAnalyzing
                        ? `${fullGameCurrentMove}/${fullGameTotalMoves} (${fullGameProgress}%)${fullGameETA ? ` • ETA: ${fullGameETA}` : ''}`
                        : ''}
                </span>
                {backendFallbackMessage && (
                  <span
                    className="ai-analysis-summary__progress ai-analysis-summary__progress--warning"
                    style={{ display: 'block', opacity: 1 }}
                  >
                    ⚠️ {backendFallbackMessage}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="gameboard-board-area">
        <div
          ref={containerRef}
          className={`gameboard-board-wrapper ${!gameSettings.showCoordinates ? 'no-coordinates' : ''}`}
          {...swipeHandlers}
        >
          <Goban
            key={gameId}
            gameId={gameId}
            vertexSize={vertexSize}
            signMap={currentBoard.signMap}
            showCoordinates={gameSettings.showCoordinates}
            fuzzyStonePlacement={fuzzyEnabled}
            shiftMap={shiftMap}
            randomMap={randomMap}
            lastMove={lastMove}
            nextMove={nextMove}
            nextMovePlayer={nextMovePlayer}
            currentPlayer={ghostStonePlayer}
            onVertexClick={handleVertexClick}
            onVertexMouseDown={handleVertexMouseDown}
            onVertexMouseMove={handleVertexMouseMove}
            dimmedVertices={dimmedVertices}
            paintMap={territoryMap}
            markerMap={markerMap ?? undefined}
            cursorPosition={navigationMode ? [cursorX, cursorY] : null}
            ghostMarker={ghostMarker}
            heatMap={heatMap ?? undefined}
            ownershipMap={ownershipMap ?? undefined}
            onVertexRightClick={handleVertexRightClick}
          />
        </div>
        {editMode && <EditToolbar />}
      </div>

      {/* Collapse bar for board controls */}
      <button
        className="board-controls-collapse-bar"
        onClick={handleToggleBoardControls}
        title={
          gameSettings.showBoardControls
            ? t('gameboardActions.hideControls')
            : t('gameboardActions.showControls')
        }
      >
        {gameSettings.showBoardControls ? <LuChevronDown size={14} /> : <LuChevronUp size={14} />}
      </button>

      {gameSettings.showBoardControls && <BoardControls />}
      {isMobile && scoringMode && scoreData && (
        <div style={{ padding: '0.5rem', width: '100%' }}>
          <ScoreEstimator
            scoreData={scoreData}
            deadStones={deadStones}
            playerBlack={gameInfo.playerBlack}
            playerWhite={gameInfo.playerWhite}
            rankBlack={gameInfo.rankBlack}
            rankWhite={gameInfo.rankWhite}
          />
        </div>
      )}

      {/* Move Strength Info Modal */}
      <AnalysisLegendModal
        isOpen={showMoveStrengthInfo}
        onClose={() => setShowMoveStrengthInfo(false)}
      />

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

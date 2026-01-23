/**
 * @kaya/shudan - Minimal Go board rendering component
 *
 * TypeScript types - designed to be extensible for future Shudan features
 */

import type { CSSProperties, MouseEvent } from 'react';

/**
 * Vertex represents a position on the board as [x, y] coordinates
 * x: 0-18 for standard 19x19 board (0 = A, 18 = T)
 * y: 0-18 for standard 19x19 board (0 = top, 18 = bottom)
 */
export type Vertex = [x: number, y: number];

/**
 * Sign represents stone color or empty intersection
 * -1: White stone
 *  0: Empty intersection
 *  1: Black stone
 */
export type Sign = -1 | 0 | 1;

/**
 * SignMap is a 2D array representing the board state
 * signMap[y][x] gives the sign at position (x, y)
 */
export type SignMap = Sign[][];

/**
 * Map type for board overlays (markers, heat, etc)
 * Future: Will support Marker, GhostStone, HeatVertex, etc.
 */
export type BoardMap<T> = (T | null)[][];

/**
 * Marker interface
 * Supports all SGF marker types: MA (X), TR (triangle), CR (circle), SQ (square), LB (label)
 * Plus internal types: setup (green square for setup stones)
 */
export interface Marker {
  type?: 'circle' | 'cross' | 'triangle' | 'square' | 'point' | 'label' | 'setup' | 'none' | null;
  label?: string | null;
}

/**
 * Heat map vertex for AI analysis visualization
 */
export interface HeatVertex {
  strength: number; // 0-9, where 9 is strongest/best move
  text?: string | null; // Display text (e.g., "65.3%\n+2.5")
}

/**
 * Props for the main Goban component
 *
 * Current MVP features:
 * - Basic board rendering (grid, stones, coordinates)
 * - Click interaction
 * - Partial board display (rangeX/Y)
 *
 * Future expansion (reserved prop names):
 * - markerMap: BoardMap<Marker>
 * - ghostStoneMap, paintMap, heatMap
 * - fuzzyStonePlacement, animateStonePlacement
 * - dimmedVertices, selectedVertices
 * - lines (arrows/lines between points)
 */
export interface GobanProps {
  // DOM props
  id?: string;
  className?: string;
  style?: CSSProperties;

  // Board configuration
  /** Pixel size of each vertex (default: 24) */
  vertexSize?: number;

  /** Board state: 2D array of signs */
  signMap?: SignMap;

  /** Show coordinate labels (A-T, 1-19) */
  showCoordinates?: boolean;

  /** Custom function to render X coordinates (default: A-T) */
  coordX?: (x: number) => string | number;

  /** Custom function to render Y coordinates (default: 1-19 from bottom) */
  coordY?: (y: number) => string | number;

  /** Range of X coordinates to display (default: all) */
  rangeX?: [start: number, end: number];

  /** Range of Y coordinates to display (default: all) */
  rangeY?: [start: number, end: number];

  /** Last move played - will display a circular marker on this stone */
  lastMove?: Vertex | null;

  /** Next move in history/game tree - will display a square marker on this stone */
  nextMove?: Vertex | null;

  /** Player who will play the next move (for next move marker color) */
  nextMovePlayer?: Sign;

  /** Current player (for ghost stone color on hover) - default: 1 (black) */
  currentPlayer?: Sign;

  /** Vertices to display as dimmed (e.g., dead stones in scoring mode) */
  dimmedVertices?: Vertex[];

  /**
   * Territory probability map for scoring visualization
   * 2D array with values from -1 (white territory) to +1 (black territory)
   * null or 0 means neutral/uncertain
   */
  paintMap?: number[][] | null;

  /** Enable fuzzy stone placement - stones slightly off-grid for natural look */
  fuzzyStonePlacement?: boolean;

  /**
   * External fuzzy placement maps (optional - for architectural decoupling)
   * If provided, these maps will be used instead of internal generation
   * This allows parent components to manage map stability independently
   */
  shiftMap?: number[][] | null;
  randomMap?: number[][] | null;

  /** Unique ID for the current game - used to reset fuzzy placement when game changes */
  gameId?: string | number;

  /** Cursor position for keyboard/gamepad navigation mode */
  cursorPosition?: Vertex | null;

  /** Marker map for SGF markers (MA, TR, CR, SQ, LB) */
  markerMap?: BoardMap<Marker>;

  /** Ghost marker to show under cursor (for edit tools) */
  ghostMarker?: Marker | null;

  /** Heat map for AI move suggestions */
  heatMap?: BoardMap<HeatVertex>;

  /** Ownership map for AI territory visualization (-1 to 1) */
  ownershipMap?: number[][];

  /** Callback when a vertex is clicked */
  onVertexClick?: (evt: React.MouseEvent, vertex: Vertex) => void;

  /** Called when mouse button is released on a vertex */
  onVertexMouseUp?: (evt: React.MouseEvent, vertex: Vertex) => void;

  /** Called when mouse button is pressed on a vertex */
  onVertexMouseDown?: (evt: React.MouseEvent, vertex: Vertex) => void;

  /** Called when mouse moves over a vertex (for drag operations) */
  onVertexMouseMove?: (evt: React.MouseEvent, vertex: Vertex) => void;

  /** Called when a vertex is right-clicked (context menu) */
  onVertexRightClick?: (evt: React.MouseEvent, vertex: Vertex) => void;

  // =========================
  // Touch Event Handlers
  // =========================

  /** Called when touch starts on a vertex */
  onVertexTouchStart?: (evt: React.TouchEvent, vertex: Vertex) => void;

  /** Called when touch moves (with current vertex or null if outside board) */
  onVertexTouchMove?: (evt: React.TouchEvent, vertex: Vertex | null) => void;

  /** Called when touch ends (with final vertex or null if outside board) */
  onVertexTouchEnd?: (evt: React.TouchEvent, vertex: Vertex | null) => void;

  /** Called when touch is cancelled */
  onVertexTouchCancel?: (evt: React.TouchEvent) => void;

  // Reserved for future features (not implemented in MVP)
  // ghostStoneMap?: BoardMap<GhostStone>;
  // paintMap?: BoardMap<number>;
  // heatMap?: BoardMap<HeatVertex>;
  // selectedVertices?: Vertex[];
  // dimmedVertices?: Vertex[];
  // lines?: LineMarker[];
  // fuzzyStonePlacement?: boolean;
  // animateStonePlacement?: boolean;
  // busy?: boolean;
}

/**
 * Props for Grid component (internal)
 */
export interface GridProps {
  vertexSize: number;
  width: number;
  height: number;
  xs: number[]; // X coordinates to render
  ys: number[]; // Y coordinates to render
  hoshis: Vertex[]; // Star point positions
}

/**
 * Props for coordinate rendering components (internal)
 */
export interface CoordProps {
  style?: CSSProperties;
  xs?: number[];
  ys?: number[];
  height?: number;
  coordX?: (x: number) => string | number;
  coordY?: (y: number) => string | number;
}

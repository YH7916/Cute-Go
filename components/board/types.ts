import type React from 'react';
import type { BoardState, Player, GameType, GameMode, Point } from '../../types';

export interface GameBoardProps {
  board: BoardState;
  onIntersectionClick: (x: number, y: number) => void;
  onInspectPoint?: (x: number, y: number) => void;
  vibrate?: (pattern: number | number[]) => void;
  currentPlayer: Player;
  lastMove: { x: number; y: number } | null;
  showQi: boolean;
  qiOnHover?: boolean;
  gameType: GameType;
  gameMode?: GameMode; // Added
  showCoordinates?: boolean;
  stoneAnimationEnabled?: boolean;
  extraSVG?: React.ReactNode;
  extraSVGLayer?: 'background' | 'foreground';
  markedPoints?: readonly Point[];
  autoShowQiAt?: { x: number; y: number };
  territory?: Float32Array | null;
  showTerritory?: boolean;
  stoneSkin?: string;
  boardSkin?: string; // New
  separatePieces?: boolean; // New
}

export type ConnectionType = 'ortho' | 'loose';

export interface Connection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: Player;
  type: ConnectionType;
}

export interface QiSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  key: string;
}

export interface BoardGeometry {
  boardSize: number;
  CELL_SIZE: number;
  GRID_PADDING: number;
  STONE_RADIUS: number;
  boardPixelSize: number;
}

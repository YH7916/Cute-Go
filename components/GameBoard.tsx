import React, { useMemo } from 'react';
import { ZoomOut } from 'lucide-react';
import { getAllGroups } from '../core/board';
import { BOARD_THEMES, type BoardThemeId } from '../utils/themes';
import { calculateBoardConstants, getStarPoints } from './board/geometry';
import { getBoardConnections } from './board/connections';
import { getGroupFaces } from './board/faces';
import { useBoardInteraction } from './board/useBoardInteraction';
import {
  BoardGrid,
  BoardCoordinates,
  BoardIntersections,
  BoardTerritory,
  BoardQiFlow,
} from './board/BoardOverlays';
import { BoardStoneBody, BoardLooseSilk, BoardFaces } from './board/BoardStones';
import { BoardDefinitions } from './board/BoardDefinitions';
import { BoardAnimations } from './board/BoardAnimations';
import type { GameBoardProps } from './board/types';

export { calculateBoardConstants } from './board/geometry';

export const GameBoard: React.FC<GameBoardProps> = ({
  board,
  onIntersectionClick,
  onInspectPoint,
  vibrate,
  lastMove,
  showQi,
  qiOnHover,
  gameType,
  showCoordinates = false,
  stoneAnimationEnabled = true,
  extraSVG,
  extraSVGLayer = 'background',
  markedPoints,
  autoShowQiAt,
  territory,
  showTerritory,
  stoneSkin = 'classic',
  boardSkin = 'wood',
  separatePieces = false,
}) => {
  const boardSize = board.length;
  const { CELL_SIZE, GRID_PADDING } = useMemo(
    () => calculateBoardConstants(boardSize, showCoordinates),
    [boardSize, showCoordinates]
  );
  const STONE_RADIUS = CELL_SIZE * 0.45;
  const boardPixelSize = (boardSize - 1) * CELL_SIZE + GRID_PADDING * 2;
  const geometry = { boardSize, CELL_SIZE, GRID_PADDING, STONE_RADIUS, boardPixelSize };
  const {
    transform,
    setTransform,
    activeQiSegments,
    animatingStoneId,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMouseLeaveBoard,
    handleIntersectionClickWrapper,
    handleStoneHover,
  } = useBoardInteraction({
    board,
    lastMove,
    showQi,
    qiOnHover,
    showCoordinates,
    stoneAnimationEnabled,
    autoShowQiAt,
    onIntersectionClick,
    onInspectPoint,
    vibrate,
    boardPixelSize,
  });
  const connections = useMemo(() => getBoardConnections(board, gameType), [board, gameType]);
  const stones = useMemo(
    () => board.flatMap((row) => row.filter((stone) => stone !== null)),
    [board]
  );
  const groups = useMemo(() => getAllGroups(board), [board, gameType]);
  const markedIntersections = useMemo(
    () => new Set(markedPoints?.map(point => `${point.x},${point.y}`)), [markedPoints]
  );
  const groupFaces = useMemo(
    () => getGroupFaces(groups, stones, gameType, separatePieces)
      .filter(face => !markedIntersections.has(`${face.x},${face.y}`)),
    [groups, stones, gameType, separatePieces, markedIntersections]
  );
  const starPoints = useMemo(() => getStarPoints(boardSize), [boardSize]);

  return (
    <div
      className="relative flex justify-center items-center w-full h-full max-w-full aspect-square rounded-xl overflow-hidden border-4 border-[#b88742] bg-[#e3c086] touch-none shadow-xl"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseLeave={handleMouseLeaveBoard}
    >
      <BoardAnimations />
      <div
        className="w-full h-full relative transition-transform duration-75 ease-linear origin-center rounded-xl overflow-hidden shadow-2xl border-[6px]"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          borderColor: BOARD_THEMES[boardSkin as BoardThemeId]?.borderColor || '#8c6b38',
          backgroundColor: BOARD_THEMES[boardSkin as BoardThemeId]?.borderColor || '#8c6b38', // Fill gap
        }}
      >
        <div
          className="absolute inset-0 transition-all duration-300"
          style={{
            backgroundColor: BOARD_THEMES[boardSkin as BoardThemeId]?.background || '#e3c086',
            backgroundImage: BOARD_THEMES[boardSkin as BoardThemeId]?.backgroundImage,
            backgroundSize: BOARD_THEMES[boardSkin as BoardThemeId]?.backgroundSize,
            backgroundRepeat: 'repeat',
            zIndex: 0,
          }}
        />

        <svg
          viewBox={`0 0 ${boardPixelSize} ${boardPixelSize}`}
          className="relative z-10 w-full h-full select-none"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
          {extraSVGLayer === 'background' && extraSVG}
          <BoardDefinitions CELL_SIZE={CELL_SIZE} />

          <g>
            <BoardGrid {...geometry} />
          </g>
          <BoardTerritory
            {...geometry}
            board={board}
            showTerritory={showTerritory}
            territory={territory}
          />

          {/* 气流层放在网格之上，棋子之下 */}
          <BoardQiFlow {...geometry} showQi={showQi} activeQiSegments={activeQiSegments} />

          <BoardCoordinates {...geometry} showCoordinates={showCoordinates} />

          {starPoints.map(([x, y], i) => (
            <circle
              key={`star-${i}`}
              cx={GRID_PADDING + x * CELL_SIZE}
              cy={GRID_PADDING + y * CELL_SIZE}
              r={boardSize > 13 ? 2 : 3}
              fill="#5c4033"
            />
          ))}

          <BoardLooseSilk
            {...geometry}
            color="black"
            connections={connections}
            stoneSkin={stoneSkin}
            gameType={gameType}
            separatePieces={separatePieces}
          />
          <BoardLooseSilk
            {...geometry}
            color="white"
            connections={connections}
            stoneSkin={stoneSkin}
            gameType={gameType}
            separatePieces={separatePieces}
          />

          <BoardStoneBody
            {...geometry}
            color="black"
            stones={stones}
            connections={connections}
            stoneSkin={stoneSkin}
            gameType={gameType}
            separatePieces={separatePieces}
            animatingStoneId={animatingStoneId}
          />
          <BoardStoneBody
            {...geometry}
            color="white"
            stones={stones}
            connections={connections}
            stoneSkin={stoneSkin}
            gameType={gameType}
            separatePieces={separatePieces}
            animatingStoneId={animatingStoneId}
          />

          <BoardFaces {...geometry} groupFaces={groupFaces} stoneAnimationEnabled={stoneAnimationEnabled} />

          {lastMove && !markedIntersections.has(`${lastMove.x},${lastMove.y}`) && (
            <circle
              cx={GRID_PADDING + lastMove.x * CELL_SIZE + CELL_SIZE / 2 - CELL_SIZE * 0.15}
              cy={GRID_PADDING + lastMove.y * CELL_SIZE + CELL_SIZE / 2 - CELL_SIZE * 0.15}
              r={CELL_SIZE * 0.1}
              fill="#ff4444"
              className="animate-pulse"
              style={{ pointerEvents: 'none' }}
              transform={`translate(${-CELL_SIZE / 2 + CELL_SIZE * 0.15}, ${-CELL_SIZE / 2 + CELL_SIZE * 0.15})`}
            />
          )}

          {extraSVGLayer === 'foreground' && extraSVG}
          <g>
            <BoardIntersections
              {...geometry}
              handleIntersectionClickWrapper={handleIntersectionClickWrapper}
              handleStoneHover={handleStoneHover}
            />
          </g>
        </svg>
      </div>

      {transform.scale > 1.1 && (
        <button
          className="absolute bottom-2 right-2 bg-black/40 hover:bg-black/60 text-white p-2 rounded-full z-30 backdrop-blur-sm transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setTransform({ scale: 1, x: 0, y: 0 });
          }}
          aria-label="Reset Zoom"
        >
          <ZoomOut size={18} />
        </button>
      )}
    </div>
  );
};

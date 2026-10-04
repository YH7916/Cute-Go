import React from 'react';
import type { BoardState, Point } from '../../types';
import { calculateBoardConstants } from './geometry';

export function CoachMarkers({ points, board }: { points: Point[]; board: BoardState }) {
  const { CELL_SIZE, GRID_PADDING } = calculateBoardConstants(board.length, true);
  const ink = 'var(--cg-primary-dark, #5c4033)';
  const outline = 'var(--cg-wood-soft, #e6d5b8)';
  return <g pointerEvents="none" aria-label="陪练棋盘标记">
    {points.map((point, index) => {
      const stone = board[point.y]?.[point.x];
      const x = GRID_PADDING + point.x * CELL_SIZE, y = GRID_PADDING + point.y * CELL_SIZE;
      const stoneInk = stone?.color === 'black' ? '#fcf6ea' : '#303030';
      return <g key={`${point.x},${point.y}`}>
        {stone ? (points.length > 1
          ? <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={CELL_SIZE * 0.45}
            fontWeight="bold" fill={stoneInk} stroke={stone.color === 'black' ? '#303030' : '#f0f0f0'}
            strokeWidth={1} paintOrder="stroke">{index + 1}</text>
          : <circle cx={x} cy={y} r={CELL_SIZE * 0.2} fill="none" stroke={stoneInk} strokeWidth={2.5} />)
          : <>
            <circle cx={x} cy={y} r={CELL_SIZE * 0.42} fill="none" stroke={outline} strokeWidth={5.5} />
            <circle cx={x} cy={y} r={CELL_SIZE * 0.42} fill="none" stroke={ink} strokeWidth={3} />
            {points.length > 1 && <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
              fontSize={CELL_SIZE * 0.5} fontWeight="bold" fill={ink} stroke={outline}
              strokeWidth={3} paintOrder="stroke">{index + 1}</text>}
          </>}
      </g>;
    })}
  </g>;
}

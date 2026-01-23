/**
 * @kaya/shudan - Grid component
 *
 * Renders the SVG grid lines and hoshi (star) points
 */

import React, { useMemo } from 'react';
import type { GridProps } from './types';

export const Grid: React.FC<GridProps> = React.memo(
  ({ vertexSize, width, height, xs, ys, hoshis }) => {
    const contentSize = useMemo(
      () => ({
        width: width * vertexSize,
        height: height * vertexSize,
      }),
      [width, height, vertexSize]
    );

    const hoshiRadius = useMemo(() => Math.max(2, vertexSize / 8), [vertexSize]);

    // Add half vertex padding for proper grid rendering
    const halfVertex = vertexSize / 2;

    return (
      <svg
        className="shudan-grid"
        width={contentSize.width}
        height={contentSize.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
        }}
      >
        <g transform={`translate(${halfVertex}, ${halfVertex})`}>
          {/* Vertical grid lines */}
          {xs.map(x => (
            <line
              key={`v-${x}`}
              x1={x * vertexSize}
              y1={ys[0] * vertexSize}
              x2={x * vertexSize}
              y2={ys[ys.length - 1] * vertexSize}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.5}
            />
          ))}

          {/* Horizontal grid lines */}
          {ys.map(y => (
            <line
              key={`h-${y}`}
              x1={xs[0] * vertexSize}
              y1={y * vertexSize}
              x2={xs[xs.length - 1] * vertexSize}
              y2={y * vertexSize}
              stroke="currentColor"
              strokeWidth={1}
              opacity={0.5}
            />
          ))}

          {/* Hoshi (star) points */}
          {hoshis.map(
            ([x, y]) =>
              xs.includes(x) &&
              ys.includes(y) && (
                <circle
                  key={`hoshi-${x}-${y}`}
                  cx={x * vertexSize}
                  cy={y * vertexSize}
                  r={hoshiRadius}
                  fill="currentColor"
                  opacity={0.7}
                />
              )
          )}
        </g>
      </svg>
    );
  }
);

Grid.displayName = 'Grid';

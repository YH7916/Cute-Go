import React, { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import './AnalysisChart.css';

export interface AnalysisDataPoint {
  /** Move number in the branch (0 = root, 1 = first move, etc.) */
  moveNumber: number;
  /** Node ID for navigation */
  nodeId: number | string;
  /** Black's win rate (0-1) */
  blackWinRate: number;
  /** Score lead from Black's perspective (positive = Black ahead) */
  scoreLead: number;
}

export interface AnalysisChartProps {
  /** Array of data points to display */
  data: AnalysisDataPoint[];
  /** Current move number (for highlighting current position) */
  currentMoveNumber: number;
  /** Total moves in the branch (for x-axis range) */
  totalMoves: number;
  /** Callback when user clicks on a data point (with analysis data) */
  onNavigate?: (nodeId: number | string) => void;
  /** Callback when user clicks on any position (by move number) */
  onNavigateToMove?: (moveNumber: number) => void;
  /** Whether to show win rate line */
  showWinRate?: boolean;
  /** Whether to show score lead line */
  showScoreLead?: boolean;
  /** Callback when toggle changes */
  onToggleWinRate?: () => void;
  onToggleScoreLead?: () => void;
}

interface HoverInfo {
  x: number;
  y: number;
  moveNumber: number;
  dataPoint: AnalysisDataPoint | null;
}

/**
 * Custom SVG chart for displaying AI analysis results (win rate and score lead)
 * along the current game branch.
 */
export const AnalysisChart: React.FC<AnalysisChartProps> = ({
  data,
  currentMoveNumber,
  totalMoves,
  onNavigate,
  onNavigateToMove,
  showWinRate = true,
  showScoreLead = true,
  onToggleWinRate,
  onToggleScoreLead,
}) => {
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(400);

  // Fixed height, dynamic width based on container
  const chartHeight = 150;
  const padding = { top: 12, right: 36, bottom: 28, left: 40 };

  // Measure container width with ResizeObserver
  // Uses contentRect to avoid forced reflows (clientWidth triggers layout)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    // Initial measurement (only once on mount)
    const rect = wrapper.getBoundingClientRect();
    setContainerWidth(rect.width || 400);

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        if (width > 0) {
          setContainerWidth(width);
        }
      }
    });

    resizeObserver.observe(wrapper);

    return () => resizeObserver.disconnect();
  }, []);

  // Calculate chart dimensions based on actual container width
  const chartConfig = useMemo(() => {
    const width = containerWidth;
    const height = chartHeight;
    const innerWidth = width - padding.left - padding.right;
    const innerHeight = height - padding.top - padding.bottom;

    if (data.length === 0) {
      return {
        width,
        height,
        innerWidth,
        innerHeight,
        maxMove: totalMoves,
        // Symmetric score range so 0 is at center (aligns with 50% win rate)
        scoreRange: 20,
      };
    }

    // Use totalMoves for x-axis range (not just data points)
    const maxMove = Math.max(totalMoves, ...data.map(d => d.moveNumber));
    const scores = data.map(d => d.scoreLead);
    const maxAbsScore = Math.max(Math.abs(Math.min(...scores)), Math.abs(Math.max(...scores)), 10);

    // Make score range symmetric around 0 so it aligns with 50% win rate at center
    const scoreRange = Math.ceil(maxAbsScore * 1.1);

    return {
      width,
      height,
      innerWidth,
      innerHeight,
      maxMove,
      scoreRange,
    };
  }, [data, totalMoves, containerWidth, padding.left, padding.right, padding.top, padding.bottom]);

  // Scale functions
  const xScale = useCallback(
    (moveNumber: number): number => {
      if (chartConfig.maxMove === 0) return padding.left;
      return padding.left + (moveNumber / chartConfig.maxMove) * chartConfig.innerWidth;
    },
    [chartConfig.maxMove, chartConfig.innerWidth, padding.left]
  );

  // Win rate Y-axis padding: extend domain slightly below 0% and above 100%
  const winRatePadding = 0.05; // 5% padding on each side

  const winRateYScale = useCallback(
    (winRate: number): number => {
      // Win rate is 0-1, invert so 1 (100% Black) is at top
      // Add padding so the axis extends from -5% to 105%
      const paddedRange = 1 + 2 * winRatePadding; // 1.1 total range
      const normalized = (1 + winRatePadding - winRate) / paddedRange;
      return padding.top + normalized * chartConfig.innerHeight;
    },
    [chartConfig.innerHeight, padding.top, winRatePadding]
  );

  const scoreYScale = useCallback(
    (score: number): number => {
      // Score is symmetric around 0, which maps to center (same as 50% win rate)
      // scoreRange is the max absolute value, so range is [-scoreRange, +scoreRange]
      const normalized = (chartConfig.scoreRange - score) / (2 * chartConfig.scoreRange);
      return padding.top + normalized * chartConfig.innerHeight;
    },
    [chartConfig.scoreRange, chartConfig.innerHeight, padding.top]
  );

  // Use data directly (always Black's perspective - standard in Go analysis)

  // Generate path data for lines
  const winRatePath = useMemo(() => {
    if (data.length === 0 || !showWinRate) return '';
    const sortedData = [...data].sort((a, b) => a.moveNumber - b.moveNumber);
    return sortedData
      .map((d, i) => {
        const x = xScale(d.moveNumber);
        const y = winRateYScale(d.blackWinRate);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [data, showWinRate, xScale, winRateYScale]);

  const scoreLeadPath = useMemo(() => {
    if (data.length === 0 || !showScoreLead) return '';
    const sortedData = [...data].sort((a, b) => a.moveNumber - b.moveNumber);
    return sortedData
      .map((d, i) => {
        const x = xScale(d.moveNumber);
        const y = scoreYScale(d.scoreLead);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  }, [data, showScoreLead, xScale, scoreYScale]);

  // Handle mouse events - use actual pixel coordinates
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();
      // Direct pixel coordinates (no scaling needed)
      const mouseX = e.clientX - rect.left;

      // Calculate move number from X position (inverse of xScale)
      // xScale(moveNumber) = padding.left + (moveNumber / maxMove) * innerWidth
      // So: moveNumber = (mouseX - padding.left) / innerWidth * maxMove
      const innerX = mouseX - padding.left;
      const rawMoveNumber = (innerX / chartConfig.innerWidth) * chartConfig.maxMove;

      // Clamp to valid range and round to nearest integer
      const targetMoveNumber = Math.max(0, Math.min(totalMoves, Math.round(rawMoveNumber)));

      // Find if there's a data point at this move number
      const dataPoint = data.find(d => d.moveNumber === targetMoveNumber) ?? null;

      setHoverInfo({
        x: xScale(targetMoveNumber),
        y: 0,
        moveNumber: targetMoveNumber,
        dataPoint,
      });
    },
    [data, xScale, padding.left, chartConfig.innerWidth, chartConfig.maxMove, totalMoves]
  );

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null);
  }, []);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!hoverInfo) return;

      // If we have a data point with nodeId and onNavigate callback, use it
      if (hoverInfo.dataPoint && onNavigate) {
        onNavigate(hoverInfo.dataPoint.nodeId);
      }
      // Otherwise, use onNavigateToMove with the move number
      else if (onNavigateToMove) {
        onNavigateToMove(hoverInfo.moveNumber);
      }
    },
    [hoverInfo, onNavigate, onNavigateToMove]
  );

  // Generate axis ticks - limit to 5-6 ticks max to avoid overlapping
  const xTicks = useMemo(() => {
    if (chartConfig.maxMove === 0) return [];

    // Target 5-6 ticks max for readability
    const maxTicks = 5;

    // Calculate a nice round step size
    const rawStep = chartConfig.maxMove / maxTicks;
    // Round to nice values: 1, 2, 5, 10, 20, 50, 100, etc.
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const normalized = rawStep / magnitude;
    let niceStep: number;
    if (normalized <= 1) niceStep = magnitude;
    else if (normalized <= 2) niceStep = 2 * magnitude;
    else if (normalized <= 5) niceStep = 5 * magnitude;
    else niceStep = 10 * magnitude;

    // Generate ticks at nice intervals
    const ticks: number[] = [0];
    let tick = niceStep;
    while (tick < chartConfig.maxMove) {
      ticks.push(tick);
      tick += niceStep;
    }
    // Always include the last move
    if (ticks[ticks.length - 1] !== chartConfig.maxMove) {
      ticks.push(chartConfig.maxMove);
    }
    return ticks;
  }, [chartConfig.maxMove]);

  // Format score for display (always from Black's perspective)
  const formatScore = useCallback((score: number): string => {
    const absScore = Math.abs(score);
    // Positive score means Black ahead, negative means White ahead
    if (score > 0) return `B+${absScore.toFixed(1)}`;
    if (score < 0) return `W+${absScore.toFixed(1)}`;
    return '0';
  }, []);

  // Format win rate for display (always Black's win rate)
  const formatWinRate = useCallback((rate: number): string => {
    const pct = (rate * 100).toFixed(1);
    return `B: ${pct}%`;
  }, []);

  // Current position x coordinate (always calculated, not dependent on having data at that point)
  const currentX = useMemo(() => {
    if (currentMoveNumber < 0 || chartConfig.maxMove === 0) return null;
    return xScale(currentMoveNumber);
  }, [currentMoveNumber, chartConfig.maxMove, xScale]);

  // Find data point for current position (if analyzed)
  const currentData = useMemo(() => {
    return data.find(d => d.moveNumber === currentMoveNumber) ?? null;
  }, [data, currentMoveNumber]);

  return (
    <div className="analysis-chart-container">
      {/* Chart */}
      <div ref={wrapperRef} className="analysis-chart-wrapper">
        <svg
          ref={svgRef}
          className="analysis-chart-svg"
          width={chartConfig.width}
          height={chartConfig.height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
          style={{ cursor: hoverInfo ? 'pointer' : 'default' }}
        >
          {/* Background */}
          <rect
            x={padding.left}
            y={padding.top}
            width={chartConfig.innerWidth}
            height={chartConfig.innerHeight}
            className="chart-background"
          />

          {/* 50% line for win rate */}
          {showWinRate && (
            <line
              x1={padding.left}
              y1={winRateYScale(0.5)}
              x2={padding.left + chartConfig.innerWidth}
              y2={winRateYScale(0.5)}
              className="chart-midline"
            />
          )}

          {/* Zero line for score */}
          {showScoreLead && (
            <line
              x1={padding.left}
              y1={scoreYScale(0)}
              x2={padding.left + chartConfig.innerWidth}
              y2={scoreYScale(0)}
              className="chart-zeroline"
            />
          )}

          {/* Win rate line */}
          {showWinRate && <path d={winRatePath} className="chart-line winrate-line" />}

          {/* Score lead line */}
          {showScoreLead && <path d={scoreLeadPath} className="chart-line score-line" />}

          {/* Current position indicator */}
          {currentX !== null && (
            <line
              x1={currentX}
              y1={padding.top}
              x2={currentX}
              y2={padding.top + chartConfig.innerHeight}
              className="chart-current-line"
            />
          )}

          {/* Hover indicator */}
          {hoverInfo && (
            <>
              <line
                x1={hoverInfo.x}
                y1={padding.top}
                x2={hoverInfo.x}
                y2={padding.top + chartConfig.innerHeight}
                className="chart-hover-line"
              />
            </>
          )}

          {/* Y-Axis: Win Rate (left) */}
          {showWinRate && (
            <g className="axis axis-left">
              <line
                x1={padding.left}
                y1={padding.top}
                x2={padding.left}
                y2={padding.top + chartConfig.innerHeight}
                className="axis-line"
              />
              {/* 100% Black */}
              <text
                x={padding.left - 4}
                y={padding.top + 5}
                className="axis-label winrate-label-top"
              >
                100%
              </text>
              {/* 50% */}
              <text
                x={padding.left - 4}
                y={winRateYScale(0.5) + 4}
                className="axis-label winrate-label-mid"
              >
                50%
              </text>
              {/* 0% Black (100% White) */}
              <text
                x={padding.left - 4}
                y={padding.top + chartConfig.innerHeight}
                className="axis-label winrate-label-bottom"
              >
                0%
              </text>
              {/* Axis label */}
              <text
                x={8}
                y={padding.top + chartConfig.innerHeight / 2}
                className="axis-title winrate-axis-title"
                transform={`rotate(-90, 8, ${padding.top + chartConfig.innerHeight / 2})`}
              >
                Win Rate
              </text>
            </g>
          )}

          {/* Y-Axis: Score Lead (right) */}
          {showScoreLead && (
            <g className="axis axis-right">
              <line
                x1={padding.left + chartConfig.innerWidth}
                y1={padding.top}
                x2={padding.left + chartConfig.innerWidth}
                y2={padding.top + chartConfig.innerHeight}
                className="axis-line"
              />
              {/* Max score (Black ahead) */}
              <text
                x={padding.left + chartConfig.innerWidth + 4}
                y={padding.top + 5}
                className="axis-label score-label-value"
              >
                +{chartConfig.scoreRange}
              </text>
              {/* Zero */}
              <text
                x={padding.left + chartConfig.innerWidth + 4}
                y={scoreYScale(0) + 4}
                className="axis-label score-label-value"
              >
                0
              </text>
              {/* Min score (White ahead) */}
              <text
                x={padding.left + chartConfig.innerWidth + 4}
                y={padding.top + chartConfig.innerHeight}
                className="axis-label score-label-value"
              >
                -{chartConfig.scoreRange}
              </text>
              {/* Axis label */}
              <text
                x={chartConfig.width - 8}
                y={padding.top + chartConfig.innerHeight / 2}
                className="axis-title score-axis-title"
                transform={`rotate(90, ${chartConfig.width - 8}, ${padding.top + chartConfig.innerHeight / 2})`}
              >
                Score
              </text>
            </g>
          )}

          {/* X-Axis: Move number */}
          <g className="axis axis-bottom">
            <line
              x1={padding.left}
              y1={padding.top + chartConfig.innerHeight}
              x2={padding.left + chartConfig.innerWidth}
              y2={padding.top + chartConfig.innerHeight}
              className="axis-line"
            />
            {xTicks.map(tick => (
              <g key={tick}>
                <line
                  x1={xScale(tick)}
                  y1={padding.top + chartConfig.innerHeight}
                  x2={xScale(tick)}
                  y2={padding.top + chartConfig.innerHeight + 4}
                  className="axis-tick"
                />
                <text
                  x={xScale(tick)}
                  y={padding.top + chartConfig.innerHeight + 16}
                  className="axis-label axis-label-bottom"
                >
                  {tick}
                </text>
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* Current position info */}
      <div className="analysis-chart-current-info">
        <span className="current-move">Move {currentMoveNumber}</span>
        {currentData ? (
          <>
            <span className="current-winrate winrate-value">
              {formatWinRate(currentData.blackWinRate)}
            </span>
            <span
              className={`current-score ${
                currentData.scoreLead >= 0 ? 'score-positive' : 'score-negative'
              }`}
            >
              {formatScore(currentData.scoreLead)}
            </span>
          </>
        ) : (
          <span className="current-no-data">Not analyzed</span>
        )}
      </div>

      {/* Perspective note */}
      <div className="analysis-chart-perspective-note">
        <em>Win rate and score are from Black's perspective</em>
      </div>
    </div>
  );
};

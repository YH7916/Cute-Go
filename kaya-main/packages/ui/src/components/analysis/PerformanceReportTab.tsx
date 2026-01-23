/**
 * Performance Report Tab
 *
 * Displays game performance analysis with accuracy metrics,
 * move distribution, and key mistakes.
 */

import React, { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LuInfo, LuLoader } from 'react-icons/lu';
import { useGameTree } from '../../contexts/GameTreeContext';
import { useAIAnalysis } from '../ai/AIAnalysisOverlay';
import {
  createInitialAnalysisState,
  updateAnalysisState,
  generateAnalysisCacheKey,
} from '../../utils/aiAnalysis';
import { getPathToNode } from '../../utils/gameCache';
import {
  generatePerformanceReport,
  type PositionData as AIPositionData,
  type GameInfo as AIGameInfo,
  type GamePerformanceReport,
  type MoveCategory,
  type GamePhase,
  type MistakeInfo,
  type MoveDistribution,
  DEFAULT_PHASE_THRESHOLDS,
} from '@kaya/ai-engine';
import './PerformanceReportTab.css';

type PhaseFilter = 'entireGame' | GamePhase;

/**
 * Get the display color for a move category
 */
export function getCategoryColor(category: MoveCategory): string {
  switch (category) {
    case 'aiMove':
      return 'var(--category-ai-move, #4a9eff)';
    case 'good':
      return 'var(--category-good, #4caf50)';
    case 'inaccuracy':
      return 'var(--category-inaccuracy, #ffc107)';
    case 'mistake':
      return 'var(--category-mistake, #ff9800)';
    case 'blunder':
      return 'var(--category-blunder, #f44336)';
    default:
      return 'var(--text-secondary)';
  }
}

/**
 * Performance Report Tab Component
 */
export const PerformanceReportTab: React.FC = () => {
  const { t } = useTranslation();
  const { gameTree, currentNodeId, rootId, gameInfo, analysisCache, analysisCacheSize, navigate } =
    useGameTree();

  const { isFullGameAnalyzing, fullGameProgress, analyzeFullGame, isInitializing } =
    useAIAnalysis();

  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>('entireGame');

  // Generate the performance report from analysis cache
  const report = useMemo((): GamePerformanceReport | null => {
    if (!gameTree || rootId === null || rootId === undefined) {
      return null;
    }

    const boardSize = gameInfo.boardSize ?? 19;
    const komi = gameInfo.komi ?? 7.5;

    // Step 1: Get path from root to current node
    const pathToCurrentNode = getPathToNode(gameTree, currentNodeId ?? rootId);

    // Step 2: Extend from current node to end of branch (following first child)
    const fullPath: Array<{ id: number | string; data: any; children: any[] }> = [
      ...pathToCurrentNode,
    ];
    let lastNode = pathToCurrentNode[pathToCurrentNode.length - 1];

    while (lastNode && lastNode.children.length > 0) {
      const nextChild = lastNode.children[0];
      fullPath.push(nextChild);
      lastNode = nextChild;
    }

    if (fullPath.length <= 1) {
      return null; // No moves to analyze
    }

    // Build position data for each move
    const positions: AIPositionData[] = [];
    let analysisState = createInitialAnalysisState(boardSize);

    // First, compute all cache keys and get analysis results
    const analysisResults: (import('@kaya/ai-engine').AnalysisResult | null)[] = [];

    for (let i = 0; i < fullPath.length; i++) {
      const pathNode = fullPath[i];
      analysisState = updateAnalysisState(analysisState, pathNode as any, i);

      // Generate cache key for this position
      const cacheKey = generateAnalysisCacheKey(
        analysisState.board.signMap,
        analysisState.nextToPlay,
        komi,
        analysisState.history
      );

      const result = analysisCache.current.get(cacheKey) ?? null;
      analysisResults.push(result);
    }

    // Now build position data for each move (starting from move 1)
    analysisState = createInitialAnalysisState(boardSize);

    for (let i = 1; i < fullPath.length; i++) {
      const currNode = fullPath[i];
      const nodeData = currNode.data;

      // Update state to previous position first
      if (i === 1) {
        analysisState = updateAnalysisState(
          createInitialAnalysisState(boardSize),
          fullPath[0] as any,
          0
        );
      }

      // Determine player and move
      let player: 'B' | 'W' | null = null;
      let move: string | null = null;

      if (nodeData.B && nodeData.B[0]) {
        player = 'B';
        move = nodeData.B[0];
      } else if (nodeData.W && nodeData.W[0]) {
        player = 'W';
        move = nodeData.W[0];
      }

      if (!player || !move) {
        // Update state for non-move nodes
        analysisState = updateAnalysisState(analysisState, currNode as any, i);
        continue;
      }

      // Get analysis for position before move (previous node's result)
      const analysisBeforeMove = analysisResults[i - 1];

      // Update state to after this move
      analysisState = updateAnalysisState(analysisState, currNode as any, i);

      // Get analysis for position after move
      const analysisAfterMove = analysisResults[i];

      // Convert SGF move to GTP coordinate
      const gtpMove = sgfToGtp(move, boardSize);

      positions.push({
        moveNumber: i,
        nodeId: currNode.id,
        player,
        move: gtpMove,
        analysisBeforeMove,
        analysisAfterMove,
      });
    }

    if (positions.length === 0) {
      return null;
    }

    // Generate the report
    const gameInfoData: AIGameInfo = {
      blackPlayer: gameInfo.playerBlack ?? t('performanceReport.black'),
      whitePlayer: gameInfo.playerWhite ?? t('performanceReport.white'),
      boardSize,
      komi,
      result: gameInfo.result ?? '',
    };

    return generatePerformanceReport(positions, gameInfoData);
  }, [gameTree, rootId, currentNodeId, gameInfo, analysisCache, analysisCacheSize, t]);

  // Get filtered stats based on phase
  const filteredStats = useMemo(() => {
    if (!report) return null;

    if (phaseFilter === 'entireGame') {
      return {
        black: report.black,
        white: report.white,
      };
    }

    // Get phase-specific stats
    const blackPhase = report.black.byPhase[phaseFilter];
    const whitePhase = report.white.byPhase[phaseFilter];

    if (!blackPhase && !whitePhase) {
      return null;
    }

    return {
      black: blackPhase,
      white: whitePhase,
    };
  }, [report, phaseFilter]);

  // Get filtered key mistakes based on phase
  const filteredKeyMistakes = useMemo(() => {
    if (!report) return [];

    if (phaseFilter === 'entireGame') {
      return report.keyMistakes;
    }

    // Get phase thresholds
    const boardSize = gameInfo.boardSize ?? 19;
    const thresholds = DEFAULT_PHASE_THRESHOLDS[boardSize] ?? DEFAULT_PHASE_THRESHOLDS[19];

    // Filter mistakes by phase based on move number
    return report.keyMistakes.filter(mistake => {
      const moveNum = mistake.moveNumber;
      switch (phaseFilter) {
        case 'opening':
          return moveNum <= thresholds.openingEnd;
        case 'middleGame':
          return moveNum > thresholds.openingEnd && moveNum <= thresholds.middleGameEnd;
        case 'endGame':
          return moveNum > thresholds.middleGameEnd;
        default:
          return true;
      }
    });
  }, [report, phaseFilter, gameInfo.boardSize]);

  // Handle clicking on a mistake to navigate
  const handleMistakeClick = useCallback(
    (nodeId: string | number) => {
      navigate(nodeId);
    },
    [navigate]
  );

  // Check if we have enough analysis data
  const hasAnalysisData = report && report.analyzedMoves > 0;
  const analysisPercentage = report
    ? Math.round((report.analyzedMoves / report.totalMoves) * 100)
    : 0;

  // Loading state
  if (isInitializing) {
    return (
      <div className="performance-report-tab">
        <div className="performance-report-placeholder">
          <LuLoader className="performance-report-spinner" />
          <p>{t('analysis.initializingEngine')}</p>
        </div>
      </div>
    );
  }

  // No data state
  if (!hasAnalysisData) {
    return (
      <div className="performance-report-tab">
        <div className="performance-report-placeholder">
          <LuInfo size={32} />
          <p>{t('performanceReport.noAnalysisData')}</p>
          <p className="performance-report-hint">{t('performanceReport.runAnalysisHint')}</p>
          {!isFullGameAnalyzing && (
            <button
              className="performance-report-analyze-button"
              onClick={analyzeFullGame}
              disabled={isInitializing}
            >
              {t('analysis.analyzeFullGame')}
            </button>
          )}
          {isFullGameAnalyzing && (
            <div className="performance-report-progress">
              <span>
                {t('analysis.analyzingProgress', { progress: Math.round(fullGameProgress) })}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="performance-report-tab">
      {/* Analysis status */}
      {!report.analysisComplete && (
        <div className="performance-report-status">
          <span>
            {t('performanceReport.partialAnalysis', {
              analyzed: report.analyzedMoves,
              total: report.totalMoves,
              percentage: analysisPercentage,
            })}
          </span>
        </div>
      )}

      {/* Phase filter tabs */}
      <div className="performance-report-phase-tabs">
        <button
          className={`phase-tab ${phaseFilter === 'entireGame' ? 'active' : ''}`}
          onClick={() => setPhaseFilter('entireGame')}
          tabIndex={-1}
        >
          {t('performanceReport.entireGame')}
        </button>
        <button
          className={`phase-tab ${phaseFilter === 'opening' ? 'active' : ''}`}
          onClick={() => setPhaseFilter('opening')}
          disabled={!report.black.byPhase.opening && !report.white.byPhase.opening}
          tabIndex={-1}
        >
          {t('performanceReport.opening')}
        </button>
        <button
          className={`phase-tab ${phaseFilter === 'middleGame' ? 'active' : ''}`}
          onClick={() => setPhaseFilter('middleGame')}
          disabled={!report.black.byPhase.middleGame && !report.white.byPhase.middleGame}
          tabIndex={-1}
        >
          {t('performanceReport.middleGame')}
        </button>
        <button
          className={`phase-tab ${phaseFilter === 'endGame' ? 'active' : ''}`}
          onClick={() => setPhaseFilter('endGame')}
          disabled={!report.black.byPhase.endGame && !report.white.byPhase.endGame}
          tabIndex={-1}
        >
          {t('performanceReport.endGame')}
        </button>
      </div>

      {/* Player comparison */}
      <div className="performance-report-comparison">
        {/* Black player */}
        <div className="player-stats player-black">
          <div className="player-header">
            <span className="player-stone black" />
            <span className="player-name">{report.blackPlayer}</span>
          </div>
          {filteredStats?.black && (
            <>
              <div className="stat-row">
                <span className="stat-label">{t('performanceReport.accuracy')}</span>
                <span className="stat-value accuracy-value">
                  {filteredStats.black.accuracy.toFixed(1)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t('performanceReport.top5Percent')}</span>
                <span className="stat-value">{filteredStats.black.top5Percentage.toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>

        {/* White player */}
        <div className="player-stats player-white">
          <div className="player-header">
            <span className="player-stone white" />
            <span className="player-name">{report.whitePlayer}</span>
          </div>
          {filteredStats?.white && (
            <>
              <div className="stat-row">
                <span className="stat-label">{t('performanceReport.accuracy')}</span>
                <span className="stat-value accuracy-value">
                  {filteredStats.white.accuracy.toFixed(1)}%
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-label">{t('performanceReport.top5Percent')}</span>
                <span className="stat-value">{filteredStats.white.top5Percentage.toFixed(1)}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Move distribution */}
      {filteredStats?.black?.distribution && filteredStats?.white?.distribution && (
        <div className="performance-report-distribution">
          <h4 className="distribution-title">{t('performanceReport.moveDistribution')}</h4>
          <div className="distribution-comparison">
            {/* Black distribution */}
            <div className="distribution-column">
              <DistributionBars distribution={filteredStats.black.distribution} align="right" />
            </div>
            {/* Labels */}
            <div className="distribution-labels">
              <div className="distribution-label" style={{ color: getCategoryColor('aiMove') }}>
                {t('performanceReport.aiMove')}
              </div>
              <div className="distribution-label" style={{ color: getCategoryColor('good') }}>
                {t('performanceReport.good')}
              </div>
              <div className="distribution-label" style={{ color: getCategoryColor('inaccuracy') }}>
                {t('performanceReport.inaccuracy')}
              </div>
              <div className="distribution-label" style={{ color: getCategoryColor('mistake') }}>
                {t('performanceReport.mistake')}
              </div>
              <div className="distribution-label" style={{ color: getCategoryColor('blunder') }}>
                {t('performanceReport.blunder')}
              </div>
            </div>
            {/* White distribution */}
            <div className="distribution-column">
              <DistributionBars distribution={filteredStats.white.distribution} align="left" />
            </div>
          </div>
        </div>
      )}

      {/* Key mistakes */}
      {filteredKeyMistakes.length > 0 && (
        <div className="performance-report-mistakes">
          <h4 className="mistakes-title">{t('performanceReport.keyMistakes')}</h4>
          <div className="mistakes-list">
            {filteredKeyMistakes.slice(0, 5).map((mistake: MistakeInfo, index: number) => (
              <button
                key={index}
                className="mistake-item"
                onClick={() => handleMistakeClick(mistake.nodeId)}
              >
                <span className="mistake-move-number">
                  {t('performanceReport.moveNumber', { number: mistake.moveNumber })}
                </span>
                <span className={`mistake-player ${mistake.player === 'B' ? 'black' : 'white'}`}>
                  (
                  {mistake.player === 'B'
                    ? t('performanceReport.blackShort')
                    : t('performanceReport.whiteShort')}
                  )
                </span>
                <span
                  className="mistake-category"
                  style={{ color: getCategoryColor(mistake.category) }}
                >
                  {mistake.moveRank > 0
                    ? t('performanceReport.rankN', { n: mistake.moveRank })
                    : t(`performanceReport.${mistake.category}`)}
                </span>
                <span className="mistake-moves">
                  {mistake.playedMove} → {mistake.bestMove}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Distribution bars component
 */
interface DistributionBarsProps {
  distribution: {
    aiMove: number;
    good: number;
    inaccuracy: number;
    mistake: number;
    blunder: number;
    total: number;
  };
  align: 'left' | 'right';
}

const DistributionBars: React.FC<DistributionBarsProps> = ({ distribution, align }) => {
  const categories: MoveCategory[] = ['aiMove', 'good', 'inaccuracy', 'mistake', 'blunder'];
  const maxCount = Math.max(
    distribution.aiMove,
    distribution.good,
    distribution.inaccuracy,
    distribution.mistake,
    distribution.blunder,
    1 // Prevent division by zero
  );

  return (
    <div className={`distribution-bars ${align}`}>
      {categories.map((category: MoveCategory) => {
        const count = distribution[category as keyof MoveDistribution] as number;
        const percentage = distribution.total > 0 ? (count / distribution.total) * 100 : 0;
        const barWidth = (count / maxCount) * 100;

        return (
          <div key={category} className="distribution-bar-row">
            <div
              className="distribution-bar"
              style={{
                width: `${barWidth}%`,
                backgroundColor: getCategoryColor(category),
              }}
            />
            <span className="distribution-count">
              {count} ({percentage.toFixed(0)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
};

/**
 * Convert SGF coordinate to GTP coordinate
 */
function sgfToGtp(sgf: string, boardSize: number): string {
  if (!sgf || sgf.length < 2) return 'pass';

  const x = sgf.charCodeAt(0) - 97; // 'a' = 0
  const y = sgf.charCodeAt(1) - 97;

  if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
    return 'pass';
  }

  // GTP uses letters A-T (skipping I) for columns, numbers 1-19 for rows
  // SGF (0,0) is top-left, GTP A1 is bottom-left
  const gtpX = x < 8 ? String.fromCharCode(65 + x) : String.fromCharCode(66 + x); // Skip 'I'
  const gtpY = boardSize - y;

  return `${gtpX}${gtpY}`;
}

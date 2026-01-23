/**
 * ScoreEstimator Component
 *
 * Displays score estimation with territory and dead stones count
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import './ScoreEstimator.css';

export interface ScoreData {
  blackTerritory: number;
  whiteTerritory: number;
  blackCaptures: number;
  whiteCaptures: number;
  blackDeadStones: number;
  whiteDeadStones: number;
  komi: number;
}

interface ScoreEstimatorProps {
  scoreData: ScoreData;
  deadStones: Set<string>;
  playerBlack?: string;
  playerWhite?: string;
  rankBlack?: string;
  rankWhite?: string;
}

export const ScoreEstimator: React.FC<ScoreEstimatorProps> = ({
  scoreData,
  deadStones,
  playerBlack = 'Black',
  playerWhite = 'White',
  rankBlack,
  rankWhite,
}) => {
  const { t } = useTranslation();

  const finalScore = useMemo(() => {
    const {
      blackTerritory,
      whiteTerritory,
      blackCaptures,
      whiteCaptures,
      blackDeadStones,
      whiteDeadStones,
      komi,
    } = scoreData;

    // Black score = territory + captures + white dead stones
    const blackScore = blackTerritory + blackCaptures + whiteDeadStones;

    // White score = territory + captures + black dead stones + komi
    const whiteScore = whiteTerritory + whiteCaptures + blackDeadStones + komi;

    const difference = blackScore - whiteScore;
    const winner = difference > 0 ? 'Black' : difference < 0 ? 'White' : 'Jigo';
    const margin = Math.abs(difference);

    return {
      blackScore,
      whiteScore,
      winner,
      margin,
    };
  }, [scoreData]);

  return (
    <div className="score-estimator">
      <div className="score-estimator-content">
        <div className="score-section">
          <div className="score-player black">
            <div className="score-player-name">
              {playerBlack}
              {rankBlack && <span className="score-player-rank"> ({rankBlack})</span>}
            </div>
            <div className="score-breakdown">
              <div className="score-item" title={t('scoring.territoryBlackTitle')}>
                <span className="score-label">{t('scoring.territory')}</span>
                <span className="score-value">{scoreData.blackTerritory}</span>
              </div>
              <div className="score-item" title={t('scoring.capturesBlackTitle')}>
                <span className="score-label">{t('scoring.captures')}</span>
                <span className="score-value">{scoreData.blackCaptures}</span>
              </div>
              <div className="score-item" title={t('scoring.deadStonesBlackTitle')}>
                <span className="score-label">{t('scoring.deadStones')}</span>
                <span className="score-value">{scoreData.whiteDeadStones}</span>
              </div>
              <div className="score-item" style={{ visibility: 'hidden' }}>
                <span className="score-label">&nbsp;</span>
                <span className="score-value">&nbsp;</span>
              </div>
            </div>
            <div className="score-total">
              <span className="score-label">{t('scoring.total')}</span>
              <span className="score-value">{finalScore.blackScore}</span>
            </div>
          </div>

          <div className="score-player white">
            <div className="score-player-name">
              {playerWhite}
              {rankWhite && <span className="score-player-rank"> ({rankWhite})</span>}
            </div>
            <div className="score-breakdown">
              <div className="score-item" title={t('scoring.territoryWhiteTitle')}>
                <span className="score-label">{t('scoring.territory')}</span>
                <span className="score-value">{scoreData.whiteTerritory}</span>
              </div>
              <div className="score-item" title={t('scoring.capturesWhiteTitle')}>
                <span className="score-label">{t('scoring.captures')}</span>
                <span className="score-value">{scoreData.whiteCaptures}</span>
              </div>
              <div className="score-item" title={t('scoring.deadStonesWhiteTitle')}>
                <span className="score-label">{t('scoring.deadStones')}</span>
                <span className="score-value">{scoreData.blackDeadStones}</span>
              </div>
              <div className="score-item" title={t('scoring.komiTitle')}>
                <span className="score-label">{t('scoring.komi')}</span>
                <span className="score-value">{scoreData.komi}</span>
              </div>
            </div>
            <div className="score-total">
              <span className="score-label">{t('scoring.total')}</span>
              <span className="score-value">{finalScore.whiteScore}</span>
            </div>
          </div>
        </div>

        <div className="score-result">
          {finalScore.winner === 'Jigo' ? (
            <div className="score-winner">{t('scoring.jigo')}</div>
          ) : (
            <div className="score-winner">
              {t('scoring.winsBy', { player: finalScore.winner, points: finalScore.margin })}
            </div>
          )}
        </div>

        <div className="score-info">
          <p>{t('scoring.clickToToggle')}</p>
          <p className="score-dead-count">
            {t('scoring.markedAsDead', { count: deadStones.size })}
          </p>
        </div>
      </div>
    </div>
  );
};

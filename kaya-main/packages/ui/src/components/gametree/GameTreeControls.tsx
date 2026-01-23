import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuLocate } from 'react-icons/lu';
import './GameTreeControls.css';

interface GameTreeControlsProps {
  horizontal: boolean;
  onToggleLayout: () => void;
  showMinimap: boolean;
  onToggleMinimap: () => void;
  onCenterOnCurrentNode?: () => void;
}

const MinimapIcon: React.FC<{ active: boolean }> = ({ active }) => (
  <svg
    className="game-tree-control-icon"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    aria-hidden="true"
  >
    <rect
      x="1.5"
      y="1.5"
      width="13"
      height="13"
      rx="2"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    />
    <rect
      x="4.25"
      y="4.25"
      width="7.5"
      height="7.5"
      fill="currentColor"
      fillOpacity={active ? 0.6 : 0.35}
      stroke="none"
    />
    <path
      d="M4.25 8H11.75"
      stroke="var(--bg-primary, #0f1318)"
      strokeOpacity="0.45"
      strokeWidth="0.75"
    />
    <path
      d="M8 4.25V11.75"
      stroke="var(--bg-primary, #0f1318)"
      strokeOpacity="0.45"
      strokeWidth="0.75"
    />
  </svg>
);

export const GameTreeControls: React.FC<GameTreeControlsProps> = ({
  horizontal,
  onToggleLayout,
  showMinimap,
  onToggleMinimap,
  onCenterOnCurrentNode,
}) => {
  const { t } = useTranslation();

  return (
    <div className="game-tree-controls">
      <button
        type="button"
        onClick={onToggleLayout}
        className="game-tree-control-btn"
        title={horizontal ? t('gameTree.switchToVertical') : t('gameTree.switchToHorizontal')}
      >
        {horizontal ? '↕' : '↔'}
      </button>
      <button
        type="button"
        onClick={onToggleMinimap}
        className={`game-tree-control-btn ${showMinimap ? 'active' : ''}`}
        title={showMinimap ? t('gameTree.hideMinimap') : t('gameTree.showMinimap')}
        aria-pressed={showMinimap}
      >
        <MinimapIcon active={showMinimap} />
      </button>
      {onCenterOnCurrentNode && (
        <button
          type="button"
          onClick={onCenterOnCurrentNode}
          className="game-tree-control-btn"
          title={t('gameTree.centerOnPosition')}
          aria-label={t('gameTree.centerOnPosition')}
        >
          <LuLocate size={16} />
        </button>
      )}
    </div>
  );
};

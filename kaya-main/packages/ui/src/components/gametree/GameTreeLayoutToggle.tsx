/**
 * GameTreeLayoutToggle - Buttons to control game tree layout and centering
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuArrowLeftRight, LuArrowUpDown, LuLocate } from 'react-icons/lu';
import './GameTreeLayoutToggle.css';

interface GameTreeLayoutToggleProps {
  horizontal: boolean;
  onToggle: () => void;
  onCenterOnCurrentNode?: () => void;
}

export const GameTreeLayoutToggle: React.FC<GameTreeLayoutToggleProps> = ({
  horizontal,
  onToggle,
  onCenterOnCurrentNode,
}) => {
  const { t } = useTranslation();

  return (
    <div className="game-tree-layout-toggle-group">
      <button
        onClick={onToggle}
        className="game-tree-layout-toggle"
        title={horizontal ? t('gameTree.switchToVertical') : t('gameTree.switchToHorizontal')}
        aria-label={horizontal ? t('gameTree.switchToVertical') : t('gameTree.switchToHorizontal')}
      >
        {horizontal ? <LuArrowUpDown size={16} /> : <LuArrowLeftRight size={16} />}
      </button>
      {onCenterOnCurrentNode && (
        <button
          onClick={onCenterOnCurrentNode}
          className="game-tree-layout-toggle"
          title={t('gameTree.centerOnPosition')}
          aria-label={t('gameTree.centerOnPosition')}
        >
          <LuLocate size={16} />
        </button>
      )}
    </div>
  );
};

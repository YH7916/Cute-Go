/**
 * MobileTabBar Component
 *
 * Bottom navigation tabs for mobile layout
 * Provides quick access to: Board, Game Tree, Game Info, Analysis
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  LuLayoutGrid,
  LuGitBranch,
  LuInfo,
  LuBrain,
  LuMessageSquare,
  LuLibrary,
} from 'react-icons/lu';
import './MobileTabBar.css';

export type MobileTab = 'board' | 'tree' | 'info' | 'analysis' | 'library';

interface MobileTabBarProps {
  activeTab: MobileTab;
  onTabChange: (tab: MobileTab) => void;
  /** Show analysis tab (only when AI is available) */
  showAnalysis?: boolean;
  /** Badge count for comments (optional) */
  commentBadge?: number;
}

interface TabConfig {
  id: MobileTab;
  label: string;
  icon: React.ReactNode;
}

export const MobileTabBar: React.FC<MobileTabBarProps> = ({
  activeTab,
  onTabChange,
  showAnalysis = true,
  commentBadge,
}) => {
  const { t } = useTranslation();

  const tabs: TabConfig[] = [
    {
      id: 'board',
      label: t('mobileTab.board'),
      icon: <LuLayoutGrid size={20} />,
    },
    {
      id: 'info',
      label: t('mobileTab.info'),
      icon: <LuInfo size={20} />,
    },
    {
      id: 'tree',
      label: t('mobileTab.tree'),
      icon: <LuGitBranch size={20} />,
    },
  ];

  if (showAnalysis) {
    tabs.push({
      id: 'analysis',
      label: t('mobileTab.analysis'),
      icon: <LuBrain size={20} />,
    });
  }

  tabs.push({
    id: 'library',
    label: t('mobileTab.library'),
    icon: <LuLibrary size={20} />,
  });

  return (
    <nav className="mobile-tab-bar" role="tablist">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`mobile-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={tab.label}
        >
          <span className="mobile-tab-icon">
            {tab.icon}
            {tab.id === 'info' && commentBadge && commentBadge > 0 && (
              <span className="mobile-tab-badge">{commentBadge > 9 ? '9+' : commentBadge}</span>
            )}
          </span>
          <span className="mobile-tab-label">{tab.label}</span>
        </button>
      ))}
    </nav>
  );
};

MobileTabBar.displayName = 'MobileTabBar';

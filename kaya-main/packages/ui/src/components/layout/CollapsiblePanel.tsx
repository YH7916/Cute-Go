/**
 * CollapsiblePanel - Panel with collapsible header
 *
 * Allows clicking on header to collapse/expand the panel
 */

import React, { useState } from 'react';
import { LuChevronDown, LuChevronRight } from 'react-icons/lu';
import './CollapsiblePanel.css';

interface CollapsiblePanelProps {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultCollapsed?: boolean;
  headerActions?: React.ReactNode;
}

export const CollapsiblePanel: React.FC<CollapsiblePanelProps> = ({
  title,
  children,
  defaultCollapsed = false,
  headerActions,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const handleHeaderClick = (e: React.MouseEvent) => {
    // Don't toggle if clicking on action buttons
    if ((e.target as HTMLElement).closest('.panel-header-actions')) {
      return;
    }
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className={`collapsible-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="panel-header" onClick={handleHeaderClick}>
        <div className="panel-header-left">
          <div className="panel-collapse-icon">
            {isCollapsed ? <LuChevronRight size={14} /> : <LuChevronDown size={14} />}
          </div>
          <h3 className="panel-title">{title}</h3>
        </div>
        {headerActions && (
          <div className="panel-header-actions" onClick={e => e.stopPropagation()}>
            {headerActions}
          </div>
        )}
      </div>
      {!isCollapsed && <div className="panel-content">{children}</div>}
    </div>
  );
};

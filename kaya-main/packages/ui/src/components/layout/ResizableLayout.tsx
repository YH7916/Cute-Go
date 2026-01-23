import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import {
  LuLibrary,
  LuPanelRight,
  LuChevronDown,
  LuChevronRight,
  LuGitBranch,
  LuInfo,
  LuMessageSquare,
  LuChartLine,
  LuLayoutGrid,
  LuBrain,
} from 'react-icons/lu';
import { useLayoutMode, useOrientation } from '../../hooks/useMediaQuery';
import { MobileTabBar, type MobileTab } from './MobileTabBar';
import './ResizableLayout.css';

// Storage keys for panel visibility
const STORAGE_KEY = 'kaya-sidebar-panels';
const LEFT_PANEL_STORAGE_KEY = 'kaya-left-panels';

interface SidebarPanelVisibility {
  gameTree: boolean;
  gameInfo: boolean;
  comment: boolean;
}

interface LeftPanelVisibility {
  library: boolean;
  analysisGraph: boolean;
}

const DEFAULT_VISIBILITY: SidebarPanelVisibility = {
  gameTree: true,
  gameInfo: true,
  comment: true,
};

const DEFAULT_LEFT_VISIBILITY: LeftPanelVisibility = {
  library: true,
  analysisGraph: true,
};

interface ResizableLayoutProps {
  libraryContent?: React.ReactNode;
  analysisGraphContent?: React.ReactNode;
  boardContent?: React.ReactNode;
  gameTreeContent?: React.ReactNode;
  gameInfoContent?: React.ReactNode;
  commentContent?: React.ReactNode;
  gameTreeHeaderActions?: React.ReactNode;
  gameInfoHeaderActions?: React.ReactNode;
  commentHeaderActions?: React.ReactNode;
  showLibrary?: boolean;
  showSidebar?: boolean;
  onToggleLibrary?: () => void;
  onToggleSidebar?: () => void;
  /** Controlled active tab for mobile */
  activeMobileTab?: MobileTab;
  /** Callback for mobile tab change */
  onMobileTabChange?: (tab: MobileTab) => void;
}

const CollapsibleSectionHeader: React.FC<{
  title: string;
  icon: React.ReactNode;
  isVisible: boolean;
  onToggle: () => void;
  headerActions?: React.ReactNode;
}> = ({ title, icon, isVisible, onToggle, headerActions }) => {
  return (
    <div className="sidebar-section-header collapsible-header">
      <button
        className="collapse-toggle"
        onClick={onToggle}
        title={isVisible ? `Hide ${title} ` : `Show ${title} `}
      >
        {isVisible ? <LuChevronDown size={14} /> : <LuChevronRight size={14} />}
        <span className="section-icon">{icon}</span>
        <h3>{title}</h3>
      </button>
      {isVisible && headerActions && <div className="sidebar-section-actions">{headerActions}</div>}
    </div>
  );
};

export const ResizableLayout: React.FC<ResizableLayoutProps> = ({
  libraryContent,
  analysisGraphContent,
  boardContent,
  gameTreeContent,
  gameInfoContent,
  commentContent,
  gameTreeHeaderActions,
  gameInfoHeaderActions,
  commentHeaderActions,
  showLibrary = false,
  showSidebar = true,
  onToggleLibrary,
  onToggleSidebar,
  activeMobileTab,
  onMobileTabChange,
}) => {
  const { t } = useTranslation();

  // Detect layout mode (mobile/tablet/desktop)
  const layoutMode = useLayoutMode();
  const orientation = useOrientation();
  // Treat tablet as mobile for layout purposes (use tabs instead of panels)
  const isMobile = layoutMode === 'mobile' || layoutMode === 'tablet';
  const isLandscape = orientation === 'landscape';

  // Mobile tab state (controlled or uncontrolled)
  const [internalActiveTab, setInternalActiveTab] = useState<MobileTab>('board');
  const activeTab = activeMobileTab ?? internalActiveTab;
  const handleTabChange = onMobileTabChange ?? setInternalActiveTab;

  // Load initial visibility from localStorage (right sidebar)
  const [panelVisibility, setPanelVisibility] = useState<SidebarPanelVisibility>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_VISIBILITY, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_VISIBILITY;
  });

  // Load initial visibility for left panel sections
  const [leftPanelVisibility, setLeftPanelVisibility] = useState<LeftPanelVisibility>(() => {
    try {
      const saved = localStorage.getItem(LEFT_PANEL_STORAGE_KEY);
      if (saved) {
        return { ...DEFAULT_LEFT_VISIBILITY, ...JSON.parse(saved) };
      }
    } catch {
      // Ignore parse errors
    }
    return DEFAULT_LEFT_VISIBILITY;
  });

  // Save visibility to localStorage
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(panelVisibility));
  }, [panelVisibility]);

  useEffect(() => {
    localStorage.setItem(LEFT_PANEL_STORAGE_KEY, JSON.stringify(leftPanelVisibility));
  }, [leftPanelVisibility]);

  const togglePanel = useCallback((panel: keyof SidebarPanelVisibility) => {
    setPanelVisibility(prev => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  const toggleLeftPanel = useCallback((panel: keyof LeftPanelVisibility) => {
    setLeftPanelVisibility(prev => ({ ...prev, [panel]: !prev[panel] }));
  }, []);

  // Count visible panels for sizing (right sidebar)
  const visiblePanelCount = [
    panelVisibility.gameTree,
    panelVisibility.gameInfo,
    panelVisibility.comment,
  ].filter(Boolean).length;

  // Calculate default sizes based on visible panels
  // Game Tree: 50%, Game Info: 35%, Comment: 15% when all visible
  const getDefaultSize = (isVisible: boolean, panelName?: 'gameTree' | 'gameInfo' | 'comment') => {
    if (!isVisible) return 0;
    if (visiblePanelCount === 1) return 100;
    if (visiblePanelCount === 2) {
      // When 2 panels visible, give them roughly equal space
      return 50;
    }
    // All 3 panels visible: Game Tree 50%, Game Info 35%, Comment 15%
    switch (panelName) {
      case 'gameTree':
        return 50;
      case 'gameInfo':
        return 35;
      case 'comment':
        return 15;
      default:
        return 100 / visiblePanelCount;
    }
  };

  // Count visible left panels for sizing
  const visibleLeftPanelCount = [
    leftPanelVisibility.library,
    leftPanelVisibility.analysisGraph,
  ].filter(Boolean).length;

  const getLeftPanelSize = (isVisible: boolean) => {
    if (!isVisible) return 0;
    // Library gets more space by default (60/40 split)
    return isVisible ? (visibleLeftPanelCount === 2 ? 60 : 100) : 0;
  };

  // =========================
  // Mobile Layout
  // =========================
  if (isMobile) {
    const renderMobileContent = () => {
      return (
        <>
          {/* Board Panel - always rendered, hidden if not active */}
          <div
            className="mobile-panel mobile-board-panel"
            style={{ display: activeTab === 'board' ? 'flex' : 'none' }}
          >
            <div className="mobile-panel-content">{boardContent}</div>
          </div>

          {/* Info Panel */}
          <div
            className="mobile-panel mobile-info-panel"
            style={{ display: activeTab === 'info' ? 'flex' : 'none' }}
          >
            <div className="mobile-panel-header">
              <LuInfo size={16} />
              <span>Game Info</span>
            </div>
            <div className="mobile-panel-content mobile-info-content">
              <div className="mobile-info-section">
                {gameInfoContent || <div className="placeholder">Game Info</div>}
              </div>
              <div className="mobile-comment-section">
                <div className="mobile-section-title">
                  <LuMessageSquare size={14} />
                  <span>Comments</span>
                </div>
                {commentContent || <div className="placeholder">Comments</div>}
              </div>
            </div>
          </div>

          {/* Tree Panel */}
          <div
            className="mobile-panel mobile-tree-panel"
            style={{ display: activeTab === 'tree' ? 'flex' : 'none' }}
          >
            <div className="mobile-panel-header">
              <LuGitBranch size={16} />
              <span>Game Tree</span>
            </div>
            <div className="mobile-panel-content">
              {gameTreeContent || <div className="placeholder">Game Tree</div>}
            </div>
          </div>

          {/* AI Analysis Panel */}
          {analysisGraphContent && (
            <div
              className="mobile-panel mobile-analysis-panel"
              style={{ display: activeTab === 'analysis' ? 'flex' : 'none' }}
            >
              <div className="mobile-panel-header">
                <LuBrain size={16} />
                <span>Analysis</span>
              </div>
              <div className="mobile-panel-content">{analysisGraphContent}</div>
            </div>
          )}

          {/* Library Panel */}
          <div
            className="mobile-panel mobile-library-panel"
            style={{ display: activeTab === 'library' ? 'flex' : 'none' }}
          >
            <div className="mobile-panel-header">
              <LuLibrary size={16} />
              <span>Library</span>
            </div>
            <div className="mobile-panel-content">
              {libraryContent || <div className="placeholder">Library</div>}
            </div>
          </div>
        </>
      );
    };

    return (
      <div className={`mobile-layout ${isLandscape ? 'mobile-landscape' : 'mobile-portrait'} `}>
        <div className="mobile-layout-content">{renderMobileContent()}</div>
        <MobileTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          showAnalysis={!!analysisGraphContent}
        />
      </div>
    );
  }

  // =========================
  // Desktop/Tablet Layout
  // =========================
  return (
    <PanelGroup
      direction="horizontal"
      id="main-layout"
      autoSaveId="kaya-main-layout"
      className="panel-group"
    >
      {/* Left panel (Library + Analysis Graph) - always rendered when content exists */}
      {(libraryContent || analysisGraphContent) && (
        <>
          {showLibrary ? (
            <Panel
              id="left-panel"
              order={1}
              defaultSize={25}
              minSize={10}
              maxSize={50}
              className="panel left-panel-container"
            >
              <PanelGroup
                direction="vertical"
                id="left-panel-group"
                autoSaveId="kaya-left-panel-group"
              >
                {/* Library Section */}
                {leftPanelVisibility.library && libraryContent ? (
                  <>
                    <Panel
                      id="library-section"
                      order={1}
                      defaultSize={getLeftPanelSize(leftPanelVisibility.library)}
                      minSize={15}
                      className="panel library-section"
                    >
                      <div className="left-panel-section">
                        <CollapsibleSectionHeader
                          title={t('panels.library')}
                          icon={<LuLibrary size={14} />}
                          isVisible={leftPanelVisibility.library}
                          onToggle={() => toggleLeftPanel('library')}
                        />
                        <div className="left-panel-section-content">{libraryContent}</div>
                      </div>
                    </Panel>
                    {leftPanelVisibility.analysisGraph && analysisGraphContent && (
                      <PanelResizeHandle className="resize-handle resize-handle-horizontal" />
                    )}
                  </>
                ) : libraryContent ? (
                  <div className="collapsed-section-bar">
                    <CollapsibleSectionHeader
                      title={t('panels.library')}
                      icon={<LuLibrary size={14} />}
                      isVisible={false}
                      onToggle={() => toggleLeftPanel('library')}
                    />
                  </div>
                ) : null}

                {/* Analysis Graph Section */}
                {leftPanelVisibility.analysisGraph && analysisGraphContent ? (
                  <Panel
                    id="analysis-graph-section"
                    order={2}
                    defaultSize={visibleLeftPanelCount === 2 ? 40 : 100}
                    minSize={15}
                    className="panel analysis-graph-section"
                  >
                    <div className="left-panel-section">
                      <CollapsibleSectionHeader
                        title={t('panels.analysis')}
                        icon={<LuChartLine size={14} />}
                        isVisible={leftPanelVisibility.analysisGraph}
                        onToggle={() => toggleLeftPanel('analysisGraph')}
                      />
                      <div className="left-panel-section-content">{analysisGraphContent}</div>
                    </div>
                  </Panel>
                ) : analysisGraphContent ? (
                  <div className="collapsed-section-bar">
                    <CollapsibleSectionHeader
                      title={t('panels.analysis')}
                      icon={<LuChartLine size={14} />}
                      isVisible={false}
                      onToggle={() => toggleLeftPanel('analysisGraph')}
                    />
                  </div>
                ) : null}
              </PanelGroup>
            </Panel>
          ) : (
            <div
              className="library-collapsed-indicator"
              onClick={onToggleLibrary}
              title={t('panels.showLibrary')}
            >
              <LuLibrary size={16} />
            </div>
          )}
          {showLibrary && <PanelResizeHandle className="resize-handle resize-handle-vertical" />}
        </>
      )}

      {/* Main board area */}
      <Panel
        id="board-panel"
        order={2}
        defaultSize={showSidebar ? 75 : 100}
        minSize={30}
        className="panel board-panel"
      >
        {boardContent || <div className="placeholder">Board Placeholder</div>}
      </Panel>

      {showSidebar ? (
        <>
          {/* Vertical resize handle */}
          <PanelResizeHandle className="resize-handle resize-handle-vertical" />

          {/* Sidebar with three vertical sections */}
          <Panel
            id="sidebar-panel"
            order={3}
            defaultSize={25}
            minSize={20}
            maxSize={50}
            className="panel sidebar-panel"
          >
            <PanelGroup direction="vertical" id="sidebar-group" autoSaveId="kaya-sidebar-group">
              {/* Game Tree Section */}
              {panelVisibility.gameTree ? (
                <>
                  <Panel
                    id="game-tree-panel"
                    order={1}
                    defaultSize={getDefaultSize(panelVisibility.gameTree, 'gameTree')}
                    minSize={10}
                    className="panel game-tree-section"
                  >
                    <div className="sidebar-section">
                      <CollapsibleSectionHeader
                        title={t('panels.gameTree')}
                        icon={<LuGitBranch size={14} />}
                        isVisible={panelVisibility.gameTree}
                        onToggle={() => togglePanel('gameTree')}
                        headerActions={gameTreeHeaderActions}
                      />
                      <div className="sidebar-section-content">
                        {gameTreeContent || <div className="placeholder">Tree Placeholder</div>}
                      </div>
                    </div>
                  </Panel>
                  {(panelVisibility.gameInfo || panelVisibility.comment) && (
                    <PanelResizeHandle className="resize-handle resize-handle-horizontal" />
                  )}
                </>
              ) : (
                <div className="collapsed-section-bar">
                  <CollapsibleSectionHeader
                    title={t('panels.gameTree')}
                    icon={<LuGitBranch size={14} />}
                    isVisible={false}
                    onToggle={() => togglePanel('gameTree')}
                  />
                </div>
              )}

              {/* Game Info Section */}
              {panelVisibility.gameInfo ? (
                <>
                  <Panel
                    id="game-info-panel"
                    order={2}
                    defaultSize={getDefaultSize(panelVisibility.gameInfo, 'gameInfo')}
                    minSize={10}
                    className="panel game-info-section"
                  >
                    <div className="sidebar-section">
                      <CollapsibleSectionHeader
                        title={t('panels.gameInfo')}
                        icon={<LuInfo size={14} />}
                        isVisible={panelVisibility.gameInfo}
                        onToggle={() => togglePanel('gameInfo')}
                        headerActions={gameInfoHeaderActions}
                      />
                      <div className="sidebar-section-content">
                        {gameInfoContent || <div className="placeholder">Game Info</div>}
                      </div>
                    </div>
                  </Panel>
                  {panelVisibility.comment && (
                    <PanelResizeHandle className="resize-handle resize-handle-horizontal" />
                  )}
                </>
              ) : (
                <div className="collapsed-section-bar">
                  <CollapsibleSectionHeader
                    title={t('panels.gameInfo')}
                    icon={<LuInfo size={14} />}
                    isVisible={false}
                    onToggle={() => togglePanel('gameInfo')}
                  />
                </div>
              )}

              {/* Comment Section */}
              {panelVisibility.comment ? (
                <Panel
                  id="comment-panel"
                  order={3}
                  defaultSize={getDefaultSize(panelVisibility.comment, 'comment')}
                  minSize={10}
                  className="panel comments-section"
                >
                  <div className="sidebar-section">
                    <CollapsibleSectionHeader
                      title={t('panels.comment')}
                      icon={<LuMessageSquare size={14} />}
                      isVisible={panelVisibility.comment}
                      onToggle={() => togglePanel('comment')}
                      headerActions={commentHeaderActions}
                    />
                    <div className="sidebar-section-content">
                      {commentContent || <div className="placeholder">Comments</div>}
                    </div>
                  </div>
                </Panel>
              ) : (
                <div className="collapsed-section-bar">
                  <CollapsibleSectionHeader
                    title={t('panels.comment')}
                    icon={<LuMessageSquare size={14} />}
                    isVisible={false}
                    onToggle={() => togglePanel('comment')}
                  />
                </div>
              )}
            </PanelGroup>
          </Panel>
        </>
      ) : (
        /* Collapsed sidebar indicator */
        <div
          className="sidebar-collapsed-indicator"
          onClick={onToggleSidebar}
          title={t('panels.showSidebar')}
        >
          <LuPanelRight size={16} />
        </div>
      )}
    </PanelGroup>
  );
};

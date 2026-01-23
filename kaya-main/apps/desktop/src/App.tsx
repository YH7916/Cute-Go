import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Header,
  ResizableLayout,
  GameBoard,
  GameTreeGraph,
  GameTreeControls,
  GameTreeProvider,
  BoardNavigationProvider,
  GameControllerManagerProvider,
  AIEngineProvider,
  AIAnalysisProvider,
  AppDropZone,
  GameInfoEditor,
  GameInfoHeaderActions,
  useGameInfoEditMode,
  CommentEditor,
  CommentHeaderActions,
  CommentEditorProvider,
  LoadingOverlay,
  StatusBar,
  useGameTree,
  ScoreEstimator,
  AnalysisPanel,
  type VersionData,
  type ScoreData,
  ToastProvider,
  useToast,
  LibraryProvider,
  LibraryPanel,
  useLibraryPanel,
  TauriDragProvider,
  type GameTreeGraphRef,
  useExternalLinks,
  useLayoutMode,
  LandingPage,
  AboutDialog,
  type MobileTab,
  useKeyboardShortcuts,
  KeyboardShortcutsProvider,
} from '@kaya/ui';
import { listen } from '@tauri-apps/api/event';
import { analytics } from './analytics';
import { Updater } from './Updater';

function AppContent({
  versionData,
  activeMobileTab,
  onMobileTabChange,
}: {
  versionData: VersionData | undefined;
  activeMobileTab?: MobileTab;
  onMobileTabChange?: (tab: MobileTab) => void;
}) {
  // Enable external links to open in default browser
  useExternalLinks();

  // About dialog state
  const [showAboutDialog, setShowAboutDialog] = useState(false);

  // Listen for menu event to show about dialog
  useEffect(() => {
    const unlisten = listen('show-about', () => {
      setShowAboutDialog(true);
    });

    return () => {
      unlisten.then(u => u());
    };
  }, []);

  // Library panel state
  const { showLibrary, setShowLibrary, toggleLibrary } = useLibraryPanel();

  // Ref for game tree graph to control centering
  const gameTreeRef = useRef<GameTreeGraphRef>(null);

  // Load saved layout preference from localStorage
  const [treeLayoutHorizontal, setTreeLayoutHorizontal] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('kaya-tree-layout-horizontal');
      return saved !== null ? saved === 'true' : false; // Default: vertical
    }
    return false;
  });

  // Load saved minimap preference from localStorage
  const [showMinimap, setShowMinimap] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('kaya-tree-show-minimap');
      return saved === 'true';
    }
    return false;
  });

  // Save layout preference when it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('kaya-tree-layout-horizontal', String(treeLayoutHorizontal));
    }
  }, [treeLayoutHorizontal]);

  // Save minimap preference when it changes
  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('kaya-tree-show-minimap', String(showMinimap));
    }
  }, [showMinimap]);

  // Track initial page view
  useEffect(() => {
    analytics.pageView('Home');
  }, []);

  const {
    moveName,
    moveUrl,
    patternMatchingEnabled,
    togglePatternMatching,
    scoringMode,
    deadStones,
    gameInfo,
    gameTree,
    rootId,
    createNewGame,
    filename,
    loadSGFAsync,
    setFileName,
  } = useGameTree();

  // Layout mode for responsive landing page
  const layoutMode = useLayoutMode();
  const isMobileOrTablet = layoutMode === 'mobile' || layoutMode === 'tablet';

  // Initialize hasStarted based on layout - mobile/tablet starts with landing page
  const [hasStarted, setHasStarted] = useState(() => {
    // On initial load, desktop layout skips landing page
    if (typeof window === 'undefined') return false;
    // Use 1024px to match CSS breakpoint for mobile menu
    const isSmallScreen = window.matchMedia('(max-width: 1024px)').matches;
    return !isSmallScreen;
  });

  // Track if library should be opened after transition from landing page
  const [pendingOpenLibrary, setPendingOpenLibrary] = useState(false);

  // Determine if there is a saved game state
  const hasSavedGame = useMemo(() => {
    if (filename && filename !== 'Untitled Game.sgf') return true;
    if (gameTree && rootId !== null) {
      const root = gameTree.get(rootId);
      if (root && (root.children.length > 0 || root.data.annotated)) {
        return true;
      }
    }
    return false;
  }, [gameTree, rootId, filename]);

  // If desktop layout (large screen), always consider started
  useEffect(() => {
    if (!isMobileOrTablet) {
      setHasStarted(true);
    }
  }, [isMobileOrTablet]);

  // Open library after transition from landing page
  useEffect(() => {
    if (hasStarted && pendingOpenLibrary) {
      setPendingOpenLibrary(false);
      // On mobile/tablet, switch to library tab; on desktop, show library panel
      if (isMobileOrTablet && onMobileTabChange) {
        onMobileTabChange('library');
      } else {
        setShowLibrary(true);
      }
    }
  }, [hasStarted, pendingOpenLibrary, setShowLibrary, isMobileOrTablet, onMobileTabChange]);

  const handleNewGame = useCallback(() => {
    createNewGame();
    setHasStarted(true);
    // On mobile/tablet, switch to board tab
    if (isMobileOrTablet && onMobileTabChange) {
      onMobileTabChange('board');
    }
  }, [createNewGame, isMobileOrTablet, onMobileTabChange]);

  const handleContinue = useCallback(() => {
    setHasStarted(true);
    // On mobile/tablet, switch to board tab
    if (isMobileOrTablet && onMobileTabChange) {
      onMobileTabChange('board');
    }
  }, [isMobileOrTablet, onMobileTabChange]);

  const handleOpenLibrary = useCallback(() => {
    setPendingOpenLibrary(true);
    setHasStarted(true);
  }, []);

  const handleGoHome = useCallback(() => {
    setHasStarted(false);
  }, []);

  const handleFileDrop = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = e => {
        const content = e.target?.result as string;
        if (content) {
          loadSGFAsync(content);
          setFileName(file.name);
          setHasStarted(true);
        }
      };
      reader.readAsText(file);
    },
    [loadSGFAsync, setFileName]
  );

  const [scoreData, setScoreData] = useState<ScoreData | null>(null);

  // Header visibility state
  const [showHeader, setShowHeader] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('kaya-show-header');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Sidebar visibility state
  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = localStorage.getItem('kaya-show-sidebar');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  // Game info editor state for header actions
  const { isEditMode: gameInfoEditMode, toggleEditMode: toggleGameInfoEditMode } =
    useGameInfoEditMode();
  const { matchesShortcut, getBinding, bindingToDisplayString } = useKeyboardShortcuts();

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('kaya-show-header', String(showHeader));
    }
  }, [showHeader]);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem('kaya-show-sidebar', String(showSidebar));
    }
  }, [showSidebar]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle header
      if (matchesShortcut(e, 'view.toggleHeader')) {
        e.preventDefault();
        setShowHeader(prev => !prev);
        return;
      }
      // Toggle sidebar
      if (matchesShortcut(e, 'view.toggleSidebar')) {
        e.preventDefault();
        setShowSidebar(prev => !prev);
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [matchesShortcut]);

  // Show landing page on mobile/tablet layout
  if (isMobileOrTablet && !hasStarted) {
    return (
      <LandingPage
        onNewGame={handleNewGame}
        onContinue={handleContinue}
        onOpenLibrary={handleOpenLibrary}
        onFileDrop={handleFileDrop}
        version={versionData?.version}
        hasSavedGame={hasSavedGame}
      />
    );
  }

  return (
    <AppDropZone>
      <div className="app">
        {showHeader ? (
          <Header
            showThemeToggle={true}
            showLibrary={showLibrary}
            showSidebar={showSidebar}
            onToggleLibrary={toggleLibrary}
            onToggleSidebar={() => setShowSidebar(prev => !prev)}
            onHide={() => setShowHeader(false)}
            onGoHome={handleGoHome}
          />
        ) : (
          <div
            onClick={() => setShowHeader(true)}
            title={`Show Menu (${bindingToDisplayString(getBinding('view.toggleHeader'))})`}
            style={{
              height: '12px',
              width: '100%',
              background: 'var(--bg-tertiary)',
              borderBottom: '1px solid var(--border-color)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              transition: 'background-color 0.2s',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
            }}
          >
            <div
              style={{
                width: '48px',
                height: '4px',
                borderRadius: '2px',
                background: 'var(--border-color)',
                opacity: 0.6,
              }}
            />
          </div>
        )}
        <div className="app-main">
          <ResizableLayout
            showLibrary={showLibrary}
            onToggleLibrary={toggleLibrary}
            libraryContent={<LibraryPanel />}
            analysisGraphContent={<AnalysisPanel />}
            showSidebar={showSidebar}
            onToggleSidebar={() => setShowSidebar(prev => !prev)}
            activeMobileTab={activeMobileTab}
            onMobileTabChange={onMobileTabChange}
            boardContent={<GameBoard onScoreData={setScoreData} />}
            gameTreeContent={
              scoringMode && scoreData ? (
                <div style={{ padding: '1rem' }}>
                  <ScoreEstimator
                    scoreData={scoreData}
                    deadStones={deadStones}
                    playerBlack={gameInfo.playerBlack}
                    playerWhite={gameInfo.playerWhite}
                    rankBlack={gameInfo.rankBlack}
                    rankWhite={gameInfo.rankWhite}
                  />
                </div>
              ) : (
                <GameTreeGraph
                  ref={gameTreeRef}
                  horizontal={treeLayoutHorizontal}
                  onLayoutChange={setTreeLayoutHorizontal}
                  showMinimap={showMinimap}
                />
              )
            }
            gameTreeHeaderActions={
              scoringMode ? null : (
                <GameTreeControls
                  horizontal={treeLayoutHorizontal}
                  onToggleLayout={() => setTreeLayoutHorizontal(h => !h)}
                  showMinimap={showMinimap}
                  onToggleMinimap={() => setShowMinimap(m => !m)}
                  onCenterOnCurrentNode={() => gameTreeRef.current?.centerOnCurrentNode()}
                />
              )
            }
            gameInfoHeaderActions={
              <GameInfoHeaderActions
                isEditMode={gameInfoEditMode}
                onToggle={toggleGameInfoEditMode}
              />
            }
            commentHeaderActions={<CommentHeaderActions />}
            gameInfoContent={
              <GameInfoEditor
                isEditMode={gameInfoEditMode}
                onEditModeChange={toggleGameInfoEditMode}
              />
            }
            commentContent={<CommentEditor />}
          />
        </div>
        <LoadingOverlay />
        <StatusBar
          versionData={versionData}
          moveName={moveName}
          moveUrl={moveUrl}
          patternMatchingEnabled={patternMatchingEnabled}
          onTogglePatternMatching={togglePatternMatching}
          onShowAbout={() => setShowAboutDialog(true)}
        />
        <AboutDialog
          isOpen={showAboutDialog}
          onClose={() => setShowAboutDialog(false)}
          versionData={versionData}
        />
      </div>
    </AppDropZone>
  );
}

function App() {
  const [versionData, setVersionData] = useState<VersionData | undefined>(undefined);

  useEffect(() => {
    // For desktop app, version.json is in the dist root
    fetch('/version.json')
      .then(res => res.json())
      .then(data => {
        console.log('Version info:', data);
        setVersionData(data);
      })
      .catch(err => {
        console.warn('Could not load version info:', err);
      });
  }, []);

  return (
    <>
      <Updater />
      <ToastProvider>
        <AppWithToast versionData={versionData} />
      </ToastProvider>
    </>
  );
}

function AppWithToast({ versionData }: { versionData: VersionData | undefined }) {
  const { showToast } = useToast();

  const handleAutoSaveDisabled = useCallback(() => {
    showToast('Game is too large for auto-save (max 5MB)', 'info');
  }, [showToast]);

  return (
    <KeyboardShortcutsProvider>
      <GameControllerManagerProvider>
        <GameTreeProvider onAutoSaveDisabled={handleAutoSaveDisabled}>
          <AIEngineProvider>
            <AIAnalysisProvider>
              <BoardNavigationProvider>
                <LibraryProviderWrapper versionData={versionData} />
              </BoardNavigationProvider>
            </AIAnalysisProvider>
          </AIEngineProvider>
        </GameTreeProvider>
      </GameControllerManagerProvider>
    </KeyboardShortcutsProvider>
  );
}

function LibraryProviderWrapper({ versionData }: { versionData: VersionData | undefined }) {
  const { loadSGFAsync, exportSGF, setFileName, isDirty, setIsDirty } = useGameTree();
  const [activeMobileTab, setActiveMobileTab] = useState<MobileTab>('board');

  // Callback when a file is opened from the library
  const handleFileOpen = useCallback(
    (content: string, name: string) => {
      loadSGFAsync(content);
      setFileName(name);
      // Switch to board view on mobile when a file is loaded
      setActiveMobileTab('board');
    },
    [loadSGFAsync, setFileName]
  );

  // Get current game content for saving to library
  const getCurrentGameContent = useCallback(() => {
    return exportSGF();
  }, [exportSGF]);

  // Check if there are unsaved changes
  const getIsDirty = useCallback(() => isDirty, [isDirty]);

  // Reset dirty state after save
  const handleSaveComplete = useCallback(() => {
    setIsDirty(false);
  }, [setIsDirty]);

  return (
    <LibraryProvider
      onFileOpen={handleFileOpen}
      getCurrentGameContent={getCurrentGameContent}
      getIsDirty={getIsDirty}
      onSaveComplete={handleSaveComplete}
    >
      <CommentEditorProvider>
        <TauriDragProvider>
          <AppContent
            versionData={versionData}
            activeMobileTab={activeMobileTab}
            onMobileTabChange={setActiveMobileTab}
          />
        </TauriDragProvider>
      </CommentEditorProvider>
    </LibraryProvider>
  );
}

export default App;

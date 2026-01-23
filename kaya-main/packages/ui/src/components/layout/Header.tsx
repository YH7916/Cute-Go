import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import {
  LuSun,
  LuMoon,
  LuVolume2,
  LuVolumeX,
  LuPlus,
  LuFolderOpen,
  LuSave,
  LuCopy,
  LuClipboardPaste,
  LuDownload,
  LuZap,
  LuGithub,
  LuMaximize,
  LuMinimize,
  LuPanelTopClose,
  LuLibrary,
  LuPanelRight,
  LuBookmarkPlus,
  LuEllipsis,
  LuMenu,
} from 'react-icons/lu';
import { useTranslation } from 'react-i18next';
import { MobileMenu } from './MobileMenu';
import { useTheme } from '../../contexts/ThemeContext';
import {
  useGameTreeFile,
  useGameTreeBoard,
  useGameTreeEdit,
  useGameTreeAI,
} from '../../contexts/selectors';
import { useLibrary } from '../../contexts/LibraryContext';
import { useGameSounds } from '../../useGameSounds';
import { useKeyboardShortcuts } from '../../contexts/KeyboardShortcutsContext';
import { GamepadIndicator } from '../gamepad/GamepadIndicator';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';
import type { NewGameConfig } from '../../contexts/GameTreeContext';
import { NewGameDialog } from '../dialogs/NewGameDialog';
import { ConfirmationDialog } from '../dialogs/ConfirmationDialog';
import { SaveToLibraryDialog } from '../dialogs/SaveToLibraryDialog';
import { ToastContainer, useToast } from '../ui/Toast';
import { saveFile, isTauriApp } from '../../services/fileSave';
import { loadContentOrOGSUrl, getFilenameForSGF } from '../../services/ogsLoader';
import { readClipboardText, writeClipboardText } from '../../services/clipboard';
import { KayaConfig } from '../ai/KayaConfig';

import type { VersionData } from './StatusBar';

interface HeaderProps {
  showThemeToggle?: boolean;
  showLibrary?: boolean;
  showSidebar?: boolean;
  onToggleLibrary?: () => void;
  onToggleSidebar?: () => void;
  onHide?: () => void;
  onGoHome?: () => void;
  versionData?: VersionData;
}

export const Header: React.FC<HeaderProps> = ({
  showThemeToggle = true,
  showLibrary,
  showSidebar,
  onToggleLibrary,
  onToggleSidebar,
  onHide,
  onGoHome,
  versionData,
}) => {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { soundEnabled, toggleSound } = useGameSounds();
  const { matchesShortcut, getBinding, bindingToDisplayString } = useKeyboardShortcuts();
  const { loadSGFAsync, exportSGF, newGame, fileName, setFileName, isDirty, triggerAutoSave } =
    useGameTreeFile();
  const { currentBoard, gameInfo } = useGameTreeBoard();
  const { makeMainVariation, undo, redo, canUndo, canRedo, editMode } = useGameTreeEdit();
  const { setAIConfigOpen } = useGameTreeAI();
  const {
    clearLoadedFile,
    loadedFileId,
    renameItem,
    checkUnsavedChanges,
    updateLoadedFile,
    saveCurrentGame,
    items: libraryItems,
    selectedId: librarySelectedId,
  } = useLibrary();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filenameInputRef = useRef<HTMLInputElement>(null);
  const [isNewGameDialogOpen, setIsNewGameDialogOpen] = useState(false);
  const [isConfirmationDialogOpen, setIsConfirmationDialogOpen] = useState(false);
  const [isSaveToLibraryDialogOpen, setIsSaveToLibraryDialogOpen] = useState(false);
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [editedFilename, setEditedFilename] = useState('');
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const { messages, showToast, closeToast } = useToast();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false); // Add mobile menu state

  // Generate a default filename from game info when no filename is set
  const defaultSaveFileName = useMemo(() => {
    if (fileName) return fileName;

    // Try to use game name first
    if (gameInfo.gameName) {
      const safeName = gameInfo.gameName.replace(/[/\\?%*:|"<>]/g, '-').trim();
      return safeName.endsWith('.sgf') ? safeName : `${safeName}.sgf`;
    }

    // Fallback to player names if available
    const black = gameInfo.playerBlack?.trim();
    const white = gameInfo.playerWhite?.trim();
    if (black && white) {
      const safeName = `${black} vs ${white}`.replace(/[/\\?%*:|"<>]/g, '-');
      return `${safeName}.sgf`;
    }

    return 'game.sgf';
  }, [fileName, gameInfo.gameName, gameInfo.playerBlack, gameInfo.playerWhite]);

  // File loading
  const handleFileLoad = useCallback(
    async (file: File) => {
      // Check for unsaved changes first
      const canProceed = await checkUnsavedChanges();
      if (!canProceed) return;

      const reader = new FileReader();
      reader.onload = async e => {
        const content = e.target?.result as string;
        if (content) {
          try {
            await loadSGFAsync(content);
            setFileName(file.name);
            clearLoadedFile(); // Clear library loaded indicator
          } catch (error) {
            alert(`Failed to load SGF file: ${error}`);
          }
        }
      };
      reader.readAsText(file);
    },
    [loadSGFAsync, setFileName, clearLoadedFile, checkUnsavedChanges]
  );

  const handleOpenClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFileLoad(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [handleFileLoad]
  );

  const handleSaveWithFileName = useCallback(
    async (newFileName: string) => {
      const sgfContent = exportSGF();
      const finalFileName = newFileName.endsWith('.sgf') ? newFileName : `${newFileName}.sgf`;
      const savedFileName = await saveFile(sgfContent, finalFileName);
      if (savedFileName) {
        setFileName(savedFileName);
        showToast(`Exported "${finalFileName}"`, 'success');
        triggerAutoSave();
      }
    },
    [exportSGF, setFileName, showToast, triggerAutoSave]
  );

  // Save: Context-aware save to library
  // - If loaded from library: update the library file
  // - Otherwise: save to library with default name (or open dialog if new)
  const handleSaveClick = useCallback(async () => {
    // If loaded from library, save back to library
    if (loadedFileId) {
      const success = await updateLoadedFile();
      if (success) {
        showToast('Saved to library', 'success');
        triggerAutoSave();
      } else {
        // File might have been deleted, open Save As dialog
        showToast('Library file not found, saving as new...', 'info');
        setIsSaveToLibraryDialogOpen(true);
      }
      return;
    }

    // Not from library - save to library with current name or open dialog
    if (defaultSaveFileName && defaultSaveFileName !== 'game.sgf') {
      // We have a meaningful name, save directly to library root
      const savedFile = await saveCurrentGame(defaultSaveFileName, null);
      if (savedFile) {
        // Update the filename to match the saved file
        const finalName = defaultSaveFileName.endsWith('.sgf')
          ? defaultSaveFileName
          : `${defaultSaveFileName}.sgf`;
        setFileName(finalName);
        showToast(`Saved "${defaultSaveFileName}" to library`, 'success');
        triggerAutoSave();
      } else {
        showToast('Failed to save to library', 'error');
      }
    } else {
      // New file without a name - ask for name
      setIsSaveToLibraryDialogOpen(true);
    }
  }, [
    loadedFileId,
    updateLoadedFile,
    defaultSaveFileName,
    saveCurrentGame,
    setFileName,
    showToast,
    triggerAutoSave,
  ]);

  // Save As: Save to library with new name (always opens dialog)
  const handleSaveAsClick = useCallback(() => {
    setIsSaveToLibraryDialogOpen(true);
  }, []);

  // Export: Download to disk (file system)
  const handleExportClick = useCallback(() => {
    handleSaveWithFileName(defaultSaveFileName);
  }, [handleSaveWithFileName, defaultSaveFileName]);

  // Handle saving to library with a given name
  const handleSaveToLibrary = useCallback(
    async (name: string, folderId: string | null) => {
      const savedFile = await saveCurrentGame(name, folderId);
      if (savedFile) {
        // Update the filename in the header to match the saved file
        setFileName(name.endsWith('.sgf') ? name : `${name}.sgf`);
        showToast(`Saved "${name}" to library`, 'success');
        triggerAutoSave();
      } else {
        showToast('Failed to save to library', 'error');
      }
    },
    [saveCurrentGame, setFileName, showToast, triggerAutoSave]
  );

  const handleNewGame = useCallback(() => {
    // Check if board is empty (no moves played)
    const isBoardEmpty = currentBoard.isEmpty();

    if (isBoardEmpty) {
      setIsNewGameDialogOpen(true);
    } else {
      setIsConfirmationDialogOpen(true);
    }
  }, [currentBoard]);

  const handleConfirmationConfirm = useCallback(() => {
    setIsConfirmationDialogOpen(false);
    setIsNewGameDialogOpen(true);
  }, []);

  const handleConfirmationCancel = useCallback(() => {
    setIsConfirmationDialogOpen(false);
  }, []);

  // Filename editing handlers
  const handleFilenameClick = useCallback(() => {
    if (fileName) {
      setEditedFilename(fileName);
      setIsEditingFilename(true);
    }
  }, [fileName]);

  const handleFilenameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedFilename(e.target.value);
  }, []);

  const handleFilenameBlur = useCallback(async () => {
    if (editedFilename.trim()) {
      const newName = editedFilename.trim().endsWith('.sgf')
        ? editedFilename.trim()
        : `${editedFilename.trim()}.sgf`;
      setFileName(newName);

      // Also rename the file in the library if it came from there
      if (loadedFileId) {
        try {
          await renameItem(loadedFileId, newName);
        } catch (error) {
          console.error('Failed to rename file in library:', error);
        }
      }
    }
    setIsEditingFilename(false);
  }, [editedFilename, setFileName, loadedFileId, renameItem]);

  const handleFilenameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Stop propagation to prevent global shortcuts from capturing these events
      e.stopPropagation();
      if (e.key === 'Enter') {
        e.preventDefault();
        handleFilenameBlur();
      } else if (e.key === 'Escape') {
        setIsEditingFilename(false);
      }
    },
    [handleFilenameBlur]
  );

  // Focus filename input when editing starts
  useEffect(() => {
    if (isEditingFilename && filenameInputRef.current) {
      filenameInputRef.current.focus();
      filenameInputRef.current.select();
    }
  }, [isEditingFilename]);

  const handleQuickNewGame = useCallback(async () => {
    // Check for unsaved changes first
    const canProceed = await checkUnsavedChanges();
    if (!canProceed) return;

    // Quick new game with current board size (instant - no confirmation)
    newGame({
      boardSize: currentBoard.width,
      playerBlack: 'Black',
      playerWhite: 'White',
      rankBlack: '',
      rankWhite: '',
      komi: 6.5,
      handicap: 0,
    });
    clearLoadedFile(); // Clear library loaded indicator
  }, [newGame, currentBoard, clearLoadedFile, checkUnsavedChanges]);

  const handleNewGameConfirm = useCallback(
    async (config: NewGameConfig) => {
      // Check for unsaved changes first
      const canProceed = await checkUnsavedChanges();
      if (!canProceed) return;

      // User already confirmed, just create the game
      newGame(config);
      clearLoadedFile(); // Clear library loaded indicator
    },
    [newGame, clearLoadedFile, checkUnsavedChanges]
  );

  // Copy SGF to clipboard
  const handleCopyClick = useCallback(async () => {
    try {
      const sgfContent = exportSGF();
      await writeClipboardText(sgfContent);
      showToast('SGF copied to clipboard!', 'success');
      triggerAutoSave();
    } catch (error) {
      showToast(`Failed to copy: ${error}`, 'error');
    }
  }, [exportSGF, showToast, triggerAutoSave]);

  // Paste SGF from clipboard (with OGS URL support)
  const handlePasteClick = useCallback(async () => {
    try {
      const content = await readClipboardText();
      if (!content.trim()) {
        showToast('Clipboard is empty', 'error');
        return;
      }

      // Check for unsaved changes first
      const canProceed = await checkUnsavedChanges();
      if (!canProceed) return;

      // Use loadContentOrOGSUrl which properly checks for SGF content first
      // This prevents SGF files containing OGS URLs in comments/properties from being treated as URLs
      const result = await loadContentOrOGSUrl(content);

      await loadSGFAsync(result.sgf);
      setFileName(getFilenameForSGF(result));
      clearLoadedFile(); // Clear library loaded indicator
    } catch (error) {
      console.error('Failed to paste:', error);
      showToast(`Failed to paste: ${error}`, 'error');
    }
  }, [loadSGFAsync, setFileName, clearLoadedFile, checkUnsavedChanges, showToast]);

  const toggleFullscreen = useCallback(async () => {
    // Robust check for Tauri environment
    const isTauri =
      isTauriApp() ||
      (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window));

    if (isTauri) {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();
        const isFullscreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!isFullscreen);
        setIsFullscreen(!isFullscreen);
      } catch (e) {
        console.error('Failed to toggle fullscreen in Tauri:', e);
      }
      return;
    }

    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const docEl = document.documentElement as any;
      if (docEl.requestFullscreen) {
        docEl.requestFullscreen().catch((e: any) => {
          console.error(`Error attempting to enable full-screen mode: ${e.message} (${e.name})`);
        });
        setIsFullscreen(true);
      } else if (docEl.webkitRequestFullscreen) {
        docEl.webkitRequestFullscreen();
        setIsFullscreen(true);
      } else {
        console.warn('Fullscreen API is not supported in this environment');
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      } else if ((document as any).webkitExitFullscreen) {
        (document as any).webkitExitFullscreen();
        setIsFullscreen(false);
      }
    }
  }, []);

  // Update state if fullscreen changes via other means (e.g. Esc key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Close more menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    if (showMoreMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showMoreMenu]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input or textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // File shortcuts
      if (matchesShortcut(e, 'file.save')) {
        e.preventDefault();
        handleSaveClick();
        return;
      }
      if (matchesShortcut(e, 'file.saveAs')) {
        e.preventDefault();
        handleSaveAsClick();
        return;
      }

      // Edit shortcuts
      if (matchesShortcut(e, 'edit.makeMainBranch')) {
        e.preventDefault();
        makeMainVariation();
        return;
      }
      if (matchesShortcut(e, 'edit.undo')) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }
      if (matchesShortcut(e, 'edit.redo')) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      // View shortcuts
      if (matchesShortcut(e, 'view.openSettings')) {
        e.preventDefault();
        setAIConfigOpen(true);
        return;
      }
      if (matchesShortcut(e, 'view.toggleFullscreen')) {
        toggleFullscreen();
        return;
      }
      if (matchesShortcut(e, 'board.toggleSound')) {
        toggleSound();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleSaveClick,
    handleSaveAsClick,
    toggleFullscreen,
    toggleSound,
    makeMainVariation,
    undo,
    redo,
    canUndo,
    canRedo,
    setAIConfigOpen,
    matchesShortcut,
  ]);

  return (
    <header className="app-header">
      <input
        ref={fileInputRef}
        type="file"
        accept=".sgf"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <div className="header-file-controls">
        {/* Primary actions - always visible */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          title={t('menu')}
          className="header-mobile-menu-btn"
        >
          <LuMenu size={24} />
        </button>

        {/* Primary actions - always visible on desktop, hidden on mobile */}
        <button
          onClick={handleQuickNewGame}
          title={`Quick New Game (${currentBoard.width}×${currentBoard.height}) - ⚠️ Erases current game without saving!`}
          className="quick-new-button header-desktop-only"
        >
          <LuZap size={18} />
        </button>
        <button
          onClick={handleNewGame}
          title={t('newGame')}
          className="header-btn-primary header-desktop-only"
        >
          <LuPlus size={18} /> <span className="btn-text">{t('new')}</span>
        </button>
        <button
          onClick={handleOpenClick}
          title={t('openSgfFile')}
          className="header-btn-primary header-desktop-only"
        >
          <LuFolderOpen size={18} /> <span className="btn-text">{t('open')}</span>
        </button>
        <button
          onClick={handleSaveClick}
          title={`${t('saveToLibrary')} (${bindingToDisplayString(getBinding('file.save'))})`}
          className="header-btn-primary header-desktop-only"
          disabled={!isDirty && loadedFileId !== null}
        >
          <LuSave size={18} /> <span className="btn-text">{t('save')}</span>
        </button>
        <button
          onClick={handleSaveAsClick}
          title={`${t('saveAs')} (${bindingToDisplayString(getBinding('file.saveAs'))})`}
          className="header-btn-primary header-desktop-only"
        >
          <LuBookmarkPlus size={18} /> <span className="btn-text">{t('saveAsShort')}</span>
        </button>
        <button
          onClick={handleExportClick}
          title={t('exportToDisk')}
          className="header-btn-primary header-desktop-only"
        >
          <LuDownload size={18} /> <span className="btn-text">{t('export')}</span>
        </button>

        {/* Secondary actions - collapse on small screens */}
        <div className="header-secondary-actions">
          <button
            onClick={handleCopyClick}
            title={t('copySgfToClipboard')}
            className="header-btn-secondary"
          >
            <LuCopy size={18} /> <span className="btn-text">{t('copy')}</span>
          </button>
          <button
            onClick={handlePasteClick}
            title={`${t('pasteSgfOrOgs')} (${bindingToDisplayString(getBinding('file.paste'))})`}
            className="header-btn-secondary"
          >
            <LuClipboardPaste size={18} /> <span className="btn-text">{t('paste')}</span>
          </button>
        </div>

        {/* More menu for collapsed actions on small screens */}
        <div className="header-more-menu-container" ref={moreMenuRef}>
          <button
            className="header-more-btn"
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            title={t('moreActions')}
          >
            <LuEllipsis size={18} />
          </button>
          {showMoreMenu && (
            <div className="header-more-menu">
              <button
                onClick={() => {
                  handleCopyClick();
                  setShowMoreMenu(false);
                }}
              >
                <LuCopy size={16} /> {t('copySgf')}
              </button>
              <button
                onClick={() => {
                  handlePasteClick();
                  setShowMoreMenu(false);
                }}
              >
                <LuClipboardPaste size={16} /> {t('pasteSgfUrl')}
              </button>
            </div>
          )}
        </div>

        {fileName &&
          (isEditingFilename ? (
            <input
              ref={filenameInputRef}
              type="text"
              className="header-filename-input"
              value={editedFilename}
              onChange={handleFilenameChange}
              onBlur={handleFilenameBlur}
              onKeyDown={handleFilenameKeyDown}
              onKeyUp={e => e.stopPropagation()}
              onKeyPress={e => e.stopPropagation()}
            />
          ) : (
            <span
              className="header-filename"
              onClick={handleFilenameClick}
              title={t('clickToRename')}
            >
              {isDirty && (
                <span className="header-dirty-indicator" title={t('unsavedChanges')}>
                  •
                </span>
              )}
              {fileName}
            </span>
          ))}
      </div>

      <div
        className="header-right-group"
        style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
      >
        <KayaConfig />
        {showThemeToggle && (
          <div className="header-toggles">
            {onToggleLibrary && (
              <button
                className={`panel-toggle ${showLibrary ? 'active' : ''}`}
                onClick={onToggleLibrary}
                title={
                  showLibrary ? `${t('hideLibrary')} (Ctrl+L)` : `${t('showLibrary')} (Ctrl+L)`
                }
              >
                <LuLibrary size={20} />
              </button>
            )}
            {onToggleSidebar && (
              <button
                className={`panel-toggle ${showSidebar ? 'active' : ''}`}
                onClick={onToggleSidebar}
                title={
                  showSidebar ? `${t('hideSidebar')} (Ctrl+B)` : `${t('showSidebar')} (Ctrl+B)`
                }
              >
                <LuPanelRight size={20} />
              </button>
            )}
            <GamepadIndicator />
            <button
              className="fullscreen-toggle"
              onClick={toggleFullscreen}
              title={
                isFullscreen
                  ? `${t('exitFullscreen')} (${bindingToDisplayString(getBinding('view.toggleFullscreen'))})`
                  : `${t('enterFullscreen')} (${bindingToDisplayString(getBinding('view.toggleFullscreen'))})`
              }
            >
              {isFullscreen ? <LuMinimize size={20} /> : <LuMaximize size={20} />}
            </button>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={theme === 'dark' ? t('switchToLightMode') : t('switchToDarkMode')}
            >
              {theme === 'dark' ? <LuSun size={20} /> : <LuMoon size={20} />}
            </button>
            <button
              className="sound-toggle"
              onClick={toggleSound}
              title={
                soundEnabled
                  ? `${t('muteSounds')} (${bindingToDisplayString(getBinding('board.toggleSound'))})`
                  : `${t('enableSounds')} (${bindingToDisplayString(getBinding('board.toggleSound'))})`
              }
            >
              {soundEnabled ? <LuVolume2 size={20} /> : <LuVolumeX size={20} />}
            </button>
            <LanguageSwitcher />
            <a
              href="https://github.com/kaya-go/kaya"
              target="_blank"
              rel="noopener noreferrer"
              title={t('viewOnGitHub')}
            >
              <LuGithub size={20} />
            </a>
            {onHide && (
              <button
                onClick={onHide}
                title={`${t('hideMenu')} (${bindingToDisplayString(getBinding('view.toggleHeader'))})`}
              >
                <LuPanelTopClose size={20} />
              </button>
            )}
          </div>
        )}
      </div>

      <ToastContainer messages={messages} onClose={closeToast} />

      <NewGameDialog
        isOpen={isNewGameDialogOpen}
        onClose={() => setIsNewGameDialogOpen(false)}
        onConfirm={handleNewGameConfirm}
      />

      <ConfirmationDialog
        isOpen={isConfirmationDialogOpen}
        title={t('startNewGame')}
        message={t('startNewGameConfirm')}
        confirmLabel={t('newGame')}
        onConfirm={handleConfirmationConfirm}
        onCancel={handleConfirmationCancel}
      />

      <SaveToLibraryDialog
        isOpen={isSaveToLibraryDialogOpen}
        defaultFileName={defaultSaveFileName}
        libraryItems={libraryItems}
        selectedFolderId={librarySelectedId}
        onClose={() => setIsSaveToLibraryDialogOpen(false)}
        onSave={handleSaveToLibrary}
      />

      <MobileMenu
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        versionData={versionData}
        onNewGame={() => setIsNewGameDialogOpen(true)}
        onQuickNewGame={handleQuickNewGame}
        onOpen={handleOpenClick}
        onSave={handleSaveClick}
        onSaveAs={handleSaveAsClick}
        onExport={handleExportClick}
        onCopySGF={handleCopyClick}
        onPasteSGF={handlePasteClick}
        onGoHome={onGoHome}
        isDirty={isDirty}
        isInLibrary={loadedFileId !== null}
      />
    </header>
  );
};

/**
 * AppDropZone - Global drag and drop handler for SGF files
 *
 * Wraps the entire application to handle file drops on the Goban area.
 * Drops on the Library panel are handled separately by LibraryPanel (for web),
 * or intercepted here for Tauri (native file drops bypass HTML5 drag events).
 * Files dropped on the game area are loaded directly into the game.
 * Files dropped on the library are saved to the library.
 */

import React, { useState, useCallback, ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameTree } from '../../contexts/GameTreeContext';
import { useLibrary } from '../../contexts/LibraryContext';
import { useTauriDrag } from '../../contexts/TauriDragContext';
import { loadContentOrOGSUrl, isOGSUrl, getFilenameForSGF } from '../../services/ogsLoader';
import { readClipboardText } from '../../services/clipboard';
import './AppDropZone.css';

interface AppDropZoneProps {
  children: ReactNode;
  onFileDrop?: (file: File) => void;
}

// Check if running in Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

// Check if the position is inside the library panel (ignoring overlay elements)
const isPositionInsideLibrary = (x: number, y: number): boolean => {
  // Get all elements at this position
  const elements = document.elementsFromPoint(x, y);

  // Find the first element that's not part of the drop overlay
  for (const el of elements) {
    if (el.closest('.app-dropzone-overlay')) continue;
    if (el.closest('.library-drop-zone')) continue;

    // Check if this element is inside the library panel
    return el.closest('.library-panel') !== null;
  }
  return false;
};

// Check if the drop target is inside the library panel (for HTML5 drag events)
const isInsideLibrary = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('.library-panel') !== null;
};

export const AppDropZone: React.FC<AppDropZoneProps> = ({ children, onFileDrop }) => {
  const { t } = useTranslation();
  const { loadSGF, loadSGFAsync, setFileName, setCustomAIModel } = useGameTree();
  const { clearLoadedFile, createFile, importZip, checkUnsavedChanges } = useLibrary();
  const { setTauriDragging, setOverLibrary } = useTauriDrag();
  const [isDragging, setIsDragging] = useState(false);
  const [isOverLibrary, setIsOverLibrary] = useState(false);

  // Use ref to track library state for Tauri event handler (avoids stale closure)
  const isOverLibraryRef = useRef(false);

  // Guard to prevent duplicate drop processing
  const isProcessingDropRef = useRef(false);

  // Sync local state to context for Tauri drags
  const updateDragState = useCallback(
    (dragging: boolean) => {
      setIsDragging(dragging);
      setTauriDragging(dragging);
    },
    [setTauriDragging]
  );

  const updateLibraryState = useCallback(
    (over: boolean) => {
      setIsOverLibrary(over);
      setOverLibrary(over);
      isOverLibraryRef.current = over;
    },
    [setOverLibrary]
  );

  // Handle file load into current game (from path - Tauri only)
  const handleFileLoadFromPath = useCallback(
    async (filePath: string) => {
      try {
        if (isTauri) {
          const fs = await import('@tauri-apps/plugin-fs');

          if (filePath.endsWith('.onnx')) {
            const content = await fs.readFile(filePath);
            const fileName = filePath.split(/[\/]/).pop() || 'model.onnx';
            setCustomAIModel({
              data: content.buffer,
              name: fileName,
              date: Date.now(),
              size: content.buffer.byteLength,
            });
            alert(`Loaded AI model: ${fileName}`);
            return;
          }

          // Check for unsaved changes first
          const canProceed = await checkUnsavedChanges();
          if (!canProceed) return;

          const content = await fs.readTextFile(filePath);
          loadSGF(content);
          const fileName = filePath.split(/[\/]/).pop() || 'unknown.sgf';
          setFileName(fileName);
          clearLoadedFile();
        }
      } catch (error) {
        console.error('Failed to load file:', error);
        alert(`Failed to load file: ${error}`);
      }
    },
    [loadSGF, setFileName, setCustomAIModel, clearLoadedFile, checkUnsavedChanges]
  );

  // Handle file import to library (from path - Tauri only)
  const handleFileImportToLibrary = useCallback(
    async (filePath: string) => {
      try {
        if (isTauri) {
          const fs = await import('@tauri-apps/plugin-fs');

          if (filePath.endsWith('.sgf')) {
            const content = await fs.readTextFile(filePath);
            const fileName = filePath.split(/[\/]/).pop() || 'unknown.sgf';
            await createFile(fileName, content, null);
          } else if (filePath.endsWith('.zip')) {
            const buffer = await fs.readFile(filePath);
            await importZip(buffer.buffer);
          } else {
            alert('Only .sgf and .zip files can be added to the library');
            return;
          }
        }
      } catch (error) {
        console.error('Failed to import file to library:', error);
        alert(`Failed to import file: ${error}`);
      }
    },
    [createFile, importZip]
  );

  // Setup Tauri file drop listener using webviewWindow API
  useEffect(() => {
    if (!isTauri) return;

    let unlistenDrop: (() => void) | undefined;

    const setupTauriListener = async () => {
      try {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const currentWindow = getCurrentWebviewWindow();

        unlistenDrop = await currentWindow.onDragDropEvent((event: any) => {
          const payload = event.payload;

          if (payload.type === 'over') {
            // Tauri provides position during drag - use it to detect library
            const position = payload.position;
            if (position) {
              updateLibraryState(isPositionInsideLibrary(position.x, position.y));
            }
          } else if (payload.type === 'drop') {
            const paths = payload.paths as string[];

            // Skip processing for internal drags (no file paths)
            // This allows react-arborist's drop handling to work
            if (!paths || paths.length === 0) {
              updateDragState(false);
              updateLibraryState(false);
              return;
            }

            // Guard against duplicate drop events (only for file drops)
            if (isProcessingDropRef.current) {
              return;
            }
            isProcessingDropRef.current = true;

            // Use position from drop event to determine target
            const position = payload.position;
            let droppedOnLibrary = isOverLibraryRef.current;

            // Double-check with drop position if available
            if (position) {
              droppedOnLibrary = isPositionInsideLibrary(position.x, position.y);
            }

            updateDragState(false);
            updateLibraryState(false);

            const filePath = paths[0];

            if (droppedOnLibrary) {
              // Drop on library - import to library
              if (filePath.endsWith('.sgf') || filePath.endsWith('.zip')) {
                handleFileImportToLibrary(filePath);
              } else {
                alert('Only .sgf and .zip files can be added to the library');
              }
            } else {
              // Drop on game area - load into current game
              if (filePath.endsWith('.sgf') || filePath.endsWith('.onnx')) {
                handleFileLoadFromPath(filePath);
              } else {
                alert('Please drop a .sgf or .onnx file');
              }
            }

            // Reset guard after a short delay
            setTimeout(() => {
              isProcessingDropRef.current = false;
            }, 100);
          } else if (payload.type === 'enter') {
            isProcessingDropRef.current = false; // Reset on new drag
            // Only show overlay if there are actual file paths (ignores internal app drags)
            if (payload.paths && payload.paths.length > 0) {
              updateDragState(true);
            }
          } else if (payload.type === 'leave' || payload.type === 'cancel') {
            updateDragState(false);
            updateLibraryState(false);
          }
        });
      } catch (error) {
        console.error('AppDropZone: Failed to setup Tauri listeners:', error);
      }
    };

    setupTauriListener();

    return () => {
      if (unlistenDrop) unlistenDrop();
    };
  }, [handleFileLoadFromPath, handleFileImportToLibrary, updateDragState, updateLibraryState]);

  // Global paste event handler for SGF content and OGS URLs
  // This creates a new game (similar to drag and drop) when pasting SGF or OGS URLs
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept if pasting into an editable element
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target.isContentEditable ||
        target.closest('[contenteditable="true"]')
      ) {
        return;
      }

      const clipboardText = e.clipboardData?.getData('text/plain');
      if (!clipboardText?.trim()) return;

      const trimmed = clipboardText.trim();

      // Check if it looks like SGF content or an OGS URL
      const looksLikeSGF = trimmed.startsWith('(');
      const looksLikeOGSUrl = isOGSUrl(trimmed);

      if (!looksLikeSGF && !looksLikeOGSUrl) {
        // Not SGF or OGS URL - let the browser handle it normally
        return;
      }

      // Prevent default browser paste behavior
      e.preventDefault();

      try {
        // Check for unsaved changes first
        const canProceed = await checkUnsavedChanges();
        if (!canProceed) return;

        // Load the content (handles both SGF and OGS URLs)
        const result = await loadContentOrOGSUrl(trimmed);
        await loadSGFAsync(result.sgf);
        setFileName(getFilenameForSGF(result));
        clearLoadedFile(); // Clear library loaded indicator
      } catch (error) {
        console.error('Failed to load pasted content:', error);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [loadSGFAsync, setFileName, clearLoadedFile, checkUnsavedChanges]);

  // Keyboard shortcut handler for Cmd+V/Ctrl+V (fallback for Tauri on macOS)
  // The native paste event may not fire in Tauri, so we handle the keyboard shortcut directly
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check for Ctrl+V (Windows/Linux) or Cmd+V (macOS)
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        // Don't intercept if focused on an editable element
        const target = e.target as HTMLElement;
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target.isContentEditable ||
          target.closest('[contenteditable="true"]')
        ) {
          return;
        }

        // Prevent default browser paste behavior immediately to avoid permission popups
        e.preventDefault();

        try {
          // Read clipboard using our utility (handles Tauri vs browser)
          const clipboardText = await readClipboardText();
          if (!clipboardText?.trim()) return;

          const trimmed = clipboardText.trim();

          // Check if it looks like SGF content or an OGS URL
          const looksLikeSGF = trimmed.startsWith('(');
          const looksLikeOGSUrl = isOGSUrl(trimmed);

          if (!looksLikeSGF && !looksLikeOGSUrl) {
            return;
          }

          // Check for unsaved changes first
          const canProceed = await checkUnsavedChanges();
          if (!canProceed) return;

          // Load the content (handles both SGF and OGS URLs)
          const result = await loadContentOrOGSUrl(trimmed);
          await loadSGFAsync(result.sgf);
          setFileName(getFilenameForSGF(result));
          clearLoadedFile();
        } catch (error) {
          console.error('Failed to load pasted content:', error);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [loadSGFAsync, setFileName, clearLoadedFile, checkUnsavedChanges]);

  const handleFileLoad = useCallback(
    async (file: File) => {
      if (file.name.endsWith('.onnx')) {
        setCustomAIModel({
          data: file,
          name: file.name,
          date: file.lastModified,
          size: file.size,
        });
        alert(`Loaded AI model: ${file.name}`);
        return;
      }

      if (onFileDrop) {
        onFileDrop(file);
        return;
      }

      // Check for unsaved changes first
      const canProceed = await checkUnsavedChanges();
      if (!canProceed) return;

      const reader = new FileReader();
      reader.onload = e => {
        const content = e.target?.result as string;
        if (content) {
          try {
            loadSGF(content);
            setFileName(file.name);
            clearLoadedFile(); // Clear library loaded indicator
          } catch (error) {
            alert(`Failed to load SGF file: ${error}`);
          }
        }
      };
      reader.readAsText(file);
    },
    [loadSGF, setFileName, setCustomAIModel, clearLoadedFile, checkUnsavedChanges]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    // Check if entering library area
    setIsOverLibrary(isInsideLibrary(e.target));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Continuously update library hover state
    setIsOverLibrary(isInsideLibrary(e.target));
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only hide overlay when leaving the dropzone wrapper entirely
    if (e.currentTarget === e.target) {
      setIsDragging(false);
      setIsOverLibrary(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      setIsOverLibrary(false);

      // Don't handle drops on library - LibraryPanel handles those
      if (isInsideLibrary(e.target)) {
        return;
      }

      const file = e.dataTransfer.files?.[0];
      if (file && (file.name.endsWith('.sgf') || file.name.endsWith('.onnx'))) {
        handleFileLoad(file);
      } else if (file) {
        alert('Please drop a .sgf or .onnx file');
      }
    },
    [handleFileLoad]
  );

  return (
    <div
      className={`app-dropzone-wrapper ${isDragging ? 'dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
      {isDragging && !isOverLibrary && (
        <div className="app-dropzone-overlay">
          <div className="app-dropzone-content">
            <div className="app-dropzone-icon">📁</div>
            <div className="app-dropzone-text">{t('dropzone.dropToLoad')}</div>
            <div className="app-dropzone-hint">{t('dropzone.dropOnLibrary')}</div>
          </div>
        </div>
      )}
    </div>
  );
};

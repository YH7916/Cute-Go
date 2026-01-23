/**
 * Library Context
 *
 * Provides library state and operations to components.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import type {
  LibraryItem,
  LibraryFile,
  LibraryFolder,
  LibraryItemId,
  LibraryStats,
  ImportResult,
} from '../services/library/types';
import { getLibraryStorage, initializeLibraryStorage } from '../services/library';
import { makeUniqueName } from '../services/library/utils';
import {
  UnsavedChangesDialog,
  type UnsavedChangesAction,
} from '../components/dialogs/UnsavedChangesDialog';

export interface LibraryContextValue {
  /** Whether the library is initialized */
  isInitialized: boolean;
  /** Whether the library is loading */
  isLoading: boolean;
  /** All library items */
  items: LibraryItem[];
  /** Currently selected item ID */
  selectedId: LibraryItemId | null;
  /** Currently selected item IDs (for multi-select) */
  selectedIds: Set<LibraryItemId>;
  /** Currently expanded folder IDs */
  expandedIds: Set<LibraryItemId>;
  /** Currently loaded file ID (the file displayed on the goban) */
  loadedFileId: LibraryItemId | null;
  /** Library statistics */
  stats: LibraryStats | null;
  /** Error message if any */
  error: string | null;

  // Actions
  /** Refresh the library items */
  refresh: () => Promise<void>;
  /** Select an item (replaces current selection) */
  selectItem: (id: LibraryItemId | null) => void;
  /** Toggle item selection (for ctrl/cmd-click) */
  toggleItemSelection: (id: LibraryItemId) => void;
  /** Select range of items (for shift-click) */
  selectRange: (fromId: LibraryItemId, toId: LibraryItemId) => void;
  /** Clear all selection */
  clearSelection: () => void;
  /** Toggle folder expansion */
  toggleExpanded: (id: LibraryItemId) => void;
  /** Expand a folder */
  expandFolder: (id: LibraryItemId) => void;
  /** Collapse a folder */
  collapseFolder: (id: LibraryItemId) => void;
  /** Create a new folder */
  createFolder: (name: string, parentId?: LibraryItemId | null) => Promise<LibraryFolder>;
  /** Create a new file */
  createFile: (
    name: string,
    content: string,
    parentId?: LibraryItemId | null
  ) => Promise<LibraryFile>;
  /** Rename an item */
  renameItem: (id: LibraryItemId, newName: string) => Promise<void>;
  /** Move an item */
  moveItem: (id: LibraryItemId, newParentId: LibraryItemId | null) => Promise<void>;
  /** Delete an item */
  deleteItem: (id: LibraryItemId) => Promise<void>;
  /** Delete multiple items */
  deleteItems: (ids: LibraryItemId[]) => Promise<void>;
  /** Open a file (load into game tree) */
  openFile: (id: LibraryItemId) => Promise<void>;
  /** Save current game to library */
  saveCurrentGame: (name: string, parentId?: LibraryItemId | null) => Promise<LibraryFile | null>;
  /** Update file content */
  updateFile: (id: LibraryItemId, content: string) => Promise<void>;
  /** Update the currently loaded file with current game content */
  updateLoadedFile: () => Promise<boolean>;
  /** Import ZIP file */
  importZip: (data: ArrayBuffer) => Promise<ImportResult>;
  /** Export library as ZIP */
  exportZip: () => Promise<void>;
  /** Download a single file as .sgf */
  downloadFile: (id: LibraryItemId) => Promise<void>;
  /** Download a folder and its contents as .zip */
  downloadFolder: (id: LibraryItemId) => Promise<void>;
  /** Download multiple items as a single .zip */
  downloadItems: (ids: LibraryItemId[]) => Promise<void>;
  /** Clear all library data */
  clearLibrary: () => Promise<void>;
  /** Clear the loaded file indicator (call when loading from outside library) */
  clearLoadedFile: () => void;
  /** Duplicate an item (file or folder) */
  duplicateItem: (id: LibraryItemId) => Promise<LibraryItem | null>;
  /** Duplicate multiple items */
  duplicateItems: (ids: LibraryItemId[]) => Promise<LibraryItem[]>;
  /** Check for unsaved changes and prompt user. Returns true if safe to proceed. */
  checkUnsavedChanges: () => Promise<boolean>;
}

const LibraryContext = createContext<LibraryContextValue | null>(null);

export interface LibraryProviderProps {
  children: ReactNode;
  /** Callback when a file is opened */
  onFileOpen?: (content: string, name: string) => void;
  /** Get current game content for saving */
  getCurrentGameContent?: () => string | null;
  /** Check if there are unsaved changes */
  getIsDirty?: () => boolean;
  /** Callback after successful save (to reset dirty state) */
  onSaveComplete?: () => void;
}

const LOADED_FILE_ID_KEY = 'kaya-library-loaded-file-id';

export function LibraryProvider({
  children,
  onFileOpen,
  getCurrentGameContent,
  getIsDirty,
  onSaveComplete,
}: LibraryProviderProps) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [selectedId, setSelectedId] = useState<LibraryItemId | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<LibraryItemId>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<LibraryItemId>>(new Set());
  const [loadedFileId, setLoadedFileIdState] = useState<LibraryItemId | null>(() => {
    // Restore from localStorage on initial load
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(LOADED_FILE_ID_KEY);
      return saved ? saved : null;
    }
    return null;
  });
  const [stats, setStats] = useState<LibraryStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Unsaved changes dialog state
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [unsavedDialogCanSave, setUnsavedDialogCanSave] = useState(false);
  const unsavedDialogResolveRef = useRef<((action: UnsavedChangesAction) => void) | null>(null);

  // Persist loadedFileId to localStorage
  const setLoadedFileId = useCallback((id: LibraryItemId | null) => {
    setLoadedFileIdState(id);
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem(LOADED_FILE_ID_KEY, String(id));
      } else {
        localStorage.removeItem(LOADED_FILE_ID_KEY);
      }
    }
  }, []);

  // Initialize storage
  useEffect(() => {
    const init = async () => {
      try {
        await initializeLibraryStorage();
        setIsInitialized(true);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to initialize library');
      } finally {
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Refresh items when initialized
  const refresh = useCallback(async () => {
    if (!isInitialized) return;

    setIsLoading(true);
    try {
      const storage = getLibraryStorage();
      const allItems = await storage.getAllItems();
      const libraryStats = await storage.getStats();
      setItems(allItems);
      setStats(libraryStats);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setIsLoading(false);
    }
  }, [isInitialized]);

  useEffect(() => {
    if (isInitialized) {
      refresh();
    }
  }, [isInitialized, refresh]);

  const selectItem = useCallback((id: LibraryItemId | null) => {
    setSelectedId(id);
    // Also update multi-select: clear and set single selection
    if (id) {
      setSelectedIds(new Set([id]));
    } else {
      setSelectedIds(new Set());
    }
  }, []);

  const toggleItemSelection = useCallback((id: LibraryItemId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Update selectedId: if removed, set to first remaining or null
        if (next.size > 0) {
          setSelectedId([...next][0]);
        } else {
          setSelectedId(null);
        }
      } else {
        next.add(id);
        // Update selectedId to the newly added item
        setSelectedId(id);
      }
      return next;
    });
  }, []);

  // Build a flat list of visible items in tree order for range selection
  const getVisibleItemsInOrder = useCallback((): LibraryItem[] => {
    const result: LibraryItem[] = [];
    const itemMap = new Map(items.map(item => [item.id, item]));

    // Get root items (no parent)
    const rootItems = items.filter(item => !item.parentId);

    // Sort: folders first, then by name
    const sortItems = (itemList: LibraryItem[]) => {
      return [...itemList].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    };

    // Recursively traverse the tree
    const traverse = (parentId: LibraryItemId | null) => {
      const children = parentId ? items.filter(item => item.parentId === parentId) : rootItems;

      for (const item of sortItems(children)) {
        result.push(item);
        if (item.type === 'folder' && expandedIds.has(item.id)) {
          traverse(item.id);
        }
      }
    };

    traverse(null);
    return result;
  }, [items, expandedIds]);

  const selectRange = useCallback(
    (fromId: LibraryItemId, toId: LibraryItemId) => {
      const visibleItems = getVisibleItemsInOrder();
      const fromIndex = visibleItems.findIndex(item => item.id === fromId);
      const toIndex = visibleItems.findIndex(item => item.id === toId);

      if (fromIndex === -1 || toIndex === -1) return;

      const startIndex = Math.min(fromIndex, toIndex);
      const endIndex = Math.max(fromIndex, toIndex);

      const newSelection = new Set<LibraryItemId>();
      for (let i = startIndex; i <= endIndex; i++) {
        newSelection.add(visibleItems[i].id);
      }

      setSelectedIds(newSelection);
      setSelectedId(toId);
    },
    [getVisibleItemsInOrder]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedId(null);
  }, []);

  const toggleExpanded = useCallback((id: LibraryItemId) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const expandFolder = useCallback((id: LibraryItemId) => {
    setExpandedIds(prev => new Set([...prev, id]));
  }, []);

  const collapseFolder = useCallback((id: LibraryItemId) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const createFolder = useCallback(
    async (name: string, parentId: LibraryItemId | null = null) => {
      const storage = getLibraryStorage();
      const folder = await storage.createFolder({ name, parentId });
      await refresh();
      if (parentId) {
        expandFolder(parentId);
      }
      return folder;
    },
    [refresh, expandFolder]
  );

  const createFile = useCallback(
    async (name: string, content: string, parentId: LibraryItemId | null = null) => {
      const storage = getLibraryStorage();
      const file = await storage.createFile({ name, content, parentId });
      await refresh();
      if (parentId) {
        expandFolder(parentId);
      }
      return file;
    },
    [refresh, expandFolder]
  );

  const renameItem = useCallback(
    async (id: LibraryItemId, newName: string) => {
      const storage = getLibraryStorage();
      await storage.renameItem({ itemId: id, newName });
      await refresh();
    },
    [refresh]
  );

  const moveItem = useCallback(
    async (id: LibraryItemId, newParentId: LibraryItemId | null) => {
      const storage = getLibraryStorage();
      await storage.moveItem({ itemId: id, newParentId });
      await refresh();
      if (newParentId) {
        expandFolder(newParentId);
      }
    },
    [refresh, expandFolder]
  );

  const deleteItem = useCallback(
    async (id: LibraryItemId) => {
      const storage = getLibraryStorage();
      await storage.deleteItem(id);
      if (selectedId === id) {
        setSelectedId(null);
      }
      // Remove from multi-selection
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      // Clear loadedFileId if the deleted item was the loaded file
      if (loadedFileId === id) {
        setLoadedFileId(null);
      }
      await refresh();
    },
    [refresh, selectedId, loadedFileId, setLoadedFileId]
  );

  const deleteItems = useCallback(
    async (ids: LibraryItemId[]) => {
      const storage = getLibraryStorage();
      for (const id of ids) {
        await storage.deleteItem(id);
        // Clear loadedFileId if a deleted item was the loaded file
        if (loadedFileId === id) {
          setLoadedFileId(null);
        }
      }
      // Clear selection
      setSelectedId(null);
      setSelectedIds(new Set());
      await refresh();
    },
    [refresh, loadedFileId, setLoadedFileId]
  );

  // Helper to show the unsaved changes dialog and wait for user action
  const showUnsavedChangesDialog = useCallback(
    (canSave: boolean): Promise<UnsavedChangesAction> => {
      return new Promise(resolve => {
        unsavedDialogResolveRef.current = resolve;
        setUnsavedDialogCanSave(canSave);
        setShowUnsavedDialog(true);
      });
    },
    []
  );

  // Handle dialog action
  const handleUnsavedDialogAction = useCallback(
    async (action: UnsavedChangesAction) => {
      setShowUnsavedDialog(false);

      if (action === 'save' && loadedFileId && getCurrentGameContent) {
        // Save the file before resolving
        const content = getCurrentGameContent();
        if (content) {
          const storage = getLibraryStorage();
          const existingFile = await storage.getItem(loadedFileId);
          if (existingFile && existingFile.type === 'file') {
            await storage.updateFile(loadedFileId, content);
            await refresh();
            onSaveComplete?.();
          }
        }
      }

      // Resolve the promise
      if (unsavedDialogResolveRef.current) {
        unsavedDialogResolveRef.current(action);
        unsavedDialogResolveRef.current = null;
      }
    },
    [loadedFileId, getCurrentGameContent, refresh, onSaveComplete]
  );

  // Helper to check for unsaved changes and prompt user
  const checkUnsavedChanges = useCallback(async (): Promise<boolean> => {
    // If no dirty check function or not dirty, proceed
    if (!getIsDirty || !getIsDirty()) {
      return true;
    }

    const canSave = !!(loadedFileId && getCurrentGameContent);
    const action = await showUnsavedChangesDialog(canSave);

    // Cancel means don't proceed
    if (action === 'cancel') {
      return false;
    }

    // Save or discard both mean proceed
    return true;
  }, [getIsDirty, loadedFileId, getCurrentGameContent, showUnsavedChangesDialog]);

  const openFile = useCallback(
    async (id: LibraryItemId) => {
      // Don't prompt if opening the same file
      if (id === loadedFileId) {
        return;
      }

      // Check for unsaved changes before opening
      const canProceed = await checkUnsavedChanges();
      if (!canProceed) {
        return;
      }

      const storage = getLibraryStorage();
      const item = await storage.getItem(id);
      if (item && item.type === 'file' && onFileOpen) {
        // Always pass filename with .sgf extension for consistency
        const nameWithExt = item.name.toLowerCase().endsWith('.sgf')
          ? item.name
          : `${item.name}.sgf`;
        onFileOpen(item.content, nameWithExt);
        setLoadedFileId(id);
      }
    },
    [onFileOpen, loadedFileId, checkUnsavedChanges]
  );

  const clearLoadedFile = useCallback(() => {
    setLoadedFileId(null);
  }, []);

  const saveCurrentGame = useCallback(
    async (name: string, parentId: LibraryItemId | null = null) => {
      if (!getCurrentGameContent) return null;
      const content = getCurrentGameContent();
      if (!content) return null;

      const file = await createFile(name, content, parentId);
      if (file) {
        setLoadedFileId(file.id);
        onSaveComplete?.();
      }
      return file;
    },
    [getCurrentGameContent, createFile, onSaveComplete]
  );

  const updateFile = useCallback(
    async (id: LibraryItemId, content: string) => {
      const storage = getLibraryStorage();
      await storage.updateFile(id, content);
      await refresh();
    },
    [refresh]
  );

  const updateLoadedFile = useCallback(async () => {
    if (!loadedFileId || !getCurrentGameContent) return false;
    const content = getCurrentGameContent();
    if (!content) return false;

    const storage = getLibraryStorage();

    // Check if the file still exists before updating
    const existingFile = await storage.getItem(loadedFileId);
    if (!existingFile || existingFile.type !== 'file') {
      // File was deleted, clear the loaded file ID
      setLoadedFileId(null);
      return false;
    }

    await storage.updateFile(loadedFileId, content);
    await refresh();
    onSaveComplete?.();
    return true;
  }, [loadedFileId, getCurrentGameContent, refresh, setLoadedFileId, onSaveComplete]);

  const importZip = useCallback(
    async (data: ArrayBuffer) => {
      const storage = getLibraryStorage();
      const result = await storage.importZip(data);
      await refresh();
      return result;
    },
    [refresh]
  );

  const exportZip = useCallback(async () => {
    const storage = getLibraryStorage();
    const result = await storage.exportZip();
    if (result.success && result.data) {
      // Create download link
      const url = URL.createObjectURL(result.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kaya-library-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (result.error) {
      setError(result.error);
    }
  }, []);

  const downloadFile = useCallback(async (id: LibraryItemId) => {
    const storage = getLibraryStorage();
    const item = await storage.getItem(id);
    if (!item || item.type !== 'file') return;

    // Create download link for SGF file
    const blob = new Blob([item.content], { type: 'application/x-go-sgf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // Ensure filename has .sgf extension
    const filename = item.name.toLowerCase().endsWith('.sgf') ? item.name : `${item.name}.sgf`;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const downloadFolder = useCallback(async (id: LibraryItemId) => {
    const storage = getLibraryStorage();
    const folder = await storage.getItem(id);
    if (!folder || folder.type !== 'folder') return;

    try {
      // Dynamic import of JSZip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const allItems = await storage.getAllItems();

      // Build path map for items, relative to this folder (without root folder name)
      const pathMap = new Map<LibraryItemId, string>();

      // Find all descendants of this folder
      const isDescendantOf = (item: LibraryItem, ancestorId: LibraryItemId): boolean => {
        if (item.parentId === ancestorId) return true;
        if (item.parentId === null) return false;
        const parent = allItems.find(i => i.id === item.parentId);
        return parent ? isDescendantOf(parent, ancestorId) : false;
      };

      // Build relative path (without root folder name)
      const buildRelativePath = (item: LibraryItem): string => {
        if (pathMap.has(item.id)) {
          return pathMap.get(item.id)!;
        }

        let path = item.name;
        if (item.parentId && item.parentId !== id) {
          const parent = allItems.find(i => i.id === item.parentId);
          if (parent) {
            path = buildRelativePath(parent) + '/' + path;
          }
        }
        pathMap.set(item.id, path);
        return path;
      };

      // Add all descendant files to zip, with root folder name prepended
      for (const item of allItems) {
        if (item.type === 'file' && (item.parentId === id || isDescendantOf(item, id))) {
          const relativePath = buildRelativePath(item);
          // Prepend root folder name and ensure .sgf extension
          const fullPath = folder.name + '/' + relativePath;
          const filename = item.name.toLowerCase().endsWith('.sgf') ? fullPath : `${fullPath}.sgf`;
          zip.file(filename, item.content);
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder.name}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(
        `Failed to download folder: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }, []);

  const downloadItems = useCallback(
    async (ids: LibraryItemId[]) => {
      if (ids.length === 0) return;

      // If only one item, use single download
      if (ids.length === 1) {
        const storage = getLibraryStorage();
        const item = await storage.getItem(ids[0]);
        if (!item) return;
        if (item.type === 'file') {
          await downloadFile(ids[0]);
        } else {
          await downloadFolder(ids[0]);
        }
        return;
      }

      try {
        const storage = getLibraryStorage();
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();

        const allItems = await storage.getAllItems();
        const itemMap = new Map(allItems.map(item => [item.id, item]));

        // Helper to check if an item is a descendant of another
        const isDescendantOf = (itemId: LibraryItemId, ancestorId: LibraryItemId): boolean => {
          const item = itemMap.get(itemId);
          if (!item) return false;
          if (item.parentId === ancestorId) return true;
          if (item.parentId === null) return false;
          return isDescendantOf(item.parentId, ancestorId);
        };

        // Filter out items that are descendants of other selected items
        // (they'll be included via their parent folder)
        const topLevelIds = ids.filter(id => {
          return !ids.some(otherId => otherId !== id && isDescendantOf(id, otherId));
        });

        // Helper to add folder contents recursively
        const addFolderToZip = (folderId: LibraryItemId, basePath: string) => {
          const children = allItems.filter(item => item.parentId === folderId);
          for (const child of children) {
            const path = basePath + '/' + child.name;
            if (child.type === 'file') {
              const filename = child.name.toLowerCase().endsWith('.sgf') ? path : `${path}.sgf`;
              zip.file(filename, child.content);
            } else {
              addFolderToZip(child.id, path);
            }
          }
        };

        // Add each top-level selected item
        for (const id of topLevelIds) {
          const item = itemMap.get(id);
          if (!item) continue;

          if (item.type === 'file') {
            const filename = item.name.toLowerCase().endsWith('.sgf')
              ? item.name
              : `${item.name}.sgf`;
            zip.file(filename, item.content);
          } else {
            addFolderToZip(item.id, item.name);
          }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `kaya-selection-${new Date().toISOString().slice(0, 10)}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (error) {
        setError(
          `Failed to download items: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
    [downloadFile, downloadFolder]
  );

  const clearLibrary = useCallback(async () => {
    const storage = getLibraryStorage();
    await storage.clear();
    setSelectedId(null);
    setExpandedIds(new Set());
    await refresh();
  }, [refresh]);

  const duplicateItem = useCallback(
    async (id: LibraryItemId): Promise<LibraryItem | null> => {
      const storage = getLibraryStorage();
      const item = await storage.getItem(id);
      if (!item) return null;

      // Get siblings to determine unique name
      const siblings = await storage.getItems(item.parentId);
      const siblingNames = siblings.map(s => ({ name: s.name, id: s.id }));

      // Create a base name with " (copy)" suffix, then ensure uniqueness
      // For files with .sgf extension, insert before the extension
      const createCopyName = (name: string): string => {
        const lowerName = name.toLowerCase();
        if (lowerName.endsWith('.sgf')) {
          const baseName = name.slice(0, -4);
          return `${baseName} (copy).sgf`;
        }
        return `${name} (copy)`;
      };

      const copyBaseName = createCopyName(item.name);
      const uniqueName = makeUniqueName(copyBaseName, siblingNames);

      if (item.type === 'file') {
        // For files, create a copy with unique name
        const newFile = await storage.createFile({
          name: uniqueName,
          content: item.content,
          parentId: item.parentId,
        });
        await refresh();
        return newFile;
      } else {
        // For folders, recursively duplicate the folder and all its contents

        // Recursive function to duplicate folder contents
        const duplicateFolderContents = async (
          sourceParentId: LibraryItemId,
          destParentId: LibraryItemId
        ) => {
          const children = await storage.getItems(sourceParentId);
          for (const child of children) {
            if (child.type === 'file') {
              await storage.createFile({
                name: child.name,
                content: child.content,
                parentId: destParentId,
              });
            } else {
              // Create subfolder and recursively copy its contents
              const newSubfolder = await storage.createFolder({
                name: child.name,
                parentId: destParentId,
              });
              await duplicateFolderContents(child.id, newSubfolder.id);
            }
          }
        };

        // Create the new folder
        const newFolder = await storage.createFolder({
          name: uniqueName,
          parentId: item.parentId,
        });

        // Copy all contents
        await duplicateFolderContents(item.id, newFolder.id);
        await refresh();
        return newFolder;
      }
    },
    [refresh]
  );

  const duplicateItems = useCallback(
    async (ids: LibraryItemId[]): Promise<LibraryItem[]> => {
      const results: LibraryItem[] = [];
      for (const id of ids) {
        const result = await duplicateItem(id);
        if (result) {
          results.push(result);
        }
      }
      return results;
    },
    [duplicateItem]
  );

  const value = useMemo<LibraryContextValue>(
    () => ({
      isInitialized,
      isLoading,
      items,
      selectedId,
      selectedIds,
      expandedIds,
      loadedFileId,
      stats,
      error,
      refresh,
      selectItem,
      toggleItemSelection,
      selectRange,
      clearSelection,
      toggleExpanded,
      expandFolder,
      collapseFolder,
      createFolder,
      createFile,
      renameItem,
      moveItem,
      deleteItem,
      deleteItems,
      openFile,
      saveCurrentGame,
      updateFile,
      updateLoadedFile,
      importZip,
      exportZip,
      downloadFile,
      downloadFolder,
      downloadItems,
      clearLibrary,
      clearLoadedFile,
      duplicateItem,
      duplicateItems,
      checkUnsavedChanges,
    }),
    [
      isInitialized,
      isLoading,
      items,
      selectedId,
      selectedIds,
      expandedIds,
      loadedFileId,
      stats,
      error,
      refresh,
      selectItem,
      toggleItemSelection,
      selectRange,
      clearSelection,
      toggleExpanded,
      expandFolder,
      collapseFolder,
      createFolder,
      createFile,
      renameItem,
      moveItem,
      deleteItem,
      deleteItems,
      openFile,
      saveCurrentGame,
      updateFile,
      updateLoadedFile,
      importZip,
      exportZip,
      downloadFile,
      downloadFolder,
      downloadItems,
      clearLibrary,
      clearLoadedFile,
      duplicateItem,
      duplicateItems,
      checkUnsavedChanges,
    ]
  );

  return (
    <LibraryContext.Provider value={value}>
      {children}
      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        canSave={unsavedDialogCanSave}
        onAction={handleUnsavedDialogAction}
      />
    </LibraryContext.Provider>
  );
}

export function useLibrary(): LibraryContextValue {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
}

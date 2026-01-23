/**
 * Library Panel Component
 *
 * A collapsible panel for managing the game library.
 */

import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type DragEvent,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Tree, type NodeRendererProps, type DragPreviewProps } from 'react-arborist';
import {
  LuFolder,
  LuFile,
  LuFolderPlus,
  LuUpload,
  LuDownload,
  LuChevronRight,
  LuTrash2,
  LuPencil,
  LuFolderOpen,
  LuPlay,
  LuTriangleAlert,
  LuCopy,
} from 'react-icons/lu';
import { useLibrary } from '../../contexts/LibraryContext';
import { useTauriDrag } from '../../contexts/TauriDragContext';
import { useGameTreeFile } from '../../contexts/selectors';
import { useToast } from '../ui/Toast';
import type { LibraryItem, LibraryItemId } from '../../services/library/types';
import { formatFileSize } from '../../services/library/utils';
import './LibraryPanel.css';
interface TreeNode {
  id: string;
  name: string;
  children?: TreeNode[];
  data: LibraryItem;
}

interface ContextMenuState {
  x: number;
  y: number;
  item: LibraryItem | null; // null when right-clicking empty space
}

export interface LibraryPanelProps {
  /** Panel width in pixels */
  width?: number;
  /** Whether the panel is collapsed */
  collapsed?: boolean;
  /** Callback when collapse state changes */
  onCollapseChange?: (collapsed: boolean) => void;
}

// Custom drag preview that follows the cursor properly
const DragPreview: React.FC<DragPreviewProps> = ({ mouse, isDragging, dragIds }) => {
  if (!isDragging || !mouse) return null;

  return (
    <div
      className="library-drag-preview"
      style={{
        position: 'fixed',
        left: mouse.x + 8,
        top: mouse.y - 8,
        pointerEvents: 'none',
        zIndex: 9999,
        transform: 'translateY(-50%)',
      }}
    >
      {dragIds.length === 1 ? '📄 Moving item...' : `📄 Moving ${dragIds.length} items...`}
    </div>
  );
};

export function LibraryPanel({ collapsed = false, onCollapseChange }: LibraryPanelProps) {
  const { t } = useTranslation();
  const {
    isInitialized,
    isLoading,
    items,
    selectedId,
    selectedIds,
    expandedIds,
    loadedFileId,
    stats,
    error,
    selectItem,
    toggleItemSelection,
    selectRange,
    clearSelection,
    toggleExpanded,
    createFolder,
    createFile,
    deleteItem,
    deleteItems,
    renameItem,
    moveItem,
    openFile,
    importZip,
    exportZip,
    downloadFile,
    downloadFolder,
    downloadItems,
    clearLibrary,
    duplicateItem,
    duplicateItems,
  } = useLibrary();

  // Get Tauri drag state (for native file drag-drop in desktop app)
  const { isTauriDragging, isOverLibrary: isTauriOverLibrary } = useTauriDrag();

  const { isDirty } = useGameTreeFile();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingId, setRenamingId] = useState<LibraryItemId | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderParent, setNewFolderParent] = useState<LibraryItemId | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    danger?: boolean;
  } | null>(null);

  // Track last clicked item for shift-click range selection
  const lastClickedIdRef = useRef<LibraryItemId | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const renameInputInitialized = useRef(false);
  const newFolderInputInitialized = useRef(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [treeHeight, setTreeHeight] = useState(400);
  const [treeWidth, setTreeWidth] = useState(250);

  // Build tree structure from flat items
  const buildTree = useCallback((): TreeNode[] => {
    const itemMap = new Map<string, TreeNode>();
    const roots: TreeNode[] = [];

    // Create all nodes
    for (const item of items) {
      itemMap.set(item.id, {
        id: item.id,
        name: item.name,
        children: item.type === 'folder' ? [] : undefined,
        data: item,
      });
    }

    // Build hierarchy
    for (const item of items) {
      const node = itemMap.get(item.id)!;
      if (item.parentId && itemMap.has(item.parentId)) {
        const parent = itemMap.get(item.parentId)!;
        parent.children?.push(node);
      } else {
        roots.push(node);
      }
    }

    // Sort: folders first, then by name
    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.data.type !== b.data.type) {
          return a.data.type === 'folder' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
      for (const node of nodes) {
        if (node.children) {
          sortNodes(node.children);
        }
      }
    };
    sortNodes(roots);

    return roots;
  }, [items]);

  const treeData = buildTree();

  // Compute ancestor folder IDs for the loaded file (for visual hint when collapsed)
  const loadedFileAncestorIds = useMemo(() => {
    if (!loadedFileId) return new Set<LibraryItemId>();

    const ancestors = new Set<LibraryItemId>();
    const loadedItem = items.find(item => item.id === loadedFileId);
    if (!loadedItem) return ancestors;

    let parentId = loadedItem.parentId;
    while (parentId) {
      ancestors.add(parentId);
      const parent = items.find(item => item.id === parentId);
      parentId = parent?.parentId ?? null;
    }
    return ancestors;
  }, [loadedFileId, items]);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Measure content container height and width for tree
  // Uses ResizeObserver contentRect to avoid forced reflows (clientHeight/clientWidth trigger layout)
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;

    const updateDimensions = (width: number, height: number) => {
      // Subtract padding (8px each side = 16px)
      const adjustedHeight = height - 16;
      const adjustedWidth = width - 16;
      if (adjustedHeight > 0) {
        setTreeHeight(adjustedHeight);
      }
      if (adjustedWidth > 0) {
        setTreeWidth(adjustedWidth);
      }
    };

    // Initial measurement (only once on mount)
    const rect = container.getBoundingClientRect();
    updateDimensions(rect.width, rect.height);

    const resizeObserver = new ResizeObserver(entries => {
      // Use contentRect from ResizeObserver to avoid forced reflows
      for (const entry of entries) {
        updateDimensions(entry.contentRect.width, entry.contentRect.height);
      }
    });
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Handle external file drop (from OS)
  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>) => {
      // Check if this is an internal drag (from react-arborist)
      // Internal drags don't have files in dataTransfer
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) {
        // Let react-arborist handle internal drags
        return;
      }

      e.preventDefault();
      e.stopPropagation(); // Prevent AppDropZone from handling external files
      setIsDraggingOver(false);

      // Determine target folder: use selected folder or parent of selected file
      let targetFolderId: string | null = null;
      if (selectedId) {
        const selectedItem = items.find(i => i.id === selectedId);
        if (selectedItem) {
          targetFolderId = selectedItem.type === 'folder' ? selectedId : selectedItem.parentId;
        }
      }

      for (const file of files) {
        if (file.name.toLowerCase().endsWith('.sgf')) {
          const content = await file.text();
          try {
            await createFile(file.name, content, targetFolderId);
          } catch {
            // Ignore invalid files
          }
        } else if (file.name.toLowerCase().endsWith('.zip')) {
          const buffer = await file.arrayBuffer();
          await importZip(buffer);
        }
      }
    },
    [createFile, importZip, selectedId, items]
  );

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    // Only handle external file drags, not internal react-arborist drags
    if (!e.dataTransfer.types.includes('Files')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation(); // Prevent AppDropZone from handling this
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      // Only handle if we were showing the drag indicator
      if (!isDraggingOver) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDraggingOver(false);
    },
    [isDraggingOver]
  );

  // Handle context menu on an item
  const handleContextMenu = useCallback((e: MouseEvent, item: LibraryItem) => {
    e.preventDefault();
    e.stopPropagation();

    // Use viewport coordinates for fixed positioning
    // We'll adjust in the render to keep menu within viewport
    setContextMenu({ x: e.clientX, y: e.clientY, item });
  }, []);

  // Handle context menu on empty space (for creating folders at root)
  const handleEmptySpaceContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, item: null });
  }, []);

  // Handle file import
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      for (const file of Array.from(files)) {
        if (file.name.toLowerCase().endsWith('.sgf')) {
          const content = await file.text();
          try {
            await createFile(file.name, content, null);
          } catch {
            // Ignore invalid files
          }
        } else if (file.name.toLowerCase().endsWith('.zip')) {
          const buffer = await file.arrayBuffer();
          await importZip(buffer);
        }
      }

      // Reset input
      e.target.value = '';
    },
    [createFile, importZip]
  );

  // Handle new folder
  const handleNewFolder = useCallback(
    (parentIdOverride?: string | null) => {
      let parentId: string | null = null;
      if (parentIdOverride !== undefined) {
        parentId = parentIdOverride;
      } else {
        const selectedItem = selectedId ? items.find(i => i.id === selectedId) : null;
        parentId = selectedItem?.type === 'folder' ? selectedId : selectedItem?.parentId || null;
      }
      setNewFolderParent(parentId);
      setNewFolderName('New Folder');
      newFolderInputInitialized.current = false;
      setShowNewFolderDialog(true);
    },
    [selectedId, items]
  );

  const handleCreateFolder = useCallback(async () => {
    if (newFolderName.trim()) {
      await createFolder(newFolderName.trim(), newFolderParent);
    }
    setShowNewFolderDialog(false);
    setNewFolderName('');
    setNewFolderParent(null);
  }, [newFolderName, newFolderParent, createFolder]);

  // Toast for save feedback
  const { showToast } = useToast();

  // Handle rename
  const startRename = useCallback((item: LibraryItem) => {
    renameInputInitialized.current = false;
    setRenamingId(item.id);
    setRenameValue(item.name);
    setContextMenu(null);
  }, []);

  const handleRename = useCallback(async () => {
    if (renamingId && renameValue.trim()) {
      await renameItem(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue('');
  }, [renamingId, renameValue, renameItem]);

  // Handle delete with confirmation modal (single item)
  const handleDelete = useCallback(
    (item: LibraryItem) => {
      const title = item.type === 'folder' ? 'Delete Folder' : 'Delete File';
      const message =
        item.type === 'folder'
          ? `Delete folder "${item.name}" and all its contents?`
          : `Delete "${item.name}"?`;

      setConfirmDialog({
        title,
        message,
        danger: true,
        onConfirm: async () => {
          await deleteItem(item.id);
          setConfirmDialog(null);
        },
      });
      setContextMenu(null);
    },
    [deleteItem]
  );

  // Handle batch delete with confirmation modal
  const handleBatchDelete = useCallback(
    (ids: LibraryItemId[]) => {
      const count = ids.length;
      setConfirmDialog({
        title: `Delete ${count} Items`,
        message: `Delete ${count} selected items? This cannot be undone.`,
        danger: true,
        onConfirm: async () => {
          await deleteItems(ids);
          setConfirmDialog(null);
        },
      });
      setContextMenu(null);
    },
    [deleteItems]
  );

  // Handle batch download
  const handleBatchDownload = useCallback(
    async (ids: LibraryItemId[]) => {
      await downloadItems(ids);
      setContextMenu(null);
    },
    [downloadItems]
  );

  // Handle batch duplicate
  const handleBatchDuplicate = useCallback(
    async (ids: LibraryItemId[]) => {
      await duplicateItems(ids);
      setContextMenu(null);
    },
    [duplicateItems]
  );

  // Handle clear all library
  const handleClearLibrary = useCallback(() => {
    if (items.length === 0) return;

    setConfirmDialog({
      title: 'Clear Library',
      message: `Delete all ${items.length} items from your library? This cannot be undone.`,
      danger: true,
      onConfirm: async () => {
        await clearLibrary();
        setConfirmDialog(null);
      },
    });
  }, [items.length, clearLibrary]);

  // Handle open
  const handleOpen = useCallback(
    (item: LibraryItem) => {
      if (item.type === 'file') {
        openFile(item.id);
      } else {
        toggleExpanded(item.id);
      }
      setContextMenu(null);
    },
    [openFile, toggleExpanded]
  );

  // Ref to track last click time for manual double-click detection
  const lastClickTimeRef = useRef<number>(0);
  const lastClickIdRef = useRef<string | null>(null);

  // Tree node renderer
  const NodeRenderer = useCallback(
    ({ node, style, dragHandle }: NodeRendererProps<TreeNode>) => {
      const item = node.data.data;
      const isFolder = item.type === 'folder';
      const isSelected = selectedIds.has(item.id);
      const isExpanded = node.isOpen;
      const isRenaming = renamingId === item.id;
      const isDropTarget = node.willReceiveDrop;
      const isLoaded = loadedFileId === item.id;
      // Show hint on collapsed folders that contain the loaded file
      const hasLoadedDescendant = isFolder && !isExpanded && loadedFileAncestorIds.has(item.id);

      const handleClick = (e: React.MouseEvent) => {
        const now = Date.now();
        const isDoubleClick =
          lastClickIdRef.current === item.id && now - lastClickTimeRef.current < 400;

        // Update last click tracking
        lastClickTimeRef.current = now;
        lastClickIdRef.current = item.id;

        // Handle double-click (open file or toggle folder)
        if (isDoubleClick && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
          if (item.type === 'file') {
            openFile(item.id);
          }
          // For folders, the first click already toggled it, so no action needed
          return;
        }

        // Handle multi-select with shift and ctrl/cmd
        if (e.shiftKey && lastClickedIdRef.current) {
          // Shift-click: select range
          e.preventDefault();
          selectRange(lastClickedIdRef.current, item.id);
        } else if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd-click: toggle selection
          e.preventDefault();
          toggleItemSelection(item.id);
          lastClickedIdRef.current = item.id;
        } else {
          // Normal click: single selection
          selectItem(item.id);
          lastClickedIdRef.current = item.id;
          if (item.type === 'folder') {
            node.toggle();
          }
        }
      };

      return (
        <div
          ref={dragHandle}
          style={style}
          className={`library-tree-node ${isSelected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''} ${isLoaded ? 'loaded' : ''} ${hasLoadedDescendant ? 'has-loaded' : ''}`}
          onClick={handleClick}
          onContextMenu={e => handleContextMenu(e, item)}
        >
          {isFolder && (
            <span
              className={`library-tree-node-arrow ${isExpanded ? 'expanded' : ''}`}
              onClick={e => {
                e.stopPropagation();
                node.toggle();
              }}
            >
              <LuChevronRight size={14} />
            </span>
          )}
          <span className="library-tree-node-icon">
            {isFolder ? (
              isExpanded ? (
                <LuFolderOpen size={16} />
              ) : (
                <LuFolder size={16} />
              )
            ) : (
              <LuFile size={16} />
            )}
          </span>
          {isRenaming ? (
            <input
              type="text"
              className="library-tree-node-input"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={handleRename}
              onKeyDown={e => {
                // Stop propagation to prevent global shortcuts
                e.stopPropagation();
                if (e.key === 'Enter') handleRename();
                if (e.key === 'Escape') {
                  setRenamingId(null);
                  setRenameValue('');
                }
              }}
              onKeyUp={e => e.stopPropagation()}
              onKeyPress={e => e.stopPropagation()}
              autoFocus
              onClick={e => e.stopPropagation()}
              ref={input => {
                // Select all text only when input is first mounted
                if (input && !renameInputInitialized.current) {
                  renameInputInitialized.current = true;
                  input.focus();
                  input.select();
                }
              }}
            />
          ) : (
            <span className="library-tree-node-name">
              {isLoaded && isDirty && (
                <span className="library-dirty-indicator" title="Unsaved changes">
                  •
                </span>
              )}
              {item.name}
            </span>
          )}
          {item.type === 'file' && (
            <span className="library-tree-node-meta">{formatFileSize(item.size)}</span>
          )}
        </div>
      );
    },
    [
      selectedIds,
      renamingId,
      renameValue,
      loadedFileId,
      loadedFileAncestorIds,
      isDirty,
      selectItem,
      selectRange,
      toggleItemSelection,
      handleContextMenu,
      handleRename,
      openFile,
    ]
  );

  // Handle tree move (drag and drop)
  const handleTreeMove = useCallback(
    async (args: { dragIds: string[]; parentId: string | null; index: number }) => {
      const { dragIds, parentId } = args;
      for (const id of dragIds) {
        await moveItem(id, parentId);
      }
    },
    [moveItem]
  );

  // Handle move to root (from context menu)
  const handleMoveToRoot = useCallback(
    async (item: LibraryItem) => {
      if (item.parentId !== null) {
        await moveItem(item.id, null);
      }
      setContextMenu(null);
    },
    [moveItem]
  );

  // Handle duplicate (from context menu)
  const handleDuplicate = useCallback(
    async (item: LibraryItem) => {
      await duplicateItem(item.id);
      setContextMenu(null);
    },
    [duplicateItem]
  );

  if (collapsed) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="library-panel"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <div className="library-header">
        <div className="library-actions">
          <button
            className="library-btn"
            onClick={() => handleNewFolder()}
            title={t('library.newFolder')}
          >
            <LuFolderPlus size={16} />
          </button>
          <button
            className="library-btn"
            onClick={handleImportClick}
            title={t('library.importSgfZip')}
          >
            <LuUpload size={16} />
          </button>
          <button
            className="library-btn"
            onClick={exportZip}
            title={t('library.exportLibraryAsZip')}
          >
            <LuDownload size={16} />
          </button>
          <button
            className="library-btn danger"
            onClick={handleClearLibrary}
            title={t('library.clearLibrary')}
            disabled={items.length === 0}
          >
            <LuTrash2 size={16} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="library-content" ref={contentRef} onContextMenu={handleEmptySpaceContextMenu}>
        {error && <div className="library-error">{error}</div>}

        {isLoading && !isInitialized ? (
          <div className="library-loading">{t('library.loading')}</div>
        ) : items.length === 0 ? (
          <div className="library-empty">
            <div className="library-empty-icon">📚</div>
            <div className="library-empty-text">{t('library.emptyLibrary')}</div>
            <div className="library-empty-hint">{t('library.emptyLibraryHint')}</div>
          </div>
        ) : (
          <div className="library-tree" onWheel={e => e.stopPropagation()}>
            <Tree
              data={treeData}
              openByDefault={false}
              width={treeWidth}
              height={treeHeight}
              indent={16}
              rowHeight={32}
              selection={selectedId || undefined}
              onMove={handleTreeMove}
              disableDrag={false}
              disableDrop={args => {
                // Allow drop on root (parentNode is null) or on folders only
                if (!args.parentNode) return false;
                // parentNode.data is our TreeNode, and TreeNode.data is the LibraryItem
                const treeNode = args.parentNode.data;
                if (!treeNode || !treeNode.data) return true; // Disable drop if no data
                return treeNode.data.type !== 'folder';
              }}
              dndRootElement={panelRef.current}
              renderDragPreview={DragPreview}
            >
              {NodeRenderer}
            </Tree>
          </div>
        )}
      </div>

      {/* Selection bar - shows when multiple items selected */}
      {selectedIds.size > 1 && (
        <div className="library-selection-bar">
          <span className="library-selection-count">
            {t('library.itemsSelected', { count: selectedIds.size })}
          </span>
          <div className="library-selection-actions">
            <button
              className="library-btn"
              onClick={() => handleBatchDuplicate([...selectedIds])}
              title={t('library.duplicateSelected')}
            >
              <LuCopy size={14} />
            </button>
            <button
              className="library-btn"
              onClick={() => handleBatchDownload([...selectedIds])}
              title={t('library.downloadSelected')}
            >
              <LuDownload size={14} />
            </button>
            <button
              className="library-btn danger"
              onClick={() => handleBatchDelete([...selectedIds])}
              title={t('library.deleteSelected')}
            >
              <LuTrash2 size={14} />
            </button>
            <button
              className="library-btn"
              onClick={clearSelection}
              title={t('library.clearSelection')}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      {stats && stats.totalFiles > 0 && selectedIds.size <= 1 && (
        <div className="library-stats">
          {t('library.gamesCount', { count: stats.totalFiles })} •{' '}
          {t('library.foldersCount', { count: stats.totalFolders })} •{' '}
          {formatFileSize(stats.totalSize)}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".sgf,.zip"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Drop overlay - show for HTML5 drags OR Tauri native drags over library */}
      {(isDraggingOver || (isTauriDragging && isTauriOverLibrary)) && (
        <div className="library-drop-zone">
          <span className="library-drop-zone-text">{t('library.dropToAdd')}</span>
        </div>
      )}

      {/* Context menu - rendered in portal for proper positioning */}
      {contextMenu &&
        createPortal(
          <div
            className="library-context-menu"
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
            }}
            ref={el => {
              // Adjust position if menu goes outside viewport
              if (el) {
                const rect = el.getBoundingClientRect();
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                let newLeft = contextMenu.x;
                let newTop = contextMenu.y;

                // Adjust horizontal position if needed
                if (rect.right > viewportWidth) {
                  newLeft = viewportWidth - rect.width - 8;
                }
                if (newLeft < 0) newLeft = 8;

                // Adjust vertical position if needed
                if (rect.bottom > viewportHeight) {
                  newTop = viewportHeight - rect.height - 8;
                }
                if (newTop < 0) newTop = 8;

                // Apply adjusted position
                if (newLeft !== contextMenu.x || newTop !== contextMenu.y) {
                  el.style.left = `${newLeft}px`;
                  el.style.top = `${newTop}px`;
                }
              }
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Empty space context menu - only show New Folder */}
            {contextMenu.item === null ? (
              <div
                className="library-context-menu-item"
                onClick={() => {
                  handleNewFolder(null);
                  setContextMenu(null);
                }}
              >
                <span className="library-context-menu-item-icon">
                  <LuFolderPlus size={14} />
                </span>
                {t('library.newFolder')}
              </div>
            ) : /* Show batch operations if multiple items selected */
            selectedIds.size > 1 ? (
              <>
                <div className="library-context-menu-header">
                  {t('library.itemsSelected', { count: selectedIds.size })}
                </div>
                <div className="library-context-menu-separator" />
                <div
                  className="library-context-menu-item"
                  onClick={() => handleBatchDuplicate([...selectedIds])}
                >
                  <span className="library-context-menu-item-icon">
                    <LuCopy size={14} />
                  </span>
                  {t('library.duplicateItems', { count: selectedIds.size })}
                </div>
                <div
                  className="library-context-menu-item"
                  onClick={() => handleBatchDownload([...selectedIds])}
                >
                  <span className="library-context-menu-item-icon">
                    <LuDownload size={14} />
                  </span>
                  {t('library.downloadItems', { count: selectedIds.size })}
                </div>
                <div className="library-context-menu-separator" />
                <div
                  className="library-context-menu-item danger"
                  onClick={() => handleBatchDelete([...selectedIds])}
                >
                  <span className="library-context-menu-item-icon">
                    <LuTrash2 size={14} />
                  </span>
                  {t('library.deleteItems', { count: selectedIds.size })}
                </div>
              </>
            ) : (
              <>
                {(() => {
                  const item = contextMenu.item!; // Non-null assertion safe here due to outer check
                  return (
                    <>
                      {item.type === 'file' && (
                        <div className="library-context-menu-item" onClick={() => handleOpen(item)}>
                          <span className="library-context-menu-item-icon">
                            <LuPlay size={14} />
                          </span>
                          {t('library.load')}
                        </div>
                      )}
                      {item.type === 'folder' && (
                        <div
                          className="library-context-menu-item"
                          onClick={() => {
                            handleNewFolder(item.id);
                            setContextMenu(null);
                          }}
                        >
                          <span className="library-context-menu-item-icon">
                            <LuFolderPlus size={14} />
                          </span>
                          {t('library.newFolder')}
                        </div>
                      )}
                      <div className="library-context-menu-item" onClick={() => startRename(item)}>
                        <span className="library-context-menu-item-icon">
                          <LuPencil size={14} />
                        </span>
                        {t('library.rename')}
                      </div>
                      <div
                        className="library-context-menu-item"
                        onClick={() => handleDuplicate(item)}
                      >
                        <span className="library-context-menu-item-icon">
                          <LuCopy size={14} />
                        </span>
                        {t('library.duplicate')}
                      </div>
                      <div
                        className="library-context-menu-item"
                        onClick={() => {
                          if (item.type === 'file') {
                            downloadFile(item.id);
                          } else {
                            downloadFolder(item.id);
                          }
                          setContextMenu(null);
                        }}
                      >
                        <span className="library-context-menu-item-icon">
                          <LuDownload size={14} />
                        </span>
                        {t('library.download')}
                      </div>
                      {/* Show "Move to Root" only if item is inside a folder */}
                      {item.parentId !== null && (
                        <>
                          <div className="library-context-menu-separator" />
                          <div
                            className="library-context-menu-item"
                            onClick={() => handleMoveToRoot(item)}
                          >
                            <span className="library-context-menu-item-icon">
                              <LuFolder size={14} />
                            </span>
                            {t('library.moveToRoot')}
                          </div>
                        </>
                      )}
                      <div className="library-context-menu-separator" />
                      <div
                        className="library-context-menu-item danger"
                        onClick={() => handleDelete(item)}
                      >
                        <span className="library-context-menu-item-icon">
                          <LuTrash2 size={14} />
                        </span>
                        {t('library.delete')}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>,
          document.body
        )}

      {/* New Folder Dialog */}
      {showNewFolderDialog &&
        createPortal(
          <div className="library-dialog-overlay" onClick={() => setShowNewFolderDialog(false)}>
            <div className="library-dialog" onClick={e => e.stopPropagation()}>
              <div className="library-dialog-title">{t('library.newFolder')}</div>
              <input
                type="text"
                className="library-dialog-input"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  e.stopPropagation();
                  if (e.key === 'Enter') handleCreateFolder();
                  if (e.key === 'Escape') setShowNewFolderDialog(false);
                }}
                onKeyUp={e => e.stopPropagation()}
                onKeyPress={e => e.stopPropagation()}
                autoFocus
                ref={input => {
                  if (input && !newFolderInputInitialized.current) {
                    newFolderInputInitialized.current = true;
                    input.focus();
                    input.select();
                  }
                }}
              />
              <div className="library-dialog-buttons">
                <button
                  className="library-dialog-btn secondary"
                  onClick={() => setShowNewFolderDialog(false)}
                >
                  {t('cancel')}
                </button>
                <button className="library-dialog-btn primary" onClick={handleCreateFolder}>
                  {t('library.create')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Confirmation Dialog */}
      {confirmDialog &&
        createPortal(
          <div className="library-dialog-overlay" onClick={() => setConfirmDialog(null)}>
            <div
              className={`library-dialog ${confirmDialog.danger ? 'danger' : ''}`}
              onClick={e => e.stopPropagation()}
            >
              <div className="library-dialog-header">
                {confirmDialog.danger && (
                  <span className="library-dialog-icon">
                    <LuTriangleAlert size={20} />
                  </span>
                )}
                <div className="library-dialog-title">{confirmDialog.title}</div>
              </div>
              <div className="library-dialog-message">{confirmDialog.message}</div>
              <div className="library-dialog-buttons">
                <button
                  className="library-dialog-btn secondary"
                  onClick={() => setConfirmDialog(null)}
                >
                  {t('cancel')}
                </button>
                <button
                  className={`library-dialog-btn ${confirmDialog.danger ? 'danger' : 'primary'}`}
                  onClick={confirmDialog.onConfirm}
                >
                  {t('library.delete')}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

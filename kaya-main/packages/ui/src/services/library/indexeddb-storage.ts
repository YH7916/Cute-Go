/**
 * IndexedDB Storage Implementation
 *
 * Web-based storage using IndexedDB for the game library.
 * Works in both web and desktop (Tauri) environments.
 */

import type JSZipType from 'jszip';
import type {
  LibraryStorage,
  LibraryItem,
  LibraryFile,
  LibraryFolder,
  LibraryItemId,
  CreateFileOptions,
  CreateFolderOptions,
  MoveItemOptions,
  RenameItemOptions,
  ImportResult,
  ExportResult,
  LibraryStats,
} from './types';
import {
  generateId,
  now,
  extractSGFMetadata,
  isValidSGF,
  sanitizeFilename,
  ensureSGFExtension,
  makeUniqueName,
  getExtension,
} from './utils';

const DB_NAME = 'kaya-library';
const DB_VERSION = 1;
const STORE_NAME = 'items';

// Migration key to track if .sgf extension migration has run
const MIGRATION_KEY = 'kaya-library-sgf-extension-migrated';

export class IndexedDBStorage implements LibraryStorage {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;
  private initError: Error | null = null;

  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.db) return;

    // If initialization failed previously, throw the cached error
    if (this.initError) {
      throw this.initError;
    }

    // If initialization is in progress, wait for it
    if (this.initPromise) {
      return this.initPromise;
    }

    // Check if IndexedDB is available
    if (typeof indexedDB === 'undefined') {
      this.initError = new Error(
        'IndexedDB is not available. Library storage requires IndexedDB support.'
      );
      throw this.initError;
    }

    // Start initialization with a timeout
    const INIT_TIMEOUT_MS = 10000; // 10 seconds timeout

    this.initPromise = new Promise<void>((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let completed = false;

      const complete = (success: boolean, error?: Error) => {
        if (completed) return;
        completed = true;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (success) {
          resolve();
        } else {
          this.initError = error || new Error('Database initialization failed');
          this.initPromise = null;
          reject(this.initError);
        }
      };

      // Set up timeout
      timeoutId = setTimeout(() => {
        complete(
          false,
          new Error(
            'Database initialization timed out. This may happen in private/incognito browsing mode with strict privacy settings.'
          )
        );
      }, INIT_TIMEOUT_MS);

      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
          complete(
            false,
            new Error(
              'Failed to open library database. This may happen in private/incognito browsing mode.'
            )
          );
        };

        request.onsuccess = async () => {
          this.db = request.result;

          // Handle database connection being closed unexpectedly
          this.db.onclose = () => {
            this.db = null;
            this.initPromise = null;
          };

          this.db.onerror = () => {
            console.error('IndexedDB error occurred');
          };

          // Run migrations
          try {
            await this.migrateSgfExtensions();
          } catch (migrationError) {
            console.warn('Migration warning:', migrationError);
            // Don't fail initialization for migration errors
          }

          complete(true);
        };

        request.onupgradeneeded = event => {
          const db = (event.target as IDBOpenDBRequest).result;

          // Create object store for library items
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });

            // Indexes for efficient querying
            store.createIndex('parentId', 'parentId', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('name', 'name', { unique: false });
            store.createIndex('updatedAt', 'updatedAt', { unique: false });
          }
        };

        request.onblocked = () => {
          complete(
            false,
            new Error('Database is blocked. Please close other tabs using this application.')
          );
        };
      } catch (err) {
        complete(false, err instanceof Error ? err : new Error('Failed to initialize database'));
      }
    });

    return this.initPromise;
  }

  /**
   * Ensures the database is initialized before performing operations.
   * This allows operations to wait for initialization if it's in progress.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.db) return;

    // If there's an initialization in progress, wait for it
    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    // If there was an initialization error, throw it
    if (this.initError) {
      throw this.initError;
    }

    // Try to initialize
    await this.initialize();
  }

  /**
   * Migration: Add .sgf extension to existing files that don't have it.
   * This runs once after initialization.
   */
  private async migrateSgfExtensions(): Promise<void> {
    // Check if migration has already run
    if (typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATION_KEY)) {
      return;
    }

    if (!this.db) return;

    const store = this.getStore('readwrite');
    const items = await this.request<LibraryItem[]>(store.getAll());

    let migrated = 0;
    for (const item of items) {
      if (item.type === 'file') {
        const ext = getExtension(item.name).toLowerCase();
        if (ext !== '.sgf') {
          // Add .sgf extension
          item.name = `${item.name}.sgf`;
          const writeStore = this.getStore('readwrite');
          await this.request(writeStore.put(item));
          migrated++;
        }
      }
    }

    if (migrated > 0) {
      console.log(`Migrated ${migrated} library files to include .sgf extension`);
    }

    // Mark migration as complete
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(MIGRATION_KEY, 'true');
    }
  }

  private getStore(mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
    if (!this.db) {
      throw new Error('Database not initialized. Please wait for initialization to complete.');
    }
    const transaction = this.db.transaction(STORE_NAME, mode);
    return transaction.objectStore(STORE_NAME);
  }

  private request<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getItems(parentId: LibraryItemId | null = null): Promise<LibraryItem[]> {
    await this.ensureInitialized();
    const store = this.getStore();
    const index = store.index('parentId');

    // Use IDBKeyRange.only for explicit null matching
    // getAll(null) can be interpreted as "get all" in some browsers
    const query = parentId === null ? IDBKeyRange.only('__root__') : parentId;

    // For root items, we need to filter manually since IndexedDB doesn't index null well
    let items: LibraryItem[];
    if (parentId === null) {
      const allItems = await this.request<LibraryItem[]>(store.getAll());
      items = allItems.filter(item => item.parentId === null);
    } else {
      items = await this.request<LibraryItem[]>(index.getAll(parentId));
    }

    // Sort: folders first, then by name
    return items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  async getAllItems(): Promise<LibraryItem[]> {
    await this.ensureInitialized();
    const store = this.getStore();
    return this.request<LibraryItem[]>(store.getAll());
  }

  async getItem(id: LibraryItemId): Promise<LibraryItem | null> {
    await this.ensureInitialized();
    const store = this.getStore();
    return this.request<LibraryItem | null>(store.get(id));
  }

  async createFile(options: CreateFileOptions): Promise<LibraryFile> {
    await this.ensureInitialized();
    const { name, content, parentId = null } = options;

    if (!isValidSGF(content)) {
      throw new Error('Invalid SGF content');
    }

    // Get existing items in the parent folder for uniqueness check
    const siblings = await this.getItems(parentId);
    const baseName = ensureSGFExtension(sanitizeFilename(name));
    const uniqueName = makeUniqueName(baseName, siblings);

    const metadata = extractSGFMetadata(content);
    const timestamp = now();

    const file: LibraryFile = {
      id: generateId(),
      name: uniqueName,
      type: 'file',
      parentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      content,
      metadata,
      size: new Blob([content]).size,
    };

    const store = this.getStore('readwrite');
    await this.request(store.add(file));

    // Update parent folder's item count
    if (parentId) {
      await this.updateFolderCount(parentId);
    }

    return file;
  }

  async createFolder(options: CreateFolderOptions): Promise<LibraryFolder> {
    await this.ensureInitialized();
    const { name, parentId = null } = options;

    // Get existing items in the parent folder for uniqueness check
    const siblings = await this.getItems(parentId);
    const sanitizedName = sanitizeFilename(name);
    const uniqueName = makeUniqueName(sanitizedName, siblings);

    const timestamp = now();

    const folder: LibraryFolder = {
      id: generateId(),
      name: uniqueName,
      type: 'folder',
      parentId,
      createdAt: timestamp,
      updatedAt: timestamp,
      itemCount: 0,
    };

    const store = this.getStore('readwrite');
    await this.request(store.add(folder));

    // Update parent folder's item count
    if (parentId) {
      await this.updateFolderCount(parentId);
    }

    return folder;
  }

  async updateFile(id: LibraryItemId, content: string): Promise<LibraryFile> {
    await this.ensureInitialized();
    const item = await this.getItem(id);
    if (!item || item.type !== 'file') {
      throw new Error('File not found');
    }

    if (!isValidSGF(content)) {
      throw new Error('Invalid SGF content');
    }

    const metadata = extractSGFMetadata(content);
    const updatedFile: LibraryFile = {
      ...item,
      content,
      metadata,
      size: new Blob([content]).size,
      updatedAt: now(),
    };

    const store = this.getStore('readwrite');
    await this.request(store.put(updatedFile));

    return updatedFile;
  }

  async renameItem(options: RenameItemOptions): Promise<LibraryItem> {
    await this.ensureInitialized();
    const { itemId, newName } = options;

    const item = await this.getItem(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Get siblings for uniqueness check
    const siblings = await this.getItems(item.parentId);
    const sanitizedName = sanitizeFilename(newName);
    const uniqueName = makeUniqueName(sanitizedName, siblings, itemId);

    const updatedItem: LibraryItem = {
      ...item,
      name: uniqueName,
      updatedAt: now(),
    };

    const store = this.getStore('readwrite');
    await this.request(store.put(updatedItem));

    return updatedItem;
  }

  async moveItem(options: MoveItemOptions): Promise<LibraryItem> {
    await this.ensureInitialized();
    const { itemId, newParentId } = options;

    const item = await this.getItem(itemId);
    if (!item) {
      throw new Error('Item not found');
    }

    // Prevent moving a folder into itself or its descendants
    if (item.type === 'folder' && newParentId) {
      const isDescendant = await this.isDescendant(newParentId, itemId);
      if (isDescendant) {
        throw new Error('Cannot move a folder into its own descendant');
      }
    }

    const oldParentId = item.parentId;

    // Get new siblings for uniqueness check
    const newSiblings = await this.getItems(newParentId);
    const uniqueName = makeUniqueName(item.name, newSiblings, itemId);

    const updatedItem: LibraryItem = {
      ...item,
      name: uniqueName,
      parentId: newParentId,
      updatedAt: now(),
    };

    const store = this.getStore('readwrite');
    await this.request(store.put(updatedItem));

    // Update folder counts
    if (oldParentId) {
      await this.updateFolderCount(oldParentId);
    }
    if (newParentId) {
      await this.updateFolderCount(newParentId);
    }

    return updatedItem;
  }

  async deleteItem(id: LibraryItemId): Promise<void> {
    await this.ensureInitialized();
    const item = await this.getItem(id);
    if (!item) {
      return;
    }

    const parentId = item.parentId;

    // If it's a folder, delete all children recursively
    if (item.type === 'folder') {
      const children = await this.getItems(id);
      for (const child of children) {
        await this.deleteItem(child.id);
      }
    }

    const store = this.getStore('readwrite');
    await this.request(store.delete(id));

    // Update parent folder's item count
    if (parentId) {
      await this.updateFolderCount(parentId);
    }
  }

  async importZip(data: ArrayBuffer): Promise<ImportResult> {
    await this.ensureInitialized();
    const result: ImportResult = {
      success: false,
      imported: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Dynamic import of JSZip
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(data);

      // Create a map of folder paths to folder IDs
      const folderMap = new Map<string, LibraryItemId>();

      // First pass: create folders
      const folderPaths = new Set<string>();
      zip.forEach((relativePath: string, _file: JSZipType.JSZipObject) => {
        const parts = relativePath.split('/');
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath += (currentPath ? '/' : '') + parts[i];
          folderPaths.add(currentPath);
        }
      });

      // Sort folder paths by depth (create parent folders first)
      const sortedFolderPaths = Array.from(folderPaths).sort(
        (a, b) => a.split('/').length - b.split('/').length
      );

      for (const folderPath of sortedFolderPaths) {
        const parts = folderPath.split('/');
        const folderName = parts[parts.length - 1];
        const parentPath = parts.slice(0, -1).join('/');
        const parentId = parentPath ? folderMap.get(parentPath) || null : null;

        try {
          const folder = await this.createFolder({ name: folderName, parentId });
          folderMap.set(folderPath, folder.id);
        } catch (error) {
          result.errors.push(`Failed to create folder: ${folderPath}`);
        }
      }

      // Second pass: create files
      const files: Array<{ path: string; file: JSZipType.JSZipObject }> = [];
      zip.forEach((relativePath: string, file: JSZipType.JSZipObject) => {
        if (!file.dir && relativePath.toLowerCase().endsWith('.sgf')) {
          files.push({ path: relativePath, file });
        }
      });

      for (const { path, file } of files) {
        try {
          const content = await file.async('string');
          const parts = path.split('/');
          const fileName = parts[parts.length - 1];
          const parentPath = parts.slice(0, -1).join('/');
          const parentId = parentPath ? folderMap.get(parentPath) || null : null;

          await this.createFile({
            name: ensureSGFExtension(fileName),
            content,
            parentId,
          });
          result.imported++;
        } catch (error) {
          result.failed++;
          result.errors.push(
            `Failed to import: ${path} - ${error instanceof Error ? error.message : 'Unknown error'}`
          );
        }
      }

      result.success = result.imported > 0;
    } catch (error) {
      result.errors.push(
        `Failed to read ZIP file: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    return result;
  }

  async exportZip(): Promise<ExportResult> {
    await this.ensureInitialized();
    try {
      // Dynamic import of JSZip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const allItems = await this.getAllItems();

      // Build path map for folders
      const pathMap = new Map<LibraryItemId, string>();
      const buildPath = (item: LibraryItem): string => {
        if (pathMap.has(item.id)) {
          return pathMap.get(item.id)!;
        }

        let path = item.name;
        if (item.parentId) {
          const parent = allItems.find(i => i.id === item.parentId);
          if (parent) {
            path = buildPath(parent) + '/' + path;
          }
        }
        pathMap.set(item.id, path);
        return path;
      };

      // Add all items to zip
      for (const item of allItems) {
        const path = buildPath(item);
        if (item.type === 'file') {
          // File names already include .sgf extension
          zip.file(path, item.content);
        }
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      return { success: true, data: blob };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async getStats(): Promise<LibraryStats> {
    await this.ensureInitialized();
    const items = await this.getAllItems();

    let totalFiles = 0;
    let totalFolders = 0;
    let totalSize = 0;

    for (const item of items) {
      if (item.type === 'file') {
        totalFiles++;
        totalSize += item.size;
      } else {
        totalFolders++;
      }
    }

    return { totalFiles, totalFolders, totalSize };
  }

  async clear(): Promise<void> {
    await this.ensureInitialized();
    const store = this.getStore('readwrite');
    await this.request(store.clear());
  }

  // Private helper methods

  private async updateFolderCount(folderId: LibraryItemId): Promise<void> {
    const folder = await this.getItem(folderId);
    if (!folder || folder.type !== 'folder') return;

    const children = await this.getItems(folderId);

    const updatedFolder: LibraryFolder = {
      ...folder,
      itemCount: children.length,
      updatedAt: now(),
    };

    const store = this.getStore('readwrite');
    await this.request(store.put(updatedFolder));
  }

  private async isDescendant(
    potentialDescendantId: LibraryItemId,
    ancestorId: LibraryItemId
  ): Promise<boolean> {
    let currentId: LibraryItemId | null = potentialDescendantId;

    while (currentId) {
      if (currentId === ancestorId) {
        return true;
      }
      const item = await this.getItem(currentId);
      currentId = item?.parentId || null;
    }

    return false;
  }
}

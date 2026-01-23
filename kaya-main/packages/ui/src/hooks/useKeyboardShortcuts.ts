/**
 * Keyboard Shortcuts Management Hook
 *
 * Centralized management of all keyboard shortcuts with:
 * - Customizable key bindings
 * - Collision detection
 * - LocalStorage persistence
 * - Cross-platform modifier key handling (Ctrl/Cmd)
 */

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';

/** Storage key for keyboard shortcuts */
const SHORTCUTS_STORAGE_KEY = 'kaya-keyboard-shortcuts';

/** Modifier keys */
export interface ModifierKeys {
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** A single key binding */
export interface KeyBinding {
  key: string;
  modifiers: ModifierKeys;
}

/** Shortcut action categories */
export type ShortcutCategory = 'navigation' | 'board' | 'file' | 'view' | 'ai' | 'edit';

/** A keyboard shortcut definition */
export interface ShortcutDefinition {
  id: string;
  category: ShortcutCategory;
  defaultBinding: KeyBinding;
  customBinding?: KeyBinding;
  isCustomized?: boolean;
}

/** All available shortcut IDs */
export type ShortcutId =
  // Navigation shortcuts
  | 'nav.back'
  | 'nav.forward'
  | 'nav.start'
  | 'nav.end'
  | 'nav.branchUp'
  | 'nav.branchDown'
  // File shortcuts
  | 'file.save'
  | 'file.saveAs'
  | 'file.paste'
  // View shortcuts
  | 'view.toggleHeader'
  | 'view.toggleSidebar'
  | 'view.toggleLibrary'
  | 'view.toggleFullscreen'
  | 'view.openSettings'
  // Board mode shortcuts
  | 'board.toggleEditMode'
  | 'board.toggleNavigationMode'
  | 'board.toggleScoringMode'
  | 'board.toggleAnalysis'
  | 'board.toggleSound'
  | 'board.toggleNextMove'
  // AI shortcuts
  | 'ai.suggestMove'
  | 'ai.toggleTopMoves'
  | 'ai.toggleOwnership'
  // Edit shortcuts
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.makeMainBranch';

/** Modifier key for the current platform (Cmd on Mac, Ctrl elsewhere) */
const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

/** Create a key binding helper */
export function createBinding(key: string, options?: Partial<ModifierKeys>): KeyBinding {
  return {
    key: key.toLowerCase(),
    modifiers: {
      ctrl: options?.ctrl ?? false,
      shift: options?.shift ?? false,
      alt: options?.alt ?? false,
      meta: options?.meta ?? false,
    },
  };
}

/** Create a platform-aware binding (Cmd on Mac, Ctrl elsewhere) */
export function createPlatformBinding(
  key: string,
  options?: Partial<Omit<ModifierKeys, 'ctrl' | 'meta'>>
): KeyBinding {
  return createBinding(key, {
    ...options,
    ctrl: !isMac,
    meta: isMac,
  });
}

/** Default shortcuts configuration */
const DEFAULT_SHORTCUTS: Record<ShortcutId, Omit<ShortcutDefinition, 'id'>> = {
  // Navigation
  'nav.back': {
    category: 'navigation',
    defaultBinding: createBinding('arrowleft'),
  },
  'nav.forward': {
    category: 'navigation',
    defaultBinding: createBinding('arrowright'),
  },
  'nav.start': {
    category: 'navigation',
    defaultBinding: createBinding('home'),
  },
  'nav.end': {
    category: 'navigation',
    defaultBinding: createBinding('end'),
  },
  'nav.branchUp': {
    category: 'navigation',
    defaultBinding: createBinding('arrowup'),
  },
  'nav.branchDown': {
    category: 'navigation',
    defaultBinding: createBinding('arrowdown'),
  },

  // File operations
  'file.save': {
    category: 'file',
    defaultBinding: createPlatformBinding('s'),
  },
  'file.saveAs': {
    category: 'file',
    defaultBinding: createPlatformBinding('s', { shift: true }),
  },
  'file.paste': {
    category: 'file',
    defaultBinding: createPlatformBinding('v'),
  },

  // View shortcuts
  'view.toggleHeader': {
    category: 'view',
    defaultBinding: createPlatformBinding('m', { shift: true }),
  },
  'view.toggleSidebar': {
    category: 'view',
    defaultBinding: createPlatformBinding('b', { shift: true }),
  },
  'view.toggleLibrary': {
    category: 'view',
    defaultBinding: createPlatformBinding('l'),
  },
  'view.toggleFullscreen': {
    category: 'view',
    defaultBinding: createBinding('f'),
  },
  'view.openSettings': {
    category: 'view',
    defaultBinding: createPlatformBinding(','),
  },

  // Board mode shortcuts
  'board.toggleEditMode': {
    category: 'board',
    defaultBinding: createBinding('e'),
  },
  'board.toggleNavigationMode': {
    category: 'board',
    defaultBinding: createBinding('n'),
  },
  'board.toggleScoringMode': {
    category: 'board',
    defaultBinding: createBinding('s'),
  },
  'board.toggleAnalysis': {
    category: 'board',
    defaultBinding: createBinding('a'),
  },
  'board.toggleSound': {
    category: 'board',
    defaultBinding: createBinding('s', { shift: true }),
  },
  'board.toggleNextMove': {
    category: 'board',
    defaultBinding: createBinding('x'),
  },

  // AI shortcuts
  'ai.suggestMove': {
    category: 'ai',
    defaultBinding: createBinding('g'),
  },
  'ai.toggleTopMoves': {
    category: 'ai',
    defaultBinding: createBinding('t'),
  },
  'ai.toggleOwnership': {
    category: 'ai',
    defaultBinding: createBinding('o'),
  },

  // Edit shortcuts
  'edit.undo': {
    category: 'edit',
    defaultBinding: createPlatformBinding('z'),
  },
  'edit.redo': {
    category: 'edit',
    defaultBinding: createPlatformBinding('z', { shift: true }),
  },
  'edit.makeMainBranch': {
    category: 'edit',
    defaultBinding: createPlatformBinding('m', { shift: true }),
  },
};

/** Convert a KeyBinding to a display string */
export function bindingToDisplayString(binding: KeyBinding): string {
  const parts: string[] = [];
  const { modifiers, key } = binding;

  if (modifiers.ctrl) parts.push(isMac ? '⌃' : 'Ctrl');
  if (modifiers.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (modifiers.shift) parts.push(isMac ? '⇧' : 'Shift');
  if (modifiers.meta) parts.push(isMac ? '⌘' : 'Win');

  // Format special keys
  let displayKey = key;
  switch (key.toLowerCase()) {
    case 'arrowleft':
      displayKey = '←';
      break;
    case 'arrowright':
      displayKey = '→';
      break;
    case 'arrowup':
      displayKey = '↑';
      break;
    case 'arrowdown':
      displayKey = '↓';
      break;
    case 'home':
      displayKey = 'Home';
      break;
    case 'end':
      displayKey = 'End';
      break;
    case 'escape':
      displayKey = 'Esc';
      break;
    case 'enter':
      displayKey = '↵';
      break;
    case 'backspace':
      displayKey = '⌫';
      break;
    case 'delete':
      displayKey = 'Del';
      break;
    case 'tab':
      displayKey = 'Tab';
      break;
    case ' ':
      displayKey = 'Space';
      break;
    case ',':
      displayKey = ',';
      break;
    default:
      displayKey = key.length === 1 ? key.toUpperCase() : key;
  }

  parts.push(displayKey);
  return parts.join(isMac ? '' : '+');
}

/** Check if a KeyboardEvent matches a KeyBinding */
export function eventMatchesBinding(event: KeyboardEvent, binding: KeyBinding): boolean {
  const { modifiers, key } = binding;
  const eventKey = event.key.toLowerCase();

  // Check modifiers
  const ctrlMatch = modifiers.ctrl === event.ctrlKey;
  const shiftMatch = modifiers.shift === event.shiftKey;
  const altMatch = modifiers.alt === event.altKey;
  const metaMatch = modifiers.meta === event.metaKey;

  // Check key
  const keyMatch = eventKey === key.toLowerCase();

  return ctrlMatch && shiftMatch && altMatch && metaMatch && keyMatch;
}

/** Compare two bindings for equality */
export function bindingsEqual(a: KeyBinding, b: KeyBinding): boolean {
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    a.modifiers.ctrl === b.modifiers.ctrl &&
    a.modifiers.shift === b.modifiers.shift &&
    a.modifiers.alt === b.modifiers.alt &&
    a.modifiers.meta === b.modifiers.meta
  );
}

/** Collision info when two shortcuts have the same binding */
export interface ShortcutCollision {
  existingShortcutId: ShortcutId;
  binding: KeyBinding;
}

/** Stored custom shortcuts (only stores customized ones) */
type StoredShortcuts = Partial<Record<ShortcutId, KeyBinding>>;

/** Load stored shortcuts from localStorage */
function loadStoredShortcuts(): StoredShortcuts {
  try {
    if (typeof window === 'undefined') return {};
    const stored = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as StoredShortcuts;
  } catch {
    return {};
  }
}

/** Save shortcuts to localStorage */
function saveStoredShortcuts(shortcuts: StoredShortcuts): void {
  try {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(shortcuts));
  } catch (e) {
    console.warn('Failed to save shortcuts to localStorage:', e);
  }
}

/** Create a KeyBinding from a KeyboardEvent */
export function createBindingFromEvent(event: KeyboardEvent): KeyBinding | null {
  // Ignore modifier-only key presses
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
    return null;
  }

  return {
    key: event.key.toLowerCase(),
    modifiers: {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey,
    },
  };
}

/**
 * Hook for managing keyboard shortcuts
 */
export function useKeyboardShortcuts() {
  const [storedShortcuts, setStoredShortcuts] = useState<StoredShortcuts>(loadStoredShortcuts);

  // Build the complete shortcuts map with custom overrides
  const shortcuts = useMemo((): Record<ShortcutId, ShortcutDefinition> => {
    const result: Record<string, ShortcutDefinition> = {};

    for (const [id, def] of Object.entries(DEFAULT_SHORTCUTS)) {
      const shortcutId = id as ShortcutId;
      const customBinding = storedShortcuts[shortcutId];

      result[shortcutId] = {
        id: shortcutId,
        ...def,
        customBinding,
        isCustomized: customBinding !== undefined,
      };
    }

    return result as Record<ShortcutId, ShortcutDefinition>;
  }, [storedShortcuts]);

  // Keep a ref to shortcuts for stable callback access (used by matchesShortcut)
  const shortcutsRef = useRef(shortcuts);
  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  // Get the active binding for a shortcut (custom or default)
  // This is reactive - UI will update when shortcuts change
  const getBinding = useCallback(
    (id: ShortcutId): KeyBinding => {
      const shortcut = shortcuts[id];
      return shortcut.customBinding ?? shortcut.defaultBinding;
    },
    [shortcuts]
  );

  // Check for collisions when setting a new binding
  const checkCollision = useCallback(
    (binding: KeyBinding, excludeId?: ShortcutId): ShortcutCollision | null => {
      for (const [id, shortcut] of Object.entries(shortcuts)) {
        if (id === excludeId) continue;

        const activeBinding = shortcut.customBinding ?? shortcut.defaultBinding;
        if (bindingsEqual(binding, activeBinding)) {
          return {
            existingShortcutId: id as ShortcutId,
            binding,
          };
        }
      }
      return null;
    },
    [shortcuts]
  );

  // Set a custom binding for a shortcut
  // skipCollisionCheck: set to true when collision has already been resolved
  const setBinding = useCallback(
    (id: ShortcutId, binding: KeyBinding, skipCollisionCheck = false): ShortcutCollision | null => {
      // Check for collision (unless already handled)
      if (!skipCollisionCheck) {
        const collision = checkCollision(binding, id);
        if (collision) {
          return collision;
        }
      }

      // Check if it's the same as default
      const defaultBinding = DEFAULT_SHORTCUTS[id].defaultBinding;
      if (bindingsEqual(binding, defaultBinding)) {
        // Remove custom binding if it's the same as default
        const newStored = { ...storedShortcuts };
        delete newStored[id];
        setStoredShortcuts(newStored);
        saveStoredShortcuts(newStored);
      } else {
        // Store the custom binding
        const newStored = { ...storedShortcuts, [id]: binding };
        setStoredShortcuts(newStored);
        saveStoredShortcuts(newStored);
      }

      return null;
    },
    [storedShortcuts, checkCollision]
  );

  // Clear collision by removing the conflicting shortcut's binding and setting the new one
  const clearCollisionAndSetBinding = useCallback(
    (collisionId: ShortcutId, targetId: ShortcutId, binding: KeyBinding): void => {
      // Update both in the same state update to avoid stale closure issues
      const newStored = { ...storedShortcuts };
      // Disable the conflicting shortcut
      newStored[collisionId] = createBinding('');
      // Set the new binding for the target
      const defaultBinding = DEFAULT_SHORTCUTS[targetId].defaultBinding;
      if (bindingsEqual(binding, defaultBinding)) {
        delete newStored[targetId];
      } else {
        newStored[targetId] = binding;
      }
      setStoredShortcuts(newStored);
      saveStoredShortcuts(newStored);
    },
    [storedShortcuts]
  );

  // Clear collision by removing the conflicting shortcut's binding (legacy, kept for compatibility)
  const clearCollision = useCallback(
    (collisionId: ShortcutId): void => {
      const newStored = { ...storedShortcuts };
      // Set the conflicting shortcut to an empty binding (disabled)
      newStored[collisionId] = createBinding('');
      setStoredShortcuts(newStored);
      saveStoredShortcuts(newStored);
    },
    [storedShortcuts]
  );

  // Reset a shortcut to its default binding
  const resetBinding = useCallback(
    (id: ShortcutId): void => {
      const newStored = { ...storedShortcuts };
      delete newStored[id];
      setStoredShortcuts(newStored);
      saveStoredShortcuts(newStored);
    },
    [storedShortcuts]
  );

  // Reset all shortcuts to defaults
  const resetAllBindings = useCallback((): void => {
    setStoredShortcuts({});
    saveStoredShortcuts({});
  }, []);

  // Check if a keyboard event matches a shortcut
  // Uses ref to always read latest shortcuts without re-registering event listeners
  const matchesShortcut = useCallback(
    (event: KeyboardEvent, id: ShortcutId): boolean => {
      const shortcut = shortcutsRef.current[id];
      const binding = shortcut.customBinding ?? shortcut.defaultBinding;
      // If binding is empty (disabled), don't match
      if (!binding.key) return false;
      return eventMatchesBinding(event, binding);
    },
    [] // No dependencies - always reads from ref
  );

  // Get all shortcuts grouped by category
  const shortcutsByCategory = useMemo(() => {
    const categories: Record<ShortcutCategory, ShortcutDefinition[]> = {
      navigation: [],
      board: [],
      file: [],
      view: [],
      ai: [],
      edit: [],
    };

    for (const shortcut of Object.values(shortcuts)) {
      categories[shortcut.category].push(shortcut);
    }

    return categories;
  }, [shortcuts]);

  return {
    shortcuts,
    shortcutsByCategory,
    getBinding,
    setBinding,
    resetBinding,
    resetAllBindings,
    checkCollision,
    clearCollision,
    clearCollisionAndSetBinding,
    matchesShortcut,
    bindingToDisplayString,
    createBindingFromEvent,
  };
}

/** Context type for keyboard shortcuts */
export type KeyboardShortcutsContextType = ReturnType<typeof useKeyboardShortcuts>;

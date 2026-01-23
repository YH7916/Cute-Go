/**
 * Keyboard Shortcuts Context
 *
 * Provides centralized access to keyboard shortcuts management across the app.
 * All components MUST use this context (via useKeyboardShortcuts) to ensure
 * changes to shortcuts are immediately reflected across the entire app.
 */

import React, { createContext, useContext, type ReactNode } from 'react';
import {
  useKeyboardShortcuts as useKeyboardShortcutsHook,
  type KeyboardShortcutsContextType,
} from '../hooks/useKeyboardShortcuts';

const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextType | null>(null);

interface KeyboardShortcutsProviderProps {
  children: ReactNode;
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  const shortcuts = useKeyboardShortcutsHook();

  return (
    <KeyboardShortcutsContext.Provider value={shortcuts}>
      {children}
    </KeyboardShortcutsContext.Provider>
  );
}

export function useKeyboardShortcutsContext(): KeyboardShortcutsContextType {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcutsContext must be used within a KeyboardShortcutsProvider');
  }
  return context;
}

/**
 * Hook for accessing keyboard shortcuts.
 * Must be used within KeyboardShortcutsProvider.
 */
export function useKeyboardShortcuts(): KeyboardShortcutsContextType {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error(
      'useKeyboardShortcuts must be used within a KeyboardShortcutsProvider. ' +
        'Wrap your app with <KeyboardShortcutsProvider>.'
    );
  }
  return context;
}

// Re-export types for convenience
export type { KeyboardShortcutsContextType } from '../hooks/useKeyboardShortcuts';
export {
  type ShortcutId,
  type ShortcutCategory,
  type KeyBinding,
  bindingToDisplayString,
} from '../hooks/useKeyboardShortcuts';

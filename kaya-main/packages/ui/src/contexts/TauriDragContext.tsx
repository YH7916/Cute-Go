/**
 * TauriDragContext - Shares Tauri native file drag state across components
 *
 * In Tauri, native file drops bypass HTML5 drag events. This context allows
 * components like LibraryPanel to show appropriate drop overlays when files
 * are dragged over them via Tauri's native drag-drop system.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface TauriDragContextValue {
  /** Whether a file is being dragged over the app (Tauri native drag) */
  isTauriDragging: boolean;
  /** Whether the drag is currently over the library panel */
  isOverLibrary: boolean;
  /** Set the Tauri dragging state */
  setTauriDragging: (dragging: boolean) => void;
  /** Set whether drag is over library */
  setOverLibrary: (over: boolean) => void;
}

const TauriDragContext = createContext<TauriDragContextValue | null>(null);

export function TauriDragProvider({ children }: { children: ReactNode }) {
  const [isTauriDragging, setIsTauriDragging] = useState(false);
  const [isOverLibrary, setIsOverLibrary] = useState(false);

  const setTauriDragging = useCallback((dragging: boolean) => {
    setIsTauriDragging(dragging);
    if (!dragging) {
      setIsOverLibrary(false);
    }
  }, []);

  const setOverLibrary = useCallback((over: boolean) => {
    setIsOverLibrary(over);
  }, []);

  const value: TauriDragContextValue = {
    isTauriDragging,
    isOverLibrary,
    setTauriDragging,
    setOverLibrary,
  };

  return <TauriDragContext.Provider value={value}>{children}</TauriDragContext.Provider>;
}

export function useTauriDrag(): TauriDragContextValue {
  const context = useContext(TauriDragContext);
  if (!context) {
    // Return a no-op context for non-Tauri environments
    return {
      isTauriDragging: false,
      isOverLibrary: false,
      setTauriDragging: () => {},
      setOverLibrary: () => {},
    };
  }
  return context;
}

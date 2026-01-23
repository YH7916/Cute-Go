import { useState, useCallback } from 'react';
import { Sign } from '@kaya/goboard';

export function useEditMode() {
  const [editMode, setEditMode] = useState(false);
  const [editPlayMode, setEditPlayMode] = useState(false);
  const [editTool, setEditTool] = useState<string>('alternate');
  const [stoneToolColor, setStoneToolColor] = useState<Sign>(1);

  const toggleEditMode = useCallback(() => {
    setEditMode(prev => !prev);
  }, []);

  return {
    editMode,
    setEditMode,
    editPlayMode,
    setEditPlayMode,
    editTool,
    setEditTool,
    stoneToolColor,
    setStoneToolColor,
    toggleEditMode,
  };
}

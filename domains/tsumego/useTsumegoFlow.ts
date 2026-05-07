import { useCallback, useEffect, useState } from 'react';
import { SGFNode } from '../../utils/sgfParser';
import { TsumegoCategory, TsumegoLevel, fetchProblemManifest, getCategoryFiles } from '../../utils/tsumegoData';

export const useTsumegoFlow = () => {
  const [completedLevelIds, setCompletedLevelIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('completed_tsumego_levels');
    return saved ? JSON.parse(saved) : [];
  });
  const [showTsumegoLevelSelector, setShowTsumegoLevelSelector] = useState(false);
  const [currentTsumegoLevel, setCurrentTsumegoLevel] = useState<TsumegoLevel | null>(null);

  const [tsumegoRoot, setTsumegoRoot] = useState<SGFNode | null>(null);
  const [tsumegoCurrentNode, setTsumegoCurrentNode] = useState<SGFNode | null>(null);
  const [tsumegoCollection, setTsumegoCollection] = useState<SGFNode[] | null>(null);
  const [tsumegoSetTitle, setTsumegoSetTitle] = useState('');
  const [tsumegoCategories, setTsumegoCategories] = useState<TsumegoCategory[]>([]);

  const [showTsumegoResult, setShowTsumegoResult] = useState(false);
  const [tsumegoIsCorrect, setTsumegoIsCorrect] = useState(false);
  const [tsumegoResultMsg, setTsumegoResultMsg] = useState('');
  const [, setTsumegoInstruction] = useState<string | null>(null);

  useEffect(() => {
    fetchProblemManifest()
      .then(data => {
        setTsumegoCategories(data.filter((c: TsumegoCategory) => c.id === 'life_death'));
      })
      .catch(() => {});
  }, []);

  const getTsumegoFileList = useCallback((level: TsumegoLevel, category: TsumegoCategory) => {
    return getCategoryFiles(category, level.groupName);
  }, []);

  return {
    completedLevelIds,
    setCompletedLevelIds,
    showTsumegoLevelSelector,
    setShowTsumegoLevelSelector,
    currentTsumegoLevel,
    setCurrentTsumegoLevel,
    tsumegoRoot,
    setTsumegoRoot,
    tsumegoCurrentNode,
    setTsumegoCurrentNode,
    tsumegoCollection,
    setTsumegoCollection,
    tsumegoSetTitle,
    setTsumegoSetTitle,
    tsumegoCategories,
    showTsumegoResult,
    setShowTsumegoResult,
    tsumegoIsCorrect,
    setTsumegoIsCorrect,
    tsumegoResultMsg,
    setTsumegoResultMsg,
    setTsumegoInstruction,
    getTsumegoFileList,
  };
};

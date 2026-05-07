import { useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { BoardState, Player } from '../../types';
import { attemptMove } from '../../utils/goLogic';
import { parseSGFToTree, SGFNode } from '../../utils/sgfParser';
import { TsumegoCategory, TsumegoLevel, fetchProblemSGF } from '../../utils/tsumegoData';

interface UseTsumegoNavigationOptions {
  boardRef: MutableRefObject<BoardState>;
  currentPlayer: Player;
  currentTsumegoLevel: TsumegoLevel | null;
  getTsumegoFileList: (level: TsumegoLevel, category: TsumegoCategory) => string[];
  handleTsumegoMove: (x: number, y: number) => boolean;
  playSfx: (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => void;
  setBoard: (board: BoardState) => void;
  setCurrentPlayer: (player: Player) => void;
  setCurrentTsumegoLevel: (level: TsumegoLevel) => void;
  setLastMove: (move: { x: number; y: number } | null) => void;
  setToastMsg: (message: string | null) => void;
  startTsumego: (root: SGFNode) => void;
  tsumegoCategories: TsumegoCategory[];
  tsumegoCurrentNode: SGFNode | null;
}

const HINT_KEYWORDS = {
  correct: ['正解', 'correct', 'right', 'success', 'succeed', '活', 'win', '手筋', '官子', '优'],
  wrong: ['错', 'wrong', 'fail', 'failure', 'die', 'dead', '失败'],
};

export const useTsumegoNavigation = ({
  boardRef,
  currentPlayer,
  currentTsumegoLevel,
  getTsumegoFileList,
  handleTsumegoMove,
  playSfx,
  setBoard,
  setCurrentPlayer,
  setCurrentTsumegoLevel,
  setLastMove,
  setToastMsg,
  startTsumego,
  tsumegoCategories,
  tsumegoCurrentNode,
}: UseTsumegoNavigationOptions) => {
  const problemNav = useMemo(() => {
    if (!currentTsumegoLevel) return { cat: null, fileList: [], idx: -1 };
    const cat = tsumegoCategories.find(c => c.id === currentTsumegoLevel.category) ?? null;
    if (!cat) return { cat: null, fileList: [], idx: -1 };
    const currentFilename = currentTsumegoLevel.filename.replace(/\\/g, '/');
    const fileList = getTsumegoFileList(currentTsumegoLevel, cat);
    const cleanCurrent = currentFilename.startsWith(cat.dirName + '/')
      ? currentFilename.slice(cat.dirName.length + 1)
      : currentFilename;
    return { cat, fileList, idx: fileList.indexOf(cleanCurrent) };
  }, [currentTsumegoLevel, getTsumegoFileList, tsumegoCategories]);

  const hasPrevProblem = problemNav.idx > 0;
  const hasNextProblem = problemNav.idx !== -1 && problemNav.idx < problemNav.fileList.length - 1;

  const handlePrevProblem = useCallback(() => {
    if (!currentTsumegoLevel || !problemNav.cat || problemNav.idx <= 0) return;

    const prevFile = problemNav.fileList[problemNav.idx - 1];
    const prevFull = `${problemNav.cat.dirName}/${prevFile}`;
    const prevLevel: TsumegoLevel = {
      id: `${problemNav.cat.id}/${prevFile}`,
      title: `Problem ${problemNav.idx}`,
      category: problemNav.cat.id,
      groupName: currentTsumegoLevel.groupName,
      filename: prevFull,
      difficulty: 1,
    };
    setToastMsg("加载上一关...");
    fetchProblemSGF(prevLevel.filename).then(sgf => {
      setCurrentTsumegoLevel(prevLevel);
      const nodes = parseSGFToTree(sgf);
      if (nodes && nodes.length > 0) startTsumego(nodes[0]);
      setToastMsg(null);
    }).catch(() => setToastMsg("加载失败"));
  }, [currentTsumegoLevel, problemNav, setCurrentTsumegoLevel, setToastMsg, startTsumego]);

  const handleHint = useCallback(() => {
    if (!tsumegoCurrentNode) return;
    const playerProp = currentPlayer === 'black' ? 'B' : 'W';
    const playerColor = currentPlayer;

    const hasSuccess = (node: SGFNode): boolean => {
      const comment = node.properties['C']?.[0]?.toLowerCase() ?? '';
      if (HINT_KEYWORDS.correct.some(k => comment.includes(k)) && !HINT_KEYWORDS.wrong.some(k => comment.includes(k))) return true;
      if (HINT_KEYWORDS.wrong.some(k => comment.includes(k))) return false;
      return node.children.some(child => hasSuccess(child));
    };

    let hintChild = tsumegoCurrentNode.children.find(child => {
      const comment = child.properties['C'] ? child.properties['C'][0].toLowerCase() : '';
      return HINT_KEYWORDS.correct.some(k => comment.includes(k));
    });

    if (!hintChild) {
      hintChild = tsumegoCurrentNode.children.find(child => hasSuccess(child));
    }

    if (!hintChild) {
      const candidates = tsumegoCurrentNode.children.filter(child => {
        if (!child.properties[playerProp]) return false;
        const comment = child.properties['C'] ? child.properties['C'][0].toLowerCase() : '';
        const isWrong = HINT_KEYWORDS.wrong.some(k => comment.includes(k));
        return !isWrong;
      });

      if (candidates.length > 0) {
        hintChild = candidates[0];
      } else {
        hintChild = tsumegoCurrentNode.children.find(child => child.properties[playerProp]);
      }
    }

    if (hintChild && hintChild.properties[playerProp]) {
      const moveStr = hintChild.properties[playerProp][0];
      if (moveStr && moveStr.length >= 2) {
        const trimmed = moveStr.trim();
        const x = trimmed.charCodeAt(0) - 97;
        const y = trimmed.charCodeAt(1) - 97;

        const attempt = attemptMove(boardRef.current, x, y, playerColor);
        if (attempt) {
          setBoard(attempt.newBoard);
          setLastMove({ x, y });
          setCurrentPlayer(playerColor === 'black' ? 'white' : 'black');
          playSfx('move');
          handleTsumegoMove(x, y);
        }
      }
    } else {
      setToastMsg("无更多提示 / 已是最后一步");
      setTimeout(() => setToastMsg(null), 1500);
    }
  }, [
    boardRef,
    currentPlayer,
    handleTsumegoMove,
    playSfx,
    setBoard,
    setCurrentPlayer,
    setLastMove,
    setToastMsg,
    tsumegoCurrentNode,
  ]);

  return {
    handleHint,
    handlePrevProblem,
    hasNextProblem,
    hasPrevProblem,
  };
};

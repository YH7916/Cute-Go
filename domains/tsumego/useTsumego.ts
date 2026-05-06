import { useEffect, useCallback } from 'react';
import { SGFNode, parseSGFToTree } from '../../utils/sgfParser';
import { TsumegoCategory, TsumegoLevel, fetchProblemSGF } from '../../utils/tsumegoData';
import { TsumegoSet } from '../../components/TsumegoListModal';
import { BoardState, Player, BoardSize } from '../../types';
import { createBoard } from '../../core/board';
import { attemptMove } from '../../core/go/rules';

interface TsumegoState {
  tsumegoRoot: SGFNode | null;
  tsumegoCurrentNode: SGFNode | null;
  tsumegoCategories: TsumegoCategory[];
  currentTsumegoLevel: TsumegoLevel | null;
  showTsumegoResult: boolean;
}

interface TsumegoSetters {
  setTsumegoRoot: (n: SGFNode | null) => void;
  setTsumegoCurrentNode: (n: SGFNode | null) => void;
  setTsumegoCollection: (c: SGFNode[] | null) => void;
  setTsumegoSetTitle: (t: string) => void;
  setShowTsumegoResult: (v: boolean) => void;
  setTsumegoIsCorrect: (v: boolean) => void;
  setTsumegoResultMsg: (m: string) => void;
  setTsumegoInstruction: (m: string | null) => void;
  setShowTsumegoLevelSelector: (v: boolean) => void;
  setCurrentTsumegoLevel: (l: TsumegoLevel | null) => void;
  setCompletedLevelIds: (fn: (prev: string[]) => string[]) => void;
}

interface UseTsumegoOptions {
  state: TsumegoState;
  setters: TsumegoSetters;
  gameMode: string;
  userColor: Player;
  boardSize: number;
  currentPlayer: Player;
  gameOver: boolean;
  boardRef: React.MutableRefObject<BoardState>;
  currentPlayerRef: React.MutableRefObject<Player>;
  setBoardSize: (size: BoardSize) => void;
  setBoard: (board: BoardState) => void;
  setCurrentPlayer: (player: Player) => void;
  setLastMove: (move: { x: number; y: number } | null) => void;
  setGameMode: (mode: any) => void;
  setGameType: (type: any) => void;
  setUserColor: (color: Player) => void;
  resetGame: (keepOnline?: boolean, size?: number, shouldBroadcast?: boolean) => void;
  executeMove: (x: number, y: number, isRemote: boolean) => void;
  setToastMsg: (msg: string | null) => void;
  vibrate: (pattern: number | number[]) => void;
  playSfx: (type: 'move' | 'capture' | 'error' | 'win' | 'lose') => void;
}

const KEYWORDS = {
  correct: ['正解', 'correct', 'right', 'success', 'succeed', '活', 'win', '手筋', '官子', '优'],
  wrong: ['错', 'wrong', 'fail', 'failure', 'die', 'dead', '失败'],
};

const parseSGFPointOrRange = (val: string): { x: number; y: number }[] => {
  if (val.length < 2) return [];
  if (val.includes(':')) {
    const [p1, p2] = val.split(':');
    if (!p1 || !p2 || p1.length < 2 || p2.length < 2) return [];
    const x1 = p1.charCodeAt(0) - 97, y1 = p1.charCodeAt(1) - 97;
    const x2 = p2.charCodeAt(0) - 97, y2 = p2.charCodeAt(1) - 97;
    const points = [];
    for (let ix = Math.min(x1, x2); ix <= Math.max(x1, x2); ix++)
      for (let iy = Math.min(y1, y2); iy <= Math.max(y1, y2); iy++)
        points.push({ x: ix, y: iy });
    return points;
  }
  return [{ x: val.charCodeAt(0) - 97, y: val.charCodeAt(1) - 97 }];
};

export const useTsumego = (opts: UseTsumegoOptions) => {
  const { state, setters, gameMode, userColor, boardSize, currentPlayer, gameOver,
    boardRef, currentPlayerRef, setBoardSize, setBoard, setCurrentPlayer, setLastMove,
    setGameMode, setGameType, setUserColor, resetGame, executeMove,
    setToastMsg, vibrate, playSfx } = opts;

  const { tsumegoRoot, tsumegoCurrentNode, tsumegoCategories, currentTsumegoLevel, showTsumegoResult } = state;
  const { setTsumegoRoot, setTsumegoCurrentNode, setTsumegoCollection, setTsumegoSetTitle,
    setShowTsumegoResult, setTsumegoIsCorrect, setTsumegoResultMsg, setTsumegoInstruction,
    setShowTsumegoLevelSelector, setCurrentTsumegoLevel, setCompletedLevelIds } = setters;

  const checkTsumegoStatus = useCallback((node: SGFNode | null) => {
    if (!node) return;
    const comment = node.properties['C']?.[0] ?? '';
    if (!comment || comment.includes('参考图')) return;

    const isCorrect = KEYWORDS.correct.some(k => comment.toLowerCase().includes(k));
    const isWrong = KEYWORDS.wrong.some(k => comment.toLowerCase().includes(k));

    if (isCorrect && !isWrong) {
      if (node.children.length > 0) {
        setToastMsg(`✅ ${comment} (继续落子...)`);
      } else {
        setToastMsg(`✅ ${comment}`);
        setTimeout(() => {
          setTsumegoIsCorrect(true);
          setTsumegoResultMsg(comment);
          setShowTsumegoResult(true);
        }, 200);
      }
    } else if (isWrong) {
      setToastMsg(comment);
    } else {
      setToastMsg(comment);
    }
  }, [setToastMsg, setTsumegoIsCorrect, setTsumegoResultMsg, setShowTsumegoResult]);

  const startTsumego = useCallback((root: SGFNode) => {
    resetGame(false, 19, false);

    let currentNode: SGFNode = root;
    const combinedProps: { [key: string]: string[] } = { ...root.properties };

    let depth = 0;
    while (depth < 10 && !currentNode.properties['B'] && !currentNode.properties['W'] && currentNode.children.length === 1) {
      const child = currentNode.children[0];
      if (child.properties['AB']) combinedProps['AB'] = [...(combinedProps['AB'] || []), ...child.properties['AB']];
      if (child.properties['AW']) combinedProps['AW'] = [...(combinedProps['AW'] || []), ...child.properties['AW']];
      if (child.properties['SZ']) combinedProps['SZ'] = child.properties['SZ'];
      if (child.properties['PL']) combinedProps['PL'] = child.properties['PL'];
      if (child.properties['C']) combinedProps['C'] = child.properties['C'];
      if (child.properties['B'] || child.properties['W']) break;
      else currentNode = child;
      depth++;
    }

    let size = 19;
    if (combinedProps['SZ']) size = parseInt(combinedProps['SZ'][0]);
    if (size !== boardSize) {
      setBoardSize(size as BoardSize);
      setBoard(createBoard(size as BoardSize));
    }

    setGameMode('Tsumego');
    setGameType('Go');
    setTsumegoRoot(root);
    setTsumegoCurrentNode(currentNode);

    const newBoard = createBoard(size as BoardSize);
    combinedProps['AB']?.forEach(val =>
      parseSGFPointOrRange(val).forEach(p => {
        if (p.x >= 0 && p.x < size && p.y >= 0 && p.y < size)
          newBoard[p.y][p.x] = { color: 'black', x: p.x, y: p.y, id: `setup-b-${p.x}-${p.y}` };
      })
    );
    combinedProps['AW']?.forEach(val =>
      parseSGFPointOrRange(val).forEach(p => {
        if (p.x >= 0 && p.x < size && p.y >= 0 && p.y < size)
          newBoard[p.y][p.x] = { color: 'white', x: p.x, y: p.y, id: `setup-w-${p.x}-${p.y}` };
      })
    );
    combinedProps['AE']?.forEach(val =>
      parseSGFPointOrRange(val).forEach(p => {
        if (p.x >= 0 && p.x < size && p.y >= 0 && p.y < size)
          newBoard[p.y][p.x] = null;
      })
    );

    setBoard(newBoard);
    boardRef.current = newBoard;

    let firstPlayer: Player = 'black';
    if (combinedProps['PL']) {
      const pl = combinedProps['PL'][0];
      firstPlayer = (pl.toLowerCase() === 'w' || pl === '2') ? 'white' : 'black';
    } else if (currentNode.children.length > 0) {
      const firstChild = currentNode.children[0];
      if (firstChild.properties['W'] && !firstChild.properties['B']) firstPlayer = 'white';
      else if (firstChild.properties['B']) firstPlayer = 'black';
    }

    setCurrentPlayer(firstPlayer);
    currentPlayerRef.current = firstPlayer;
    setUserColor(firstPlayer);

    const turnMsg = firstPlayer === 'black' ? '执黑 (Black to Play)' : '执白 (White to Play)';
    let fullMsg = turnMsg;
    if (combinedProps['C']) fullMsg += `\n${combinedProps['C'][0]}`;
    setTsumegoInstruction(fullMsg);
    setShowTsumegoResult(false);
  }, [boardSize, setBoardSize, setBoard, setGameMode, setGameType, setCurrentPlayer, setUserColor,
    resetGame, boardRef, currentPlayerRef, setTsumegoRoot, setTsumegoCurrentNode,
    setTsumegoInstruction, setShowTsumegoResult]);

  const exitTsumegoMode = useCallback((nextGameMode: any = 'PvP') => {
    if (gameMode === 'Tsumego') setGameMode(nextGameMode);
    setTsumegoRoot(null);
    setTsumegoCurrentNode(null);
    setShowTsumegoResult(false);
    setTsumegoInstruction(null);
    setShowTsumegoLevelSelector(false);
  }, [gameMode, setGameMode, setTsumegoRoot, setTsumegoCurrentNode,
    setShowTsumegoResult, setTsumegoInstruction, setShowTsumegoLevelSelector]);

  const handleOpenTsumego = useCallback(() => {
    setTsumegoCollection(null);
    setShowTsumegoLevelSelector(true);
  }, [setTsumegoCollection, setShowTsumegoLevelSelector]);

  const handleSelectTsumegoSet = useCallback(async (set: TsumegoSet) => {
    setToastMsg(`正在加载 ${set.title}...`);
    try {
      if (!set.filename) throw new Error('Filename is missing');
      const res = await fetch(`/Tsumego/${set.filename}`);
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const text = await res.text();
      const roots = parseSGFToTree(text);
      if (roots.length > 0) {
        setTsumegoCollection(roots);
        setTsumegoSetTitle(set.title);
        setToastMsg(null);
      } else {
        throw new Error('Invalid SGF content or empty');
      }
    } catch (e: any) {
      setToastMsg(`加载失败: ${e.message}`);
      setTimeout(() => setToastMsg(null), 3000);
    }
  }, [setToastMsg, setTsumegoCollection, setTsumegoSetTitle]);

  const handleNextTsumego = useCallback(async () => {
    if (!currentTsumegoLevel) return;
    const cat = tsumegoCategories.find(c => c.id === currentTsumegoLevel.category);
    if (!cat) return;

    let fileList: string[] = [];
    const currentFilename = currentTsumegoLevel.filename.replace(/\\/g, '/');

    if (currentTsumegoLevel.groupName) {
      const group = cat.children.find(c => (c as any).isGroup && c.name === currentTsumegoLevel.groupName);
      if (group && (group as any).files) fileList = (group as any).files;
    } else {
      fileList = cat.children.filter(c => !(c as any).isGroup).map(c => (c as any).file);
    }

    const cleanCurrent = currentFilename.startsWith(cat.dirName + '/')
      ? currentFilename.slice(cat.dirName.length + 1)
      : currentFilename;
    const idx = fileList.indexOf(cleanCurrent);

    if (idx !== -1 && idx < fileList.length - 1) {
      const nextFile = fileList[idx + 1];
      const nextFull = `${cat.dirName}/${nextFile}`;
      const nextLevel: TsumegoLevel = {
        id: `${cat.id}/${nextFile}`,
        title: `Problem ${idx + 2}`,
        category: cat.id,
        groupName: currentTsumegoLevel.groupName,
        filename: nextFull,
        difficulty: 1,
      };
      try {
        setToastMsg('加载下一关...');
        const sgf = await fetchProblemSGF(nextLevel.filename);
        setCurrentTsumegoLevel(nextLevel);
        const nodes = parseSGFToTree(sgf);
        if (nodes?.length > 0) startTsumego(nodes[0]);
        setToastMsg(null);
      } catch {
        setToastMsg('加载失败');
      }
    } else {
      setToastMsg('本章已完成！');
    }
  }, [currentTsumegoLevel, tsumegoCategories, startTsumego, setToastMsg, setCurrentTsumegoLevel]);

  const handleRetryTsumego = useCallback(() => {
    if (tsumegoRoot) startTsumego(tsumegoRoot);
  }, [tsumegoRoot, startTsumego]);

  const handleTsumegoMove = useCallback((x: number, y: number): boolean => {
    if (!tsumegoCurrentNode) return false;

    const playerProp = currentPlayer === 'black' ? 'B' : 'W';
    const coordStr = String.fromCharCode(x + 97) + String.fromCharCode(y + 97);

    const nextNode = tsumegoCurrentNode.children.find((child: SGFNode) => {
      const prop = child.properties[playerProp];
      return prop && prop[0].trim() === coordStr;
    });

    if (nextNode) {
      setTsumegoCurrentNode(nextNode);
      checkTsumegoStatus(nextNode);

      if (nextNode.children.length > 0 && !showTsumegoResult) {
        setTimeout(() => {
          const opponentNode = nextNode.children[0];
          const oppColor: Player = currentPlayer === 'black' ? 'white' : 'black';
          const oppProp = oppColor === 'black' ? 'B' : 'W';

          if (opponentNode.properties[oppProp]) {
            const moveStr = opponentNode.properties[oppProp][0].trim();
            if (moveStr && moveStr.length >= 2) {
              const ox = moveStr.charCodeAt(0) - 97;
              const oy = moveStr.charCodeAt(1) - 97;
              const attempt = attemptMove(boardRef.current, ox, oy, oppColor);
              if (attempt) {
                setBoard(attempt.newBoard);
                setLastMove({ x: ox, y: oy });
                setCurrentPlayer(oppColor === 'black' ? 'white' : 'black');
                if (attempt.captured > 0) playSfx('capture');
                else playSfx('move');
                setTsumegoCurrentNode(opponentNode);
                checkTsumegoStatus(opponentNode);
              }
            }
          }
        }, 100);
      }
      return true;
    } else {
      setToastMsg('答案错误 (再试一次)');
      vibrate(50);
      return false;
    }
  }, [tsumegoCurrentNode, currentPlayer, showTsumegoResult, boardRef, setBoard, setLastMove,
    setCurrentPlayer, checkTsumegoStatus, playSfx, setToastMsg, vibrate, setTsumegoCurrentNode]);

  // Leaf node detection effect
  useEffect(() => {
    if (gameMode !== 'Tsumego' || gameOver || !tsumegoCurrentNode) return;
    if (tsumegoCurrentNode.children.length === 0) {
      const justPlayedColor: Player = currentPlayer === 'black' ? 'white' : 'black';
      let isSuccess = justPlayedColor === userColor;

      const comment = tsumegoCurrentNode.properties['C']?.[0] ?? '';
      if (comment.toLowerCase().includes('right') || comment.includes('正解') || comment.includes('correct') || comment.includes('win')) isSuccess = true;
      if (comment.toLowerCase().includes('wrong') || comment.includes('failure') || comment.includes('失败')) isSuccess = false;

      setTimeout(() => {
        setTsumegoIsCorrect(isSuccess);
        setTsumegoResultMsg(comment);
        setShowTsumegoResult(true);

        if (isSuccess && currentTsumegoLevel) {
          setCompletedLevelIds(prev => {
            if (prev.includes(currentTsumegoLevel.id)) return prev;
            const next = [...prev, currentTsumegoLevel.id];
            localStorage.setItem('completed_tsumego_levels', JSON.stringify(next));
            return next;
          });
        }

        vibrate(isSuccess ? 100 : 200);
        playSfx(isSuccess ? 'win' : 'lose');
      }, 200);
    }
  }, [tsumegoCurrentNode, gameMode, currentPlayer, userColor, gameOver, currentTsumegoLevel,
    vibrate, playSfx, setTsumegoIsCorrect, setTsumegoResultMsg, setShowTsumegoResult, setCompletedLevelIds]);

  // Auto-move effect (opponent response)
  useEffect(() => {
    if (gameMode !== 'Tsumego' || gameOver || !tsumegoCurrentNode) return;
    if (currentPlayer !== userColor) {
      const playerProp = currentPlayer === 'black' ? 'B' : 'W';
      const nextMove = tsumegoCurrentNode.children.find(c => c.properties[playerProp]);
      if (nextMove?.properties[playerProp]) {
        const timer = setTimeout(() => {
          const moveStr = nextMove.properties[playerProp][0];
          if (moveStr && moveStr.length >= 2) {
            const x = moveStr.charCodeAt(0) - 97;
            const y = moveStr.charCodeAt(1) - 97;
            executeMove(x, y, false);
            setTsumegoCurrentNode(nextMove);
            if (nextMove.properties['C']) {
              setToastMsg(nextMove.properties['C'][0]);
              setTimeout(() => setToastMsg(null), 3000);
            }
          }
        }, 200);
        return () => clearTimeout(timer);
      }
    }
  }, [tsumegoCurrentNode, currentPlayer, gameMode, userColor, gameOver,
    executeMove, setToastMsg, setTsumegoCurrentNode]);

  return {
    startTsumego,
    exitTsumegoMode,
    handleOpenTsumego,
    handleSelectTsumegoSet,
    handleNextTsumego,
    handleRetryTsumego,
    handleTsumegoMove,
    checkTsumegoStatus,
  };
};

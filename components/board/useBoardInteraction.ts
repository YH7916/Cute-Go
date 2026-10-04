import { useState, useRef, useEffect } from 'react';
import type React from 'react';
import type { GameBoardProps, QiSegment } from './types';
import { calculateQiFlow } from './qiFlow';

type InteractionProps = Pick<
  GameBoardProps,
  'board' | 'lastMove' | 'showQi' | 'qiOnHover' | 'showCoordinates' | 'stoneAnimationEnabled' | 'autoShowQiAt' | 'onIntersectionClick' | 'onInspectPoint' | 'vibrate'
> & { boardPixelSize: number };

export function useBoardInteraction({
  board,
  lastMove,
  showQi,
  qiOnHover = true,
  showCoordinates,
  stoneAnimationEnabled = true,
  autoShowQiAt,
  onIntersectionClick,
  onInspectPoint,
  vibrate,
  boardPixelSize,
}: InteractionProps) {
  const boardSize = board.length;
  // --- ZOOM & PAN STATE ---
  const [transform, setTransform] = useState({ scale: 1, x: 0, y: 0 });
  const touchState = useRef({
    isPanning: false,
    startDist: 0,
    startScale: 1,
    lastX: 0,
    lastY: 0,
    blockClick: false,
  });

  // --- ACTIVE QI STATE ---
  const [activeQiSegments, setActiveQiSegments] = useState<QiSegment[]>([]);

  // [Perf] Track the ID of the most recently placed stone for animation targeting
  // This prevents ALL stones from re-animating on every render
  const [animatingStoneId, setAnimatingStoneId] = useState<string | null>(null);
  const lastAnimationStoneId = useRef<string | null>(null);

  // Update animating stone when lastMove changes
  useEffect(() => {
    const stoneId = lastMove ? board[lastMove.y]?.[lastMove.x]?.id ?? null : null;
    const isNewStone = stoneId !== lastAnimationStoneId.current;
    lastAnimationStoneId.current = stoneId;
    setAnimatingStoneId(null);
    // Re-enabling animations must not replay a stone placed while disabled.
    if (!stoneAnimationEnabled || !stoneId || !isNewStone) return;
    setAnimatingStoneId(stoneId);
    const timer = setTimeout(() => setAnimatingStoneId(null), 450);
    return () => clearTimeout(timer);
  }, [lastMove, board, stoneAnimationEnabled]);

  useEffect(() => {
    setTransform({ scale: 1, x: 0, y: 0 });
    setActiveQiSegments([]); // 重置棋盘大小时清除气流
    setAnimatingStoneId(null);
  }, [boardSize, showCoordinates]);

  // 当棋盘变化（落子）时，清除之前的气流显示
  // [Perf] Only update state if segments exist, avoiding an unnecessary extra render cycle
  useEffect(() => {
    setActiveQiSegments((prev) => (prev.length > 0 ? [] : prev));
  }, [board]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchState.current.lastX = e.touches[0].clientX;
      touchState.current.lastY = e.touches[0].clientY;
      touchState.current.isPanning = false;
    } else if (e.touches.length === 2) {
      touchState.current.isPanning = true;
      touchState.current.blockClick = true;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      touchState.current.startDist = Math.hypot(dx, dy);
      touchState.current.startScale = transform.scale;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 2) return;

    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);

      if (touchState.current.startDist > 0) {
        const scaleFactor = dist / touchState.current.startDist;
        const newScale = Math.min(Math.max(1, touchState.current.startScale * scaleFactor), 3);

        const panDx = e.touches[0].clientX - touchState.current.lastX;
        const panDy = e.touches[0].clientY - touchState.current.lastY;

        touchState.current.lastX = e.touches[0].clientX;
        touchState.current.lastY = e.touches[0].clientY;

        setTransform((prev) => {
          const limit = (boardPixelSize * prev.scale) / 2;
          const newX = Math.max(-limit, Math.min(limit, prev.x + panDx));
          const newY = Math.max(-limit, Math.min(limit, prev.y + panDy));
          return { ...prev, x: newX, y: newY, scale: newScale };
        });
      }
    }
  };

  // --- SHOW QI LOGIC ---
  const getQiFlow = (x: number, y: number) => calculateQiFlow(board, x, y);

  // --- Auto Show Qi Effect ---
  useEffect(() => {
    if (autoShowQiAt) {
      const segments = getQiFlow(autoShowQiAt.x, autoShowQiAt.y);
      if (segments.length > 0) {
        setActiveQiSegments(segments);
      }
    }
  }, [autoShowQiAt]);

  const handleStoneHover = (x: number, y: number) => {
    if (!qiOnHover) return;
    if (!showQi) {
      if (activeQiSegments.length > 0) setActiveQiSegments([]);
      return;
    }
    // 如果悬停的是空位，且当前有显示气流，则清空（桌面体验优化）
    if (!board[y][x]) {
      // setActiveQiSegments([]); // 可选：如果希望移开鼠标就消失，可以取消注释
      return;
    }
    setActiveQiSegments(getQiFlow(x, y));
  };

  const handleMouseLeaveBoard = () => {
    if (!autoShowQiAt) {
      setActiveQiSegments([]);
    }
  };

  // 统一处理点击：如果是空位则落子，如果是棋子则显示气（移动端友好）
  const handleIntersectionClickWrapper = (x: number, y: number) => {
    if (touchState.current.blockClick) return;

    // 逻辑分支：
    // 1. 如果该位置有子，且开启了显示气功能 -> 切换显示该子的气
    if (board[y][x] && showQi) {
      const segments = getQiFlow(x, y);
      // 如果点击的是当前已经高亮的棋子，可以做toggle，或者刷新
      setActiveQiSegments(segments);
      // 手机震动反馈
      vibrate?.(10);
      onInspectPoint?.(x, y);
      return;
    }

    // 2. 如果该位置无子 -> 落子，并自动清除当前的气流显示
    setActiveQiSegments([]);
    onIntersectionClick(x, y);
  };

  const handleTouchEnd = () => {
    setTimeout(() => {
      touchState.current.blockClick = false;
      touchState.current.isPanning = false;
    }, 100);
  };
  return {
    transform,
    setTransform,
    activeQiSegments,
    animatingStoneId: stoneAnimationEnabled ? animatingStoneId : null,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleMouseLeaveBoard,
    handleIntersectionClickWrapper,
    handleStoneHover,
  };
}

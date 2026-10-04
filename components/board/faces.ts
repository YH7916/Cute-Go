import type { Group, Stone, GameType } from '../../types';

export const getGroupFaces = (
  groups: Group[], stones: Stone[], gameType: GameType, separatePieces = false
) => {
  if (gameType === 'Gomoku') {
    return stones.map((stone) => ({
      id: stone.id,
      x: stone.x,
      y: stone.y,
      mood: 'happy' as const,
      color: stone.color,
      scale: 1,
      lookOffset: { x: 0, y: 0 },
    }));
  }

  // Go mood always belongs to the connected group, even when each stone has a face.
  return groups.flatMap((group) => {
    let sumX = 0;
    let sumY = 0;
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    const sortedStones = [...group.stones].sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      return a.x - b.x;
    });

    const groupKey = sortedStones.map((s) => s.id).join('-');

    sortedStones.forEach((s) => {
      sumX += s.x;
      sumY += s.y;
      minX = Math.min(minX, s.x);
      maxX = Math.max(maxX, s.x);
      minY = Math.min(minY, s.y);
      maxY = Math.max(maxY, s.y);
    });

    const count = sortedStones.length;
    const centerX = sumX / count;
    const centerY = sumY / count;

    let finalX = centerX;
    let finalY = centerY;

    const isHorizontalLine = maxY === minY && count > 1;
    const isVerticalLine = maxX === minX && count > 1;

    if (isHorizontalLine || isVerticalLine) {
      const edgeStone = sortedStones[sortedStones.length - 1];
      finalX = edgeStone.x;
      finalY = edgeStone.y;
    } else {
      let closestDist = Infinity;
      let closestStone = sortedStones[0];
      sortedStones.forEach((s) => {
        const dist = Math.pow(s.x - centerX, 2) + Math.pow(s.y - centerY, 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestStone = s;
        }
      });
      finalX = closestStone.x;
      finalY = closestStone.y;
    }

    let libertyCenter: { x: number; y: number } | undefined;
    if (group.libertyPoints && group.libertyPoints.length > 0) {
      let lx = 0;
      let ly = 0;
      group.libertyPoints.forEach((p) => {
        lx += p.x;
        ly += p.y;
      });
      lx /= group.libertyPoints.length;
      ly /= group.libertyPoints.length;

      libertyCenter = { x: lx, y: ly };
    }

    let mood: 'happy' | 'neutral' | 'worried' = 'happy';
    if (group.liberties === 1) mood = 'worried';
    else if (group.liberties <= 3) mood = 'neutral';

    const sizeBonus = Math.min(count - 1, 3) * 0.1;

    const anchors = separatePieces
      ? sortedStones
      : [{ id: groupKey, x: finalX, y: finalY }];
    return anchors.map(({ id, x, y }) => {
      let lookOffset = { x: 0, y: 0 };
      if (libertyCenter) {
        const dx = libertyCenter.x - x;
        const dy = libertyCenter.y - y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        lookOffset = { x: dx / dist, y: dy / dist };
      }
      return {
        id, x, y, mood,
        color: group.stones[0].color,
        scale: separatePieces ? 1 : 1 + sizeBonus,
        lookOffset,
      };
    });
  });
};

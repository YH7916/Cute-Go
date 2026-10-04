export const calculateBoardConstants = (boardSize: number, showCoordinates: boolean = false) => {
  // Dynamic cell size: Smaller boards have larger cells, maxing out at 19
  // FIXED: Revert to 40 as standard base
  const CELL_SIZE = Math.min(40, 420 / (boardSize + 1));

  // Increase padding if coordinates are shown
  const BASE_PADDING = boardSize >= 19 ? 12 : 20;
  const GRID_PADDING = showCoordinates ? BASE_PADDING + 15 : BASE_PADDING;

  return { CELL_SIZE, GRID_PADDING };
};

export const getStarPoints = (boardSize: number) => {
  const points: [number, number][] = [];

  if (boardSize < 7) {
    // No star points for very small boards
  } else if (boardSize % 2 !== 0) {
    // Odd sizes have a center point (Tengen)
    const center = Math.floor(boardSize / 2);
    points.push([center, center]);

    if (boardSize >= 9) {
      // Add corners
      const offset = boardSize >= 13 ? 3 : 2; // 4th line for 13+, 3rd line for 9-12
      points.push([offset, offset]);
      points.push([boardSize - 1 - offset, offset]);
      points.push([offset, boardSize - 1 - offset]);
      points.push([boardSize - 1 - offset, boardSize - 1 - offset]);
    }

    if (boardSize >= 19) {
      // Add side stars
      const offset = 3;
      const center = Math.floor(boardSize / 2);
      points.push([center, offset]);
      points.push([center, boardSize - 1 - offset]);
      points.push([offset, center]);
      points.push([boardSize - 1 - offset, center]);
    }
  } else {
    // Even sizes - usually no Tengen, but maybe symmetric 4 stars
    // Just empty or custom logic if needed. keeping it clean for now.
  }

  return points;
};

import { BoardState, Player, Point } from '../../types';

export const checkGomokuWin = (
  board: BoardState,
  lastMove: { x: number; y: number } | null
): boolean => {
  if (!lastMove) return false;
  const { x, y } = lastMove;
  const player = board[y][x]?.color;
  if (!player) return false;
  const size = board.length;
  const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;

  for (const [dx, dy] of directions) {
    let count = 1, i = 1;
    while (true) {
      const nx = x + dx * i, ny = y + dy * i;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx]?.color === player) {
        count++; i++;
      } else break;
    }
    i = 1;
    while (true) {
      const nx = x - dx * i, ny = y - dy * i;
      if (nx >= 0 && nx < size && ny >= 0 && ny < size && board[ny][nx]?.color === player) {
        count++; i++;
      } else break;
    }
    if (count >= 5) return true;
  }
  return false;
};

export const attemptGomokuMove = (
  board: BoardState,
  x: number,
  y: number,
  player: Player
): { newBoard: BoardState; captured: number } | null => {
  if (board[y][x] !== null) return null;
  const safeBoard = board.map(row => [...row]);
  safeBoard[y][x] = { color: player, id: `${player}-${Date.now()}-${x}-${y}`, x, y };
  return { newBoard: safeBoard, captured: 0 };
};

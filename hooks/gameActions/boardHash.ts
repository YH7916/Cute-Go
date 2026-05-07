import type { GameStateReturn } from './types';

export const getBoardHash = (board: GameStateReturn['board']) => {
  let hash = '';
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board.length; c++) {
      hash += board[r][c] ? (board[r][c]?.color === 'black' ? 'B' : 'W') : '.';
    }
  }
  return hash;
};

import { createInitialPosition } from '../game/positionState';
import type { GamePosition } from '../game/positionState';
import type { Point } from '../../types';

export type TutorialPuzzleType = 'qi' | 'capture' | 'connection' | 'atari_escape' | 'connect_cut'
  | 'capture_group' | 'forbidden' | 'ko' | 'eyes' | 'endgame' | 'territory' | 'final_shape' | 'zoom' | 'explore';

// Small, centered examples isolate the new idea; X = black, O = white.
const positions: Partial<Record<TutorialPuzzleType, readonly string[]>> = {
  qi: ['.....', '.....', '..X..', '.....', '.....'],
  capture: ['.....', '..X..', '.XOX.', '.....', '.....'],
  connection: ['.....', '.....', '..XX.', '.....', '.....'],
  atari_escape: ['.....', '..O..', '.OXO.', '.....', '.....'],
  connect_cut: ['.....', '.....', '.X.X.', '.....', '.....'],
  capture_group: ['.....', '..XX.', '.XOOX', '...X.', '.....'],
  forbidden: ['.....', '..O..', '.O.O.', '..O..', '.....'],
  ko: ['.....', '.XO..', 'XO.O.', '.XO..', '.....'],
  eyes: ['.......', '..XXX..', '..X.X..', '..X.X..', '..X.X..', '..XXX..', '.......'],
  // Two connected living chains. The cross-wall splits each side into two
  // independent eye spaces; every empty point has exactly one owner.
  endgame: ['....XO...', '....XO...', '....XO...', '....XO...', 'XXXXXOOOO',
    '....XO...', '....XO...', '....XO...', '....XO...'],
};

export function createTutorialPosition(type: TutorialPuzzleType, size: number): GamePosition {
  const position = createInitialPosition(size);
  const rows = positions[type === 'territory' ? 'endgame' : type];
  rows?.forEach((row, y) => [...row].forEach((cell, x) => {
    if (cell !== '.') position.board[y][x] = { x, y, color: cell === 'X' ? 'black' : 'white', id: `tutorial-${x}-${y}` };
  }));
  const examples = type === 'final_shape' ? [{ x: 6, y: 2, color: 'white' as const }]
    : type === 'zoom' ? [{ x: 3, y: 3, color: 'black' as const }, { x: 5, y: 4, color: 'black' as const },
      { x: 9, y: 3, color: 'white' as const }, { x: 9, y: 9, color: 'white' as const }] : [];
  examples.forEach(stone => { position.board[stone.y][stone.x] = { ...stone, id: `tutorial-${stone.x}-${stone.y}` }; });
  return position;
}

export function tutorialTarget(type: TutorialPuzzleType, position: GamePosition): Point | null {
  if (type === 'capture' || type === 'atari_escape' || type === 'capture_group') return { x: 2, y: 3 };
  if (type === 'forbidden' || type === 'connect_cut') return { x: 2, y: 2 };
  if (type === 'ko') return position.history.length ? { x: 1, y: 2 } : { x: 2, y: 2 };
  if (type === 'eyes') return { x: 3, y: 3 };
  if (type === 'final_shape') return position.history.length ? { x: 4, y: 3 } : { x: 2, y: 2 };
  return null;
}

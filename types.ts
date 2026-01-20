
export type Player = 'black' | 'white';

export interface Point {
  x: number;
  y: number;
}

export type Skin = 'default' | 'bear' | 'cat' | 'dog' | 'bird';

export interface Stone {
  color: Player;
  id: string; // Unique ID for React keys
  x: number;
  y: number;
}

export type BoardState = (Stone | null)[][];

export interface Group {
  stones: Stone[];
  liberties: number;
  libertyPoints: Point[]; // Added for face direction logic
}

export type GameMode = 'PvP' | 'PvAI';
export type GameType = 'Go' | 'Gomoku';
export type BoardSize = number; 
export type Difficulty = 'Easy' | 'Medium' | 'Hard';

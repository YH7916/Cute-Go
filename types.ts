
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

export type GameMode = 'PvP' | 'PvAI' | 'Tsumego';
export type GameType = 'Go' | 'Gomoku';
export type BoardSize = number; 

export interface TsumegoProblem {
  id: string;
  setup: {
      ab?: string[]; // Add Black
      aw?: string[]; // Add White
  };
  solution: any; // SGF Node logic
}

export interface TsumegoSet {
  title: string;
  filename: string;
  difficulty: string;
} 

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

export type AchievementCategory = 'milestone' | 'skill' | 'social' | 'fun';

export interface AchievementDef {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  target_value: number;
}

export interface UserAchievement {
  achievement_code: string;
  current_value: number;
  is_unlocked: boolean;
  unlocked_at: string | null;
}

// 用于前端展示的聚合类型
export interface DisplayAchievement extends AchievementDef {
  progress: UserAchievement | null; // null 表示从未触发过
}

// Undo History Item
export interface HistoryItem {
  board: BoardState;
  currentPlayer: Player;
  blackCaptures: number;
  whiteCaptures: number;
  lastMove: { x: number, y: number } | null;
  consecutivePasses: number;
}

export type AppMode = 'playing' | 'review' | 'setup';

// 信令消息类型
export type SignalMessage =
  | { type: 'join' }
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

export type ExtendedDifficulty = Difficulty | 'Custom';

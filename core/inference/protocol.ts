import type { BoardState, Difficulty, GameType, HistoryItem, Player, Point } from '../../types';

// Worker message protocol types — shared between main thread and ai.worker.ts

export interface RequestIdentity { requestId: number; generation: number }
export interface AnalysisMoveEvaluation {
  visits: number;
  prior?: number;
  winRateBlack?: number;
}
export interface AnalysisCandidate extends AnalysisMoveEvaluation {
  point: Point;
  variation?: Point[];
}
export interface CoachAnalysisDetails {
  purpose?: 'coach';
  visits?: number;
  candidates?: AnalysisCandidate[];
  pass?: AnalysisMoveEvaluation;
  estimatedBlackLead?: number;
}
export interface AnalysisResponse extends CoachAnalysisDetails {
  winRate: number;
  lead: number;
  ownership: Float32Array | null;
}

export type WorkerInMessage = { generation: number } & (
  | {
      type: 'init';
      payload: {
        modelPath: string;
        modelParts?: string[];
        wasmPath?: string;
        numThreads?: number;
        onlyRules?: boolean;
      };
    }
  | {
      type: 'compute';
      requestId: number;
      data: {
        board: BoardState;
        history: HistoryItem[];
        color: Player;
        size: number;
        gameType?: GameType;
        simulations?: number;
        komi?: number;
        difficulty?: Difficulty;
        temperature?: number;
        mode?: 'play' | 'analyze';
        purpose?: 'coach';
        coachFocusPoints?: Point[];
      };
    }
  | { type: 'stop' }
  | { type: 'release' }
  | { type: 'reinit' });

export type WorkerReply =
  | { type: 'init-complete' }
  | { type: 'released' }
  | { type: 'error'; message: string; requestId?: number }
  | { type: 'status'; message: string }
  | {
      type: 'ai-response';
      data: CoachAnalysisDetails & {
        move: Point | null;
        winRate: number;
        lead?: number;
        scoreStdev?: number;
        ownership?: Float32Array | null;
      };
    };

export type WorkerOutMessage = { generation: number } & (
  | Exclude<WorkerReply, { type: 'ai-response' }>
  | (Extract<WorkerReply, { type: 'ai-response' }> & { requestId: number })
);

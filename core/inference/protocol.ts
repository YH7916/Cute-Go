/* eslint-disable @typescript-eslint/no-explicit-any */

// Worker message protocol types — shared between main thread and ai.worker.ts

export type WorkerInMessage =
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
      data: {
        board: any[][];
        history: any[];
        color: 'black' | 'white';
        size: number;
        gameType?: 'Go' | 'Gomoku';
        simulations?: number;
        komi?: number;
        difficulty?: 'Fun' | 'Easy' | 'Medium' | 'Hard';
        temperature?: number;
        mode?: 'play' | 'analyze';
      };
    }
  | { type: 'stop' }
  | { type: 'release' }
  | { type: 'reinit' };

export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'error'; message: string }
  | { type: 'progress'; message: string }
  | {
      type: 'result';
      move: { x: number; y: number } | null;
      winRate?: number;
      lead?: number;
      ownership?: number[];
    }
  | { type: 'stopped' };

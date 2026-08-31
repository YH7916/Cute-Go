import type { HistoryItem } from '../../types';
import { MicroBoard, type Sign } from '../../utils/micro-board';

export interface InferenceHistoryMove {
  color: Sign;
  x: number;
  y: number;
}

export interface HistoryReplayFailure extends InferenceHistoryMove {
  index: number;
}

export const replayHistoryForInference = (
  history: readonly HistoryItem[],
  boardSize: number
): {
  board: MicroBoard;
  historyMoves: InferenceHistoryMove[];
  failures: HistoryReplayFailure[];
} => {
  const board = new MicroBoard(boardSize);
  const historyMoves: InferenceHistoryMove[] = [];
  const failures: HistoryReplayFailure[] = [];

  history.forEach((item, index) => {
    const color: Sign = item.currentPlayer === 'black' ? 1 : -1;

    if (item.move === null) {
      historyMoves.push({ color, x: -1, y: -1 });
      board.ko = -1;
      return;
    }

    const move = { color, x: item.move.x, y: item.move.y };
    if (!board.play(move.x, move.y, move.color)) {
      failures.push({ ...move, index });
    }
    historyMoves.push(move);
  });

  return { board, historyMoves, failures };
};

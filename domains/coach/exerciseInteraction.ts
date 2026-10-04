import { getBoardHash, getGroup } from '../../core/board';
import { getBeginnerAIMove } from '../../core/go/ai';
import { inspectMove, type MoveRejectionReason } from '../../core/go/rules';
import { calculateTerritory } from '../../core/go/scoring';
import type { Player, Point } from '../../types';
import { recordMove, recordPass, type GamePosition } from '../game/positionState';
import { gradeExercise } from './exercise';
import type { Exercise, ExerciseSequenceStep } from './exerciseTypes';
import { hasCorrectContinuation, replaySourceVariation, sourceDemonstration } from './sourceExercise';

export interface ExerciseDemonstrationFrame { position: GamePosition; text: string; points?: readonly Point[]; boardMarks?: Exercise['boardMarks'] }

function previousHash(position: GamePosition) {
  const previous = position.history.at(-1);
  return previous ? getBoardHash(previous.board) : null;
}

function play(position: GamePosition, point: Point) {
  const move = inspectMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previousHash(position));
  return move.legal ? { position: recordMove(position, move.result.newBoard, point, move.result.captured, false) }
    : { reason: move.reason };
}

function rejectedMove(reason?: MoveRejectionReason) {
  return reason === 'occupied' ? '这里已有棋子，请换一个交叉点。'
    : reason === 'ko' ? '这里是劫，不能马上提回。请换一手。'
      : reason === 'suicide' ? '这手落下后没有气，也没有提走对方棋子。请换一手。'
        : '落点不在棋盘内，请换一个交叉点。';
}

/** A demonstration is built from this exact exercise; no lesson-level substitute board. */
export function createExerciseDemonstration(exercise: Exercise): readonly ExerciseDemonstrationFrame[] {
  if (exercise.kind === 'choice') return [];
  if (exercise.kind === 'variation') return sourceDemonstration(exercise);
  if (exercise.kind === 'action') {
    const points = exercise.expectedPoints ?? [];
    const grade = gradeExercise(exercise, { kind: 'action', action: exercise.action, points });
    return grade.nextPosition ? [{ position: exercise.position, text: exercise.prompt },
      { position: grade.nextPosition, text: grade.explanation, points }] : [];
  }
  const rubric = exercise.kind === 'point' || exercise.kind === 'number' ? exercise.rubric : null;
  const targetPoints = rubric && ('anchor' in rubric ? [rubric.anchor] : 'anchors' in rubric ? rubric.anchors : undefined);
  const root: ExerciseDemonstrationFrame = { position: exercise.position, text: exercise.prompt, ...(targetPoints ? { points: targetPoints } : {}) };
  if (exercise.kind === 'number') {
    const counting = exercise.rubric;
    const group = counting.kind === 'liberties' && exercise.position.board[counting.anchor.y]?.[counting.anchor.x]
      ? getGroup(exercise.position.board, counting.anchor) : null;
    const points = counting.kind === 'territory' ? calculateTerritory(exercise.position.board)[counting.color] : group?.libertyPoints;
    if (!points) return [];
    const grade = gradeExercise(exercise, { kind: 'number', value: points.length });
    return grade.outcome === 'success' ? [root, { position: exercise.position, text: grade.explanation, points }] : [];
  }
  if (exercise.kind === 'point') {
    for (let y = 0; y < exercise.position.board.length; y++) for (let x = 0; x < exercise.position.board.length; x++) {
      const grade = gradeExercise(exercise, { kind: 'point', point: { x, y } });
      if (grade.outcome === 'success' && grade.nextPosition) return [root, { position: grade.nextPosition, text: grade.explanation, points: [{ x, y }] }];
    }
    return [];
  }
  function branch(position: GamePosition, choices: readonly ExerciseSequenceStep[], points: readonly Point[],
    frames: readonly ExerciseDemonstrationFrame[]): readonly ExerciseDemonstrationFrame[] | null {
    for (const step of choices) {
      const answer = [...points, step.point];
      const grade = gradeExercise(exercise, { kind: 'sequence', points: answer });
      if (grade.outcome !== 'continue' && grade.outcome !== 'success') continue;
      const played = play(position, step.point);
      if (!played.position) continue;
      let nextPosition = played.position;
      const nextFrames = [...frames, { position: nextPosition, points: [step.point], text: step.reply
        ? `${position.currentPlayer === 'black' ? '黑' : '白'}棋落子。接着看看对方怎样应手。` : grade.explanation }];
      if (step.reply) {
        const reply = play(nextPosition, step.reply);
        if (!reply.position) continue;
        nextPosition = reply.position;
        nextFrames.push({ position: nextPosition, text: grade.explanation, points: [step.reply] });
      }
      if (grade.outcome === 'success') return nextFrames;
      if (step.next) {
        const continuation = branch(nextPosition, step.next, answer, nextFrames);
        if (continuation) return continuation;
      }
    }
    return null;
  }
  return branch(exercise.position, exercise.solution, [], [root]) ?? [];
}

/** Hints follow the current verified branch, never the demonstration's preferred path. */
export function getExerciseGuidance(exercise: Exercise, moves: readonly Point[], position: GamePosition | undefined,
  hintCount: number): { hint: string; points: readonly Point[]; focusPoint?: Point } {
  const unknown = { hint: hintCount > 0 ? '当前是自由试下局面。请重新数各块棋的气，或撤回到题目变化后再看提示。' : '', points: [] };
  if (!position || !exercise.position) return unknown;
  let expected = exercise.position;
  const source = exercise.kind === 'variation' ? replaySourceVariation(exercise, moves) : null;
  if (source) {
    if (source.grade.outcome !== 'continue' || !source.grade.nextPosition) return { hint: '', points: [] };
    expected = source.grade.nextPosition;
  }
  let choices: readonly ExerciseSequenceStep[] = [];
  if (exercise.kind === 'sequence') {
    choices = exercise.solution;
    for (const point of moves) {
      const step = choices.find(item => item.point.x === point.x && item.point.y === point.y);
      if (!step) return unknown;
      choices = step.next ?? [];
    }
    if (moves.length) {
      const grade = gradeExercise(exercise, { kind: 'sequence', points: moves });
      if (grade.outcome !== 'continue' || !grade.nextPosition) return { hint: '', points: [] };
      expected = grade.nextPosition;
    }
  }
  if (position.currentPlayer !== expected.currentPlayer || position.blackCaptures !== expected.blackCaptures
    || position.whiteCaptures !== expected.whiteCaptures || position.history.length !== expected.history.length
    || position.consecutivePasses !== expected.consecutivePasses || previousHash(position) !== previousHash(expected)
    || getBoardHash(position.board) !== getBoardHash(expected.board)) return unknown;
  if (source) {
    const point = source.choices.find(hasCorrectContinuation)?.point;
    return { hint: hintCount ? exercise.hints[Math.min(hintCount, 2) - 1] : '',
      points: hintCount >= 2 && point ? [point] : [] };
  }
  if (exercise.kind === 'choice') return { hint: hintCount ? exercise.hints[Math.min(hintCount, 2) - 1] : '', points: [] };
  if (exercise.kind === 'sequence') {
    if (!hintCount) return { hint: '', points: [] };
    if (hintCount === 1) return { hint: moves.length
      ? '观察对方刚才应手后的局面，重新数目标棋块的气，再比较它的各个出口。' : exercise.hints[0], points: [] };
    const next = choices.find(step => {
      const grade = gradeExercise(exercise, { kind: 'sequence', points: [...moves, step.point] });
      return grade.outcome === 'continue' || grade.outcome === 'success';
    });
    return next ? { hint: moves.length
      ? '圈出的点是当前变化的一种可行下一手。落子后再检查提子和剩余的气。' : exercise.hints[1],
    points: [next.point], focusPoint: next.point } : { hint: '', points: [] };
  }
  const rubric = exercise.kind === 'point' || exercise.kind === 'number' ? exercise.rubric : null;
  const targets = rubric && ('anchor' in rubric ? [rubric.anchor] : 'anchors' in rubric ? rubric.anchors : []);
  const points = hintCount >= 2 ? createExerciseDemonstration(exercise)[1]?.points ?? [] : targets || [];
  return { hint: hintCount ? exercise.hints[Math.min(hintCount, 2) - 1] : '', points,
    ...(points[0] ? { focusPoint: points[0] } : {}) };
}

/** Authored replies already return the learner's turn and must not get a second reply. */
export function replyToExerciseDeviation(position: GamePosition, learner: Player): { position: GamePosition; explanation: string } {
  if (position.currentPlayer === learner) return { position, explanation: '你可以继续试下，或退一步换个下法。' };
  const point = getBeginnerAIMove(position.board, position.currentPlayer, previousHash(position));
  const reply = point ? play(position, point) : null;
  if (reply?.position) return { position: reply.position, explanation: '对方应手了。继续试下，或退一步换个下法。' };
  return { position: recordPass(position), explanation: '对方停一手。你可以继续落子，或退一步换个下法。' };
}

/** Free exploration reuses the local Go opponent; it never grades learning success. */
export function playExerciseExploration(position: GamePosition, point: Point, learner: Player): {
  position: GamePosition; explanation: string; accepted: boolean;
} {
  if (position.currentPlayer !== learner) return { position, explanation: '现在轮到对方应手，请稍后再落子。', accepted: false };
  const played = play(position, point);
  if (!played.position) return { position, explanation: rejectedMove(played.reason), accepted: false };
  return { ...replyToExerciseDeviation(played.position, learner), accepted: true };
}

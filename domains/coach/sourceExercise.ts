import { getBoardHash } from '../../core/board';
import { inspectMove } from '../../core/go/rules';
import type { Point } from '../../types';
import { recordMove, recordPass, type GamePosition } from '../game/positionState';
import type { Exercise, ExerciseGrade, ExerciseVariationNode } from './exerciseTypes';

type Variation = Extract<Exercise, { kind: 'variation' }>;
const same = (a: Point | null, b: Point | null) => a === b || !!a && !!b && a.x === b.x && a.y === b.y;
export function hasCorrectContinuation(node: ExerciseVariationNode): boolean {
  return !node.wrong && (!!node.correct || node.children.some(hasCorrectContinuation));
}
function chooseReply(nodes: readonly ExerciseVariationNode[]) {
  return nodes.find(hasCorrectContinuation) ?? nodes[0];
}
function play(position: GamePosition, node: Pick<ExerciseVariationNode, 'point' | 'color'>) {
  if (node.color !== position.currentPlayer) return null;
  if (!node.point) return recordPass(position);
  const previous = position.history.at(-1);
  const move = inspectMove(position.board, node.point.x, node.point.y, node.color, 'Go', previous ? getBoardHash(previous.board) : null);
  return move.legal ? recordMove(position, move.result.newBoard, node.point, move.result.captured, false) : null;
}

/** Replay original branches. Success needs an explicit source verdict, including non-leaf correct nodes. */
export function replaySourceVariation(exercise: Variation, points: readonly Point[]): {
  grade: ExerciseGrade; choices: readonly ExerciseVariationNode[];
} {
  let position = exercise.position;
  let choices = exercise.solution;
  let explanation = exercise.prompt;
  let boardMarks = exercise.boardMarks;
  const done = (outcome: ExerciseGrade['outcome'], text: string) => ({ grade: { outcome, explanation: text, nextPosition: position, boardMarks }, choices });
  for (let index = 0; index < points.length; index++) {
    const node = choices.find(item => same(item.point, points[index]) && item.color === position.currentPlayer);
    const next = play(position, node ?? { point: points[index], color: position.currentPlayer });
    if (!next) return done('failure', '这手不能落在这里，检查一下气与劫。');
    position = next;
    if (!node) return done('unverified', '我们顺着这手继续看看，也可以退一步换个下法。');
    boardMarks = node.boardMarks ?? boardMarks;
    explanation = node.text || (node.correct ? exercise.explanation : node.wrong
      ? '再看看对方怎样应手。可以退一步，换个下法。' : '轮到你了，继续完成这一段变化。');
    choices = node.children;
    if (node.correct) return done(index === points.length - 1 ? 'success' : 'unverified', explanation);
    let wrong = !!node.wrong;
    if (choices.length && position.currentPlayer !== exercise.position.currentPlayer) {
      const reply = chooseReply(choices);
      const replied = play(position, reply);
      if (!replied) return done('unverified', '先退一步，重新看看这个局面。');
      position = replied;
      boardMarks = reply.boardMarks ?? boardMarks;
      choices = reply.children;
      explanation = reply.text || explanation;
      wrong ||= !!reply.wrong;
      if (reply.correct && !wrong) return done(index === points.length - 1 ? 'success' : 'unverified', explanation);
    }
    if (wrong) return done('failure', explanation);
    if (!choices.length) return done('unverified', explanation || '继续看看这手的后续。');
  }
  return done('continue', points.length ? explanation : exercise.prompt);
}

function correctPath(nodes: readonly ExerciseVariationNode[]): readonly ExerciseVariationNode[] | null {
  for (const node of nodes) {
    if (node.wrong) continue;
    if (node.correct) return [node];
    const tail = correctPath(node.children);
    if (tail) return [node, ...tail];
  }
  return null;
}
export function sourceDemonstration(exercise: Variation) {
  let position = exercise.position;
  let boardMarks = exercise.boardMarks;
  const frames: { position: GamePosition; text: string; points?: readonly Point[]; boardMarks?: Exercise['boardMarks'] }[] = [{ position, text: exercise.prompt, boardMarks }];
  const answer = correctPath(exercise.solution);
  if (!answer) return [];
  const path = [...answer];
  let tail = path.at(-1)!;
  // Some source correct nodes continue with an illustrated reply. The learner
  // can finish at the marked answer; the optional demo still shows that line.
  while (tail.children.length) {
    const choices = tail.children.filter(node => !node.wrong);
    const continuation = choices.find(hasCorrectContinuation) ?? (choices.length === 1 ? choices[0] : undefined);
    if (!continuation) break;
    path.push(continuation);
    tail = continuation;
  }
  for (const node of path) {
    const next = play(position, node);
    if (!next) return [];
    position = next;
    boardMarks = node.boardMarks ?? boardMarks;
    frames.push({ position, text: node.text || (node.correct ? exercise.explanation : `${node.color === 'black' ? '黑' : '白'}棋${node.point ? '落在这里。' : '停一手。'}`),
      points: node.point ? [node.point] : [], boardMarks });
  }
  return frames;
}

export function gradeSourceAction(exercise: Extract<Exercise, { kind: 'action' }>, action: string, points: readonly Point[]): ExerciseGrade {
  if (action !== exercise.action) return { outcome: 'unverified', explanation: exercise.prompt };
  if (action === 'pass') return { outcome: 'success', explanation: exercise.explanation, nextPosition: recordPass(exercise.position) };
  if (action === 'finish') return { outcome: 'success', explanation: exercise.explanation, nextPosition: exercise.position };
  const expected = exercise.expectedPoints ?? [];
  const unique = new Set(points.map(point => `${point.x},${point.y}`));
  if (unique.size !== points.length || points.length !== expected.length || !expected.every(point => points.some(item => same(item, point)))) {
    return { outcome: 'failure', explanation: '再看看哪些棋没有办法做出两只眼。点一下棋块，可以重新选择。' };
  }
  const board = exercise.position.board.map(row => [...row]);
  let { blackCaptures, whiteCaptures } = exercise.position;
  for (const point of expected) {
    const stone = board[point.y]?.[point.x];
    if (!stone) return { outcome: 'unverified', explanation: exercise.prompt };
    if (stone.color === 'white') blackCaptures++; else whiteCaptures++;
    board[point.y][point.x] = null;
  }
  return { outcome: 'success', explanation: exercise.explanation, nextPosition: { ...exercise.position, board, blackCaptures, whiteCaptures } };
}

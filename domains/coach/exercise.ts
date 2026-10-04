import { getBoardHash, getGroup, getNeighbors } from '../../core/board';
import { inspectMove } from '../../core/go/rules';
import { calculateTerritory } from '../../core/go/scoring';
import { createInitialPosition, recordMove, type GamePosition, type PositionAccess } from '../game/positionState';
import type { Player, Point } from '../../types';
import type { Exercise, ExerciseAnswer, ExerciseGrade, ExerciseRefutation } from './exerciseTypes';
import { gradeSourceAction, replaySourceVariation } from './sourceExercise';

function play(position: GamePosition, point: Point) {
  const previous = position.history.at(-1);
  const move = inspectMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previous ? getBoardHash(previous.board) : null);
  return move.legal ? { move, position: recordMove(position, move.result.newBoard, point, move.result.captured, false) } : { move };
}
const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y;
const captures = (position: GamePosition, player: Player) => player === 'black' ? position.blackCaptures : position.whiteCaptures;

function refute(position: GamePosition, point: Point, refutations?: readonly ExerciseRefutation[]) {
  const refutation = refutations?.find(item => same(item.after, point));
  if (!refutation) return null;
  const reply = play(position, refutation.reply);
  return reply.position ? { nextPosition: reply.position, explanation: refutation.text } : null;
}

function gradeSequence(exercise: Extract<Exercise, { kind: 'sequence' }>, points: readonly Point[]): ExerciseGrade {
  let position = exercise.position;
  let choices = exercise.solution;
  let refutations = exercise.refutations;
  let explanation = exercise.prompt;
  for (let index = 0; index < points.length; index++) {
    const point = points[index];
    const played = play(position, point);
    if (!played.position) return { outcome: 'failure', explanation: '这手不合法，请回到刚才的局面检查气与劫。', nextPosition: position };
    position = played.position;
    const step = choices.find(item => same(item.point, point));
    if (!step) {
      const rebuttal = refute(position, point, refutations);
      return rebuttal ? { outcome: 'failure', ...rebuttal } : {
        outcome: 'unverified', nextPosition: position, explanation: '我们顺着这手继续看看，也可以退一步换个下法。',
      };
    }
    explanation = step.text ?? exercise.explanation;
    if (step.reply) {
      const reply = play(position, step.reply);
      if (!reply.position) return { outcome: 'unverified', explanation: '本题应手无法合法重放，请换一题。' };
      position = reply.position;
    }
    if (!step.next?.length) {
      const taken = captures(position, exercise.position.currentPlayer) - captures(exercise.position, exercise.position.currentPlayer);
      if (index !== points.length - 1 || taken < exercise.minimumCaptures) {
        return { outcome: 'unverified', explanation: '变化已结束，但提子目标或作答长度不符。', nextPosition: position };
      }
      return { outcome: 'success', explanation: `${explanation}这段变化共提掉 ${taken} 子。`, nextPosition: position };
    }
    choices = step.next;
    refutations = step.refutations;
  }
  return { outcome: 'continue', explanation, nextPosition: position };
}

/** A deliberately narrow proof: two separate one-point eyes bounded by this same uncut chain. */
function hasTwoIndependentEyes(position: GamePosition, anchor: Point, player: Player) {
  const group = getGroup(position.board, anchor);
  if (!group || group.stones[0].color !== player) return false;
  let eyes = 0;
  for (let y = 0; y < position.board.length; y++) for (let x = 0; x < position.board.length; x++) {
    if (position.board[y][x]) continue;
    const neighbors = getNeighbors({ x, y }, position.board.length);
    if (neighbors.every(point => group.stones.some(stone => same(stone, point)))
      && !inspectMove(position.board, x, y, player === 'black' ? 'white' : 'black').legal) eyes++;
  }
  return eyes >= 2;
}

/** Original authored setups, not copied game records. X black, O white, . empty. */
export function exercisePosition(rows: readonly string[], currentPlayer: Player = 'black'): GamePosition {
  if (rows.length < 2 || rows.length > 19 || rows.some(row => row.length !== rows.length || /[^.XO]/.test(row))) throw new Error('Invalid exercise board');
  const position = createInitialPosition(rows.length);
  position.currentPlayer = currentPlayer;
  position.board = rows.map((row, y) => [...row].map((cell, x) => cell === '.' ? null : {
    color: cell === 'X' ? 'black' : 'white', x, y, id: `exercise-${x}-${y}`,
  }));
  return position;
}

export function gradeExercise(exercise: Exercise, answer: ExerciseAnswer): ExerciseGrade {
  const result = (success: boolean): ExerciseGrade => ({ outcome: success ? 'success' : 'failure', explanation: exercise.explanation });
  if (exercise.kind !== answer.kind) return { outcome: 'unverified', explanation: '请按这道题要求的方式作答。' };
  if (exercise.kind === 'variation' && answer.kind === 'variation') return replaySourceVariation(exercise, answer.points).grade;
  if (exercise.kind === 'action' && answer.kind === 'action') return gradeSourceAction(exercise, answer.action, answer.points);
  if (exercise.kind === 'sequence' && answer.kind === 'sequence') return gradeSequence(exercise, answer.points);
  if (exercise.kind === 'choice' && answer.kind === 'choice') {
    if (!exercise.choices.some(choice => choice.id === answer.choiceId)) return { outcome: 'unverified', explanation: '这个选项不属于当前题目。' };
    return (exercise.correctChoiceIds ?? [exercise.correctChoiceId]).includes(answer.choiceId)
      ? result(true) : { outcome: 'failure', explanation: `${exercise.prompt}\n再观察一下棋盘，换个答案试试。` };
  }
  if (exercise.kind === 'number' && answer.kind === 'number') {
    if (exercise.rubric.kind === 'territory') {
      if (!Number.isInteger(answer.value) || answer.value < 0) return { outcome: 'unverified', explanation: '请输入非负整数。' };
      const count = calculateTerritory(exercise.position.board)[exercise.rubric.color].length;
      return { ...result(answer.value === count), explanation: `本题已确认活棋、没有死子；${exercise.rubric.color === 'black' ? '黑' : '白'}方围住 ${count} 个空点。${exercise.explanation}` };
    }
    const group = getGroup(exercise.position.board, exercise.rubric.anchor);
    if (!group || !Number.isInteger(answer.value) || answer.value < 0) return { outcome: 'unverified', explanation: '请填写非负整数；棋块必须存在。' };
    return { ...result(answer.value === group.liberties), explanation: `这块棋共有 ${group.liberties} 个不同的相邻空点。${exercise.explanation}` };
  }
  if (exercise.kind === 'point' && answer.kind === 'point') {
    const position = exercise.position;
    const previous = position.history.at(-1);
    const move = inspectMove(position.board, answer.point.x, answer.point.y, position.currentPlayer, 'Go', previous ? getBoardHash(previous.board) : null);
    if (!move.legal) return { outcome: 'failure', explanation: `${move.reason === 'occupied' ? '该点已有棋子，不能再落子' : move.reason === 'ko' ? '这里是劫，不能马上提回' : move.reason === 'suicide' ? '这手没有提走对方棋子，自己却没有气，不能下' : '落点不在棋盘内'}。请重试，换一个落点。` };
    const nextPosition = recordMove(position, move.result.newBoard, answer.point, move.result.captured, false);
    const rubric = exercise.rubric;
    let success = rubric.kind === 'legal';
    let observation = '这是一手合法落子。';
    if (rubric.kind === 'capture') {
      success = move.result.captured >= rubric.minimum;
      observation = `本手提掉 ${move.result.captured} 子，目标至少 ${rubric.minimum} 子。`;
    }
    if (rubric.kind === 'escape') {
      const group = getGroup(nextPosition.board, rubric.anchor);
      success = !!group && group.stones[0].color === position.currentPlayer && group.liberties >= rubric.minimumLiberties;
      observation = `原来的棋现在有 ${group?.liberties ?? 0} 气。`;
    }
    if (rubric.kind === 'connect') {
      const group = getGroup(nextPosition.board, rubric.anchors[0]);
      success = !!group && group.stones[0].color === position.currentPlayer
        && group.stones.some(stone => stone.x === rubric.anchors[1].x && stone.y === rubric.anchors[1].y);
      observation = success ? '目标棋子已连成同一块。' : '目标棋子还没有连成同一块。';
    }
    if (rubric.kind === 'atari') {
      const group = getGroup(nextPosition.board, rubric.anchor);
      success = !!group && group.stones[0].color !== position.currentPlayer && group.liberties === 1;
      observation = group ? `目标棋块还剩 ${group.liberties} 气。` : '目标棋块已离盘；本题要练习先打吃。';
    }
    if (rubric.kind === 'cut') {
      const groups = rubric.anchors.map(anchor => getGroup(position.board, anchor));
      const afterGroups = rubric.anchors.map(anchor => getGroup(nextPosition.board, anchor));
      success = groups.every(group => group && group.stones[0].color !== position.currentPlayer
        && group.stones.some(stone => getNeighbors(stone, position.board.length).some(point => same(point, answer.point))))
        && !groups[0]?.stones.some(stone => same(stone, rubric.anchors[1]))
        && afterGroups.every(group => group && group.stones[0].color !== position.currentPlayer);
      observation = success ? '你占住了两块白棋共同的直接连接点。' : '这手没有占住两块白棋共同的连接点。';
    }
    if (rubric.kind === 'two-eyes') {
      success = hasTwoIndependentEyes(nextPosition, rubric.anchor, position.currentPlayer);
      observation = success ? '同一完整棋块围出了两处独立的小眼；对方填任意一眼都不合法。' : '这手还没有让目标棋块围出两处独立的小眼。';
    }
    const rebuttal = !success ? refute(nextPosition, answer.point, exercise.refutations) : null;
    if (rebuttal) return { outcome: 'failure', ...rebuttal };
    return { outcome: success ? 'success' : 'failure', explanation: `${observation}${success ? exercise.explanation : exercise.hints[0]}`, nextPosition };
  }
  return { outcome: 'unverified', explanation: '这份答案暂时不能判定。' };
}

/** Submit into a practice-owned position only; the caller supplies its isolated access. */
export function applyExerciseGrade(access: PositionAccess, exercise: Exercise, grade: ExerciseGrade): boolean {
  if (!grade.nextPosition || access.readPosition() !== exercise.position) return false;
  access.writePosition(grade.nextPosition);
  return true;
}

import { getBoardHash } from '../../core/board';
import { getDefaultKomi } from '../../core/go/config';
import { inspectMove } from '../../core/go/rules';
import { calculateScore, calculateTerritory } from '../../core/go/scoring';
import { recordMove, recordPass, type GamePosition } from '../game/positionState';
import { createTutorialPosition, tutorialTarget, type TutorialPuzzleType } from './beginnerPositions';
import type { Point } from '../../types';

export interface TutorialSession {
  position: GamePosition;
  puzzleType: TutorialPuzzleType;
  showQiOverride: boolean;
  isCompleted: boolean;
  feedback: string | null;
  territory: ReturnType<typeof calculateTerritory> | null;
}
export interface TutorialAction { session: TutorialSession; vibration?: number | number[] }

export function createTutorialSession(type: TutorialPuzzleType, size: number): TutorialSession {
  return { position: createTutorialPosition(type, size), puzzleType: type,
    showQiOverride: ['qi', 'connection'].includes(type),
    isCompleted: ['qi', 'connection', 'zoom', 'explore'].includes(type), feedback: null, territory: null };
}

function inspect(position: GamePosition, point: Point) {
  const previous = position.history.at(-1)?.board;
  return inspectMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previous ? getBoardHash(previous) : null);
}

const successCopy: Partial<Record<TutorialPuzzleType, string>> = {
  capture: '白子的最后一口气没了，被提走了。空出来的交叉点可以重新落子。',
  eyes: '同一块黑棋围出了上下两只独立的眼。白棋填哪一眼都提不走黑棋，自己又没气，不能下；这块黑棋活了。',
};

export function playTutorialPoint(session: TutorialSession, point: Point): TutorialAction {
  if (session.isCompleted) return { session };
  const type = session.puzzleType;
  const target = tutorialTarget(type, session.position);
  if (!target) return { session };
  if (point.x !== target.x || point.y !== target.y) {
    return { session: { ...session, feedback: '点发光的圆圈，看看棋块和气有什么变化。' }, vibration: 50 };
  }
  const move = inspect(session.position, point);
  if (!move.legal) {
    const expected = type === 'forbidden' && move.reason === 'suicide' || type === 'ko' && move.reason === 'ko';
    return { session: { ...session, isCompleted: expected,
      feedback: move.reason === 'ko'
        ? '白棋立即回提会还原黑棋提子前的棋盘，劫规则不允许。棋盘不变，仍轮白棋，要先在别处下一手。'
        : move.reason === 'suicide'
          ? '黑棋下这里提不走白棋，自己又没气，是禁入点。棋盘不变。'
          : '这里已有棋子，不能再下。' }, vibration: expected ? 200 : 50 };
  }
  let position = recordMove(session.position, move.result.newBoard, point, move.result.captured, false);
  if (type === 'ko') {
    return { session: { ...session, position,
      feedback: '黑棋提走了 1 颗白子。轮到白棋，点刚空出的发光处，试试立即提回来。' }, vibration: [20, 30, 20] };
  }
  if (type === 'final_shape' && session.position.history.length === 0) {
    const replyPoint = { x: 6, y: 6 };
    const reply = inspect(position, replyPoint);
    if (!reply.legal) throw new Error('Invalid beginner opening reply');
    position = recordMove(position, reply.result.newBoard, replyPoint, reply.result.captured, false);
    return { session: { ...session, position,
      feedback: '黑棋占了左上角，白棋在右下角应手。\n再下发光处：横着隔一路、竖着错一路，叫“小飞”。' } };
  }
  const feedback = type === 'final_shape'
    ? '两颗黑棋用“小飞”配合守住左上角，但还没连成一块，要留意断点。'
    : successCopy[type] ?? '完成了。';
  return { session: { ...session, position, feedback, isCompleted: true }, vibration: [20, 30, 20] };
}

export function passTutorialTurn(session: TutorialSession): TutorialAction {
  if (session.puzzleType !== 'endgame' || session.isCompleted) return { session };
  const position = recordPass(recordPass(session.position));
  return { session: { ...session, position, isCompleted: true,
    feedback: '你停了一手，白棋也停了一手，连续两次停着，进入终局。\n先确认死子，再数地。这张图双方都是活棋，没有死子。' }, vibration: 20 };
}

export function countTutorialTerritory(session: TutorialSession): TutorialAction {
  if (session.puzzleType !== 'territory') return { session };
  const territory = calculateTerritory(session.position.board);
  const komi = getDefaultKomi(session.position.board.length);
  const score = calculateScore(session.position.board, null, komi,
    { black: session.position.blackCaptures, white: session.position.whiteCaptures });
  const diff = score.black - score.white;
  const result = diff === 0 ? '双方平局' : `${diff > 0 ? '黑' : '白'}胜 ${Math.abs(diff)} 目`;
  return { session: { ...session, territory, isCompleted: true,
    feedback: `- 黑棋围住 ${territory.black.length} 个空点，白棋围住 ${territory.white.length} 个空点。\n- 双方提子都是 0，白贴 ${komi} 目。\n合计：黑 ${score.black} 目，白 ${score.white} 目，${result}。` }, vibration: 20 };
}

export function getTutorialHighlight(session: TutorialSession) {
  if (session.isCompleted) return null;
  const target = tutorialTarget(session.puzzleType, session.position);
  return target ? { ...target, color: '#795548' } : null;
}

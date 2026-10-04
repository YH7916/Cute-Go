import { getBoardHash, getGroup } from '../../core/board';
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
    showQiOverride: ['qi', 'connection', 'atari_escape', 'capture_group'].includes(type),
    isCompleted: ['qi', 'connection', 'zoom', 'explore'].includes(type), feedback: null, territory: null };
}

function inspect(position: GamePosition, point: Point) {
  const previous = position.history.at(-1)?.board;
  return inspectMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previous ? getBoardHash(previous) : null);
}

const successCopy: Partial<Record<TutorialPuzzleType, string>> = {
  capture: '最后一口气被占住，白子就被提走了。棋盘上空出的交叉点又可以使用。',
  connect_cut: '两边黑棋通过这一手连成了一块，共享所有的气。刚才的空点就是断点：若先被白棋占住，两边就连不上了。',
  eyes: '上、下两只眼彼此独立，由同一块黑棋围住。白棋填任何一眼都提不走黑棋，自己又没有气，因此黑棋活了。',
};

export function playTutorialPoint(session: TutorialSession, point: Point): TutorialAction {
  if (session.isCompleted) return { session };
  const type = session.puzzleType;
  const target = tutorialTarget(type, session.position);
  if (!target) return { session };
  if (point.x !== target.x || point.y !== target.y) {
    return { session: { ...session, feedback: '请点击发光的圆圈，观察这一手前后棋块与气的变化。' }, vibration: 50 };
  }
  const move = inspect(session.position, point);
  if (!move.legal) {
    const expected = type === 'forbidden' && move.reason === 'suicide' || type === 'ko' && move.reason === 'ko';
    return { session: { ...session, isCompleted: expected,
      feedback: move.reason === 'ko'
        ? '白棋立即回提会还原上一手之前的棋盘，所以这手被劫规则禁止。棋盘不变，仍轮白棋；先到别处下一手。'
        : move.reason === 'suicide'
          ? '黑棋下在这里提不走白棋，自己又没有气，所以是禁入点。棋盘不变。'
          : '这个点已有棋子，不能重复落子。' }, vibration: expected ? 200 : 50 };
  }
  let position = recordMove(session.position, move.result.newBoard, point, move.result.captured, false);
  if (type === 'ko') {
    return { session: { ...session, position,
      feedback: '黑棋提走了 1 颗白子。现在轮白棋：点击刚空出的高亮点，试试立即提回来。' }, vibration: [20, 30, 20] };
  }
  if (type === 'final_shape' && session.position.history.length === 0) {
    const replyPoint = { x: 6, y: 6 };
    const reply = inspect(position, replyPoint);
    if (!reply.legal) throw new Error('Invalid beginner opening reply');
    position = recordMove(position, reply.result.newBoard, replyPoint, reply.result.captured, false);
    return { session: { ...session, position,
      feedback: '黑棋占住左上角，白棋在右下角应了一手。现在再下高亮处：横着隔一路、竖着错一路，就是“小飞”。' } };
  }
  const feedback = type === 'atari_escape'
    ? `接长后，这块黑棋有了 ${getGroup(position.board, point)?.liberties ?? 0} 口气，脱离了打吃。被打吃时，先找能增加气的出口。`
    : type === 'capture_group' ? `这一手同时提走 ${move.result.captured} 颗白子。相连的棋共享气，最后一气没了，就会整块被提走。`
      : type === 'final_shape' ? '两颗黑棋组成了“小飞”，配合守住左上角。斜着配合并不等于已经连成一块，之后仍要留意断点。'
        : successCopy[type] ?? '完成了。';
  return { session: { ...session, position, feedback, isCompleted: true }, vibration: [20, 30, 20] };
}

export function passTutorialTurn(session: TutorialSession): TutorialAction {
  if (session.puzzleType !== 'endgame' || session.isCompleted) return { session };
  const position = recordPass(recordPass(session.position));
  return { session: { ...session, position, isCompleted: true,
    feedback: '你停了一手，白棋也停了一手。连续两次停着后进入终局：先确认死子，再数地。这张示意图双方都已活棋，没有死子。' }, vibration: 20 };
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
    feedback: `黑棋围住 ${territory.black.length} 个空点，白棋围住 ${territory.white.length} 个空点。本图双方提子均为 0，白贴 ${komi} 目后：黑 ${score.black} 目，白 ${score.white} 目，${result}。` }, vibration: 20 };
}

export function getTutorialHighlight(session: TutorialSession) {
  if (session.isCompleted) return null;
  const target = tutorialTarget(session.puzzleType, session.position);
  return target ? { ...target, color: '#795548' } : null;
}

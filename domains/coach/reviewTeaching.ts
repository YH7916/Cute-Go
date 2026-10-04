import { getDefaultKomi } from '../../core/go/config';
import { selectReviewPosition } from '../game/reviewPosition';
import type { GamePosition } from '../game/positionState';
import { buildCoachEvidence, getCoachLastAction } from './evidence';
import { gradeExercise } from './exercise';
import type { Exercise } from './exerciseTypes';

export interface ReviewMoment { cursor: number; title: string; detail: string }

/** Teaching events describe observed rules, not engine-ranked mistakes. */
export function collectReviewMoments(game: GamePosition): ReviewMoment[] {
  const moments: ReviewMoment[] = [];
  for (let cursor = Math.max(1, game.history.length - 239); cursor <= game.history.length; cursor += 1) {
    const position = selectReviewPosition(game, cursor);
    const action = getCoachLastAction(position);
    if (action.kind !== 'move') continue;
    const threatened = action.effects.pressuredGroups.some(group => group.libertiesBefore > 1 && group.libertiesAfter === 1);
    if (action.libertiesAfter === 1 && action.effects.previousLiberties !== 1) {
      moments.push({ cursor, title: `第 ${cursor} 手：检查一口气的棋`, detail: '这手落下后，所在棋块只剩一口气。可以退一手比较其他落点。' });
    } else if (threatened) {
      moments.push({ cursor, title: `第 ${cursor} 手：应对打吃`, detail: '一块棋刚被压到一口气。先观察接长、连接和提子解围。' });
    } else if (action.captured.length) {
      moments.push({ cursor: cursor - 1, title: `第 ${cursor} 手：重新找提子`, detail: `原谱这一手提掉 ${action.captured.length} 颗棋。退回落子前自己试一次。` });
    }
  }
  return moments.slice(-8).reverse();
}

/** Only rule-checkable one-move objectives become graded personal exercises. */
export function createReviewExercise(position: GamePosition, id: string): Exercise | null {
  if (position.consecutivePasses >= 2) return null;
  const evidence = buildCoachEvidence(position, position.currentPlayer, getDefaultKomi(position.board.length));
  const base = { id, familyId: `personal:${id}`, contentRevision: 'rules-v1', position,
    hints: ['先找只有一口气的棋块，分清哪方轮到落子。', '逐个检查连接、接长和提子后的气；不需要猜最佳走法。'] as const };
  for (const group of evidence.atariGroups.filter(item => item.color === position.currentPlayer)) {
    const anchor = group.stones[0];
    const exercise: Exercise = { ...base, kind: 'point', skillId: 'go.tactics.escape-atari',
      prompt: `轮到${position.currentPlayer === 'black' ? '黑' : '白'}棋：下一手让 ${anchor.label} 所在棋块至少有两口气。`,
      rubric: { kind: 'escape', anchor, minimumLiberties: 2 },
      explanation: '这一题只检查下一手是否解除一口气；两口气不代表此后一定安全或已经做活。' };
    if (evidence.candidates.some(candidate => gradeExercise(exercise, { kind: 'point', point: candidate.point }).outcome === 'success')) return exercise;
  }
  if (evidence.candidates.some(candidate => candidate.capturedStones > 0)) {
    return { ...base, kind: 'point', skillId: 'go.rules.capture', prompt: '下一手至少提掉一颗对方棋子。',
      rubric: { kind: 'capture', minimum: 1 }, explanation: '堵住对方最后一口气就能提子；这道题只判断立即提子，不判断全局最佳手。' };
  }
  return null;
}

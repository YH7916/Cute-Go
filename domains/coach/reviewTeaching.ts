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
      moments.push({ cursor, title: `第 ${cursor} 手：检查一口气的棋`, detail: '这手落下后，新子所在的棋块只剩一口气。可以退一手比较其他落点。' });
    } else if (threatened) {
      moments.push({ cursor, title: `第 ${cursor} 手：应对打吃`, detail: '一块棋刚被打吃，只剩一口气。看看能否接长、连接或提子解围。' });
    } else if (action.captured.length) {
      moments.push({ cursor: cursor - 1, title: `第 ${cursor} 手：重新找提子`, detail: `原谱这手提走了${action.captured.length}颗棋。回到落子前，自己试一次。` });
    }
  }
  return moments.slice(-8).reverse();
}

/** Only rule-checkable one-move objectives become graded personal exercises. */
export function createReviewExercise(position: GamePosition, id: string): Exercise | null {
  if (position.consecutivePasses >= 2) return null;
  const evidence = buildCoachEvidence(position, position.currentPlayer, getDefaultKomi(position.board.length));
  const base = { id, familyId: `personal:${id}`, contentRevision: 'rules-v1', position,
    hints: ['先看轮到谁下，再找只有一口气的棋块。', '分别看看连接、接长或提子后有几口气。这里不要求找最佳走法。'] as const };
  for (const group of evidence.atariGroups.filter(item => item.color === position.currentPlayer)) {
    const anchor = group.stones[0];
    const exercise: Exercise = { ...base, kind: 'point', skillId: 'go.tactics.escape-atari',
      prompt: `轮到${position.currentPlayer === 'black' ? '黑' : '白'}棋。下一手让 ${anchor.label} 这块棋至少有两口气。`,
      rubric: { kind: 'escape', anchor, minimumLiberties: 2 },
      explanation: '这题只检查下一手是否解除打吃。两口气不代表以后一定安全，也不代表已经做活。' };
    if (evidence.candidates.some(candidate => gradeExercise(exercise, { kind: 'point', point: candidate.point }).outcome === 'success')) return exercise;
  }
  if (evidence.candidates.some(candidate => candidate.capturedStones > 0)) {
    return { ...base, kind: 'point', skillId: 'go.rules.capture', prompt: '下一手至少提走一颗对方棋子。',
      rubric: { kind: 'capture', minimum: 1 }, explanation: '合法占住对方最后一口气就能提子。这题只检查这一手能否提子，不判断全局最佳手。' };
  }
  return null;
}

import { getBoardHash } from '../../core/board';
import { inspectMove } from '../../core/go/rules';
import type { Point } from '../../types';
import type { GamePosition } from '../game/positionState';
import { getLocalCoachMessage, labelCoachPoint, type CoachEvidence, type CoachPoint } from './evidence';

export function explainRejectedMove(position: GamePosition, attemptedPoint?: Point): { text: string; hintPoints: CoachPoint[] } {
  if (!attemptedPoint) return { text: '点一个交叉点，我帮你看能不能下。', hintPoints: [] };
  const previous = position.history[position.history.length - 1];
  const result = inspectMove(position.board, attemptedPoint.x, attemptedPoint.y, position.currentPlayer, 'Go',
    previous ? getBoardHash(previous.board) : null);
  if (result.legal) return { text: '这里符合落子规则，等到自己的回合就可以下。', hintPoints: [] };
  if (result.reason === 'out-of-bounds') return { text: '请点棋盘内横线和竖线的交叉点。', hintPoints: [] };
  if (result.reason === 'occupied') return { text: '这里已有棋子，不能叠放。换个空的交叉点。', hintPoints: [] };
  return {
    text: result.reason === 'suicide'
      ? '在这里落子后，整块棋没有气，也吃不到对方的棋来腾出气。按禁入点规则，这里不能下。'
      : '在这里马上提回，会让棋盘回到上一手之前，劫规则不允许这样下。先在别处下一手，等对方回应后再看。',
    hintPoints: [labelCoachPoint(attemptedPoint, position.board.length)],
  };
}

export function explainPosition(evidence: CoachEvidence, estimatedBlackLead?: number): string {
  const ownDanger = evidence.atariGroups.find(group => group.color === evidence.userColor);
  const otherDanger = evidence.atariGroups.find(group => group.color !== evidence.userColor);
  const danger = ownDanger ?? otherDanger;
  if (danger) {
    const next = ownDanger ? '先看能否接长或吃子解围。' : '先检查能否合法占住这口气提子。';
    return `${ownDanger ? '你' : '对手'}在 ${danger.stones[0].label} 的棋只剩一口气（${danger.liberties[0].label}）。${next}`;
  }
  const action = evidence.lastAction;
  if (action.kind === 'pass' || (action.kind === 'move'
    && (action.captured.length > 0 || action.effects.savedStones > 0 || action.effects.connectedGroups > 1))) {
    return getLocalCoachMessage(evidence, 'explain-last-move');
  }
  // Sparse positions contain too little settled territory for a useful lead lesson.
  if (evidence.stones.length < evidence.boardSize) return '刚开局，可以从空旷的角边发展，让自己的棋互相照应。';
  if (estimatedBlackLead === undefined || !Number.isFinite(estimatedBlackLead)) {
    return '比较双方围住了哪些空点，再找还能扩大的地方。';
  }
  if (Math.abs(estimatedBlackLead) < 2) return '粗看双方接近。比较各自围住的空点，找还能扩大的地方。';
  const ahead = estimatedBlackLead > 0 ? 'black' : 'white';
  return `粗看${ahead === 'black' ? '黑棋' : '白棋'}（${ahead === evidence.userColor ? '你' : '对手'}）稍占先。看看哪里还能围空。`;
}

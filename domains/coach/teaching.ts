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
  if (result.reason === 'out-of-bounds') return { text: '点偏啦，要落在棋盘内横线和竖线的交叉点上。', hintPoints: [] };
  if (result.reason === 'occupied') return { text: '这里已有棋子，不能叠放；换个空的交叉点。', hintPoints: [] };
  return {
    text: result.reason === 'suicide'
      ? '在圈出的这里落子后，整块棋没有气，也吃不到对方来腾出气，所以不能下；能先提子获得气时才例外。'
      : '在圈出的这里马上提回，会让棋盘回到上一手之前，这叫“劫”；先在别处下一手，等对方回应后再看。',
    hintPoints: [labelCoachPoint(attemptedPoint, position.board.length)],
  };
}

export function explainPosition(evidence: CoachEvidence, estimatedBlackLead?: number): string {
  const ownDanger = evidence.atariGroups.find(group => group.color === evidence.userColor);
  const otherDanger = evidence.atariGroups.find(group => group.color !== evidence.userColor);
  const danger = ownDanger ?? otherDanger;
  if (danger) {
    const next = ownDanger ? '先看能否连接或逃出，再比围空。' : '先检查能否合法提子，再比围空；打吃不等于一定能吃到。';
    return `${ownDanger ? '你' : '对手'}有一块棋只剩一口气：${danger.stones[0].label} 这块的出口在 ${danger.liberties[0].label}；${next}`;
  }
  const action = evidence.lastAction;
  if (action.kind === 'pass' || (action.kind === 'move'
    && (action.captured.length > 0 || action.effects.savedStones > 0 || action.effects.connectedGroups > 1))) {
    return getLocalCoachMessage(evidence, 'explain-last-move');
  }
  // Sparse positions contain too little settled territory for a useful lead lesson.
  if (evidence.stones.length < evidence.boardSize) return '刚开局，地还没围实。先让自己的棋互相照应，留出向外发展的空间。';
  if (estimatedBlackLead === undefined || !Number.isFinite(estimatedBlackLead)) {
    return '先照顾容易被吃的弱棋，再比较双方围住的空点；地没围实，先不急着判胜负。';
  }
  if (Math.abs(estimatedBlackLead) < 2) return '粗看双方还接近；先照顾弱棋，再看谁围住的空点更多，局势还会变。';
  const ahead = estimatedBlackLead > 0 ? 'black' : 'white';
  return `粗看${ahead === 'black' ? '黑棋' : '白棋'}（${ahead === evidence.userColor ? '你' : '对手'}）稍占先；先照顾弱棋，再比较双方围空，局势还会变。`;
}

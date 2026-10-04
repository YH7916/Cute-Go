import { getAllGroups, getBoardHash, getGroup } from '../../core/board';
import { attemptMove } from '../../core/go/rules';
import type { BoardState, Player, Point } from '../../types';
import type { GamePosition } from '../game/positionState';

export type CoachIntent = 'explain-last-move' | 'hint' | 'explain-position' | 'explain-illegal-move';
export interface CoachPoint extends Point { label: string }
export interface CoachGroup {
  color: Player;
  stones: CoachPoint[];
  liberties: CoachPoint[];
}
export interface CoachCandidate {
  point: CoachPoint;
  reasons: ('escape-atari' | 'capture')[];
  capturedStones: number;
  savedStones: number;
  libertiesAfter: number;
}
export interface CoachMoveEffects {
  connectedGroups: number;
  savedStones: number;
  previousLiberties: number | null;
  pressuredGroups: { point: CoachPoint; libertiesBefore: number; libertiesAfter: number }[];
}
export type CoachLastAction =
  | { kind: 'none' }
  | { kind: 'unverified' }
  | { kind: 'pass'; color: Player; globalMoveNumber: number }
  | { kind: 'move'; color: Player; globalMoveNumber: number; point: CoachPoint; location: string;
      captured: CoachPoint[]; libertiesAfter: number; effects: CoachMoveEffects };
export interface CoachEvidence {
  positionKey: string;
  boardSize: number;
  toPlay: Player;
  userColor: Player;
  komi: number;
  moveNumber: number;
  moveNumberMeaning: string;
  coordinateSystem: string;
  stones: { color: Player; point: CoachPoint }[];
  captures: { black: number; white: number };
  lastAction: CoachLastAction;
  groups: CoachGroup[];
  atariGroups: CoachGroup[];
  candidates: CoachCandidate[];
  limits: string[];
}

const columns = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
const opposite = (color: Player): Player => color === 'black' ? 'white' : 'black';
const pointTuple = (point: Point | null) => point ? [point.x, point.y] : null;
export const labelCoachPoint = (point: Point, size: number): CoachPoint => ({
  x: point.x, y: point.y, label: `${columns[point.x]}${size - point.y}`,
});

function describeLocation(point: Point, size: number): string {
  const middle = (size - 1) / 2;
  const horizontalEdge = point.x === 0 ? '左' : point.x === size - 1 ? '右' : null;
  const verticalEdge = point.y === 0 ? '上' : point.y === size - 1 ? '下' : null;
  let area = '棋盘内部';
  if (horizontalEdge && verticalEdge) area = `${horizontalEdge}${verticalEdge}角`;
  else if (horizontalEdge) area = `${horizontalEdge}边线${point.y === middle ? '正中' : point.y < middle ? '上半部' : '下半部'}`;
  else if (verticalEdge) area = `${verticalEdge}边线${point.x === middle ? '正中' : point.x < middle ? '左半部' : '右半部'}`;
  else if (point.x === middle && point.y === middle) area = '棋盘正中心';
  return `${area}（左起第 ${point.x + 1} 列，上起第 ${point.y + 1} 行）`;
}

// Semantic identity includes undo history, simple-ko predecessor, captures and pass state.
// Identical games after reset additionally need the owning hook's session generation.
export function coachPositionKey(position: GamePosition, userColor: Player, komi: number): string {
  return JSON.stringify([
    position.board.length, getBoardHash(position.board), position.currentPlayer,
    position.blackCaptures, position.whiteCaptures, pointTuple(position.lastMove),
    position.consecutivePasses, userColor, komi,
    position.history.map(item => [
      item.board.length, getBoardHash(item.board), item.currentPlayer,
      item.blackCaptures, item.whiteCaptures, pointTuple(item.lastMove),
      pointTuple(item.move), item.consecutivePasses,
    ]),
  ]);
}

function previousHash(position: GamePosition): string | null {
  const previous = position.history[position.history.length - 1];
  return previous ? getBoardHash(previous.board) : null;
}

// Compare real groups only after lastAction has verified the complete transition.
function moveEffects(before: BoardState, after: BoardState, point: Point, color: Player): CoachMoveEffects {
  const groups = getAllGroups(before);
  const moved = getGroup(after, point);
  const joinedStones = new Set(moved?.stones.map(stone => stone.y * after.length + stone.x));
  const own = groups.filter(group => group.stones[0].color === color);
  const joined = own.filter(group => joinedStones.has(group.stones[0].y * after.length + group.stones[0].x));
  const savedStones = own.filter(group => group.liberties === 1
    && (getGroup(after, group.stones[0])?.liberties ?? 0) > 1)
    .reduce((count, group) => count + group.stones.length, 0);
  const pressuredGroups: CoachMoveEffects['pressuredGroups'] = [];
  for (const group of groups) {
    if (group.stones[0].color === color || !group.libertyPoints.some(liberty => liberty.x === point.x && liberty.y === point.y)) continue;
    const remaining = getGroup(after, group.stones[0]);
    if (remaining) pressuredGroups.push({ point: labelCoachPoint(group.stones[0], after.length),
      libertiesBefore: group.liberties, libertiesAfter: remaining.liberties });
  }
  return { connectedGroups: joined.length, savedStones,
    previousLiberties: joined.length === 1 ? joined[0].liberties : null, pressuredGroups };
}

export function getCoachLastAction(position: GamePosition): CoachLastAction {
  const before = position.history[position.history.length - 1];
  if (!before) return { kind: 'none' };
  const color = before.currentPlayer;
  const globalMoveNumber = position.history.length;
  if (!before.move) {
    const passes = before.consecutivePasses + 1;
    const expectedPlayer = passes >= 2 ? color : opposite(color);
    const expectedLastMove = passes >= 2 ? before.lastMove : null;
    return getBoardHash(before.board) === getBoardHash(position.board)
      && before.board.length === position.board.length
      && before.blackCaptures === position.blackCaptures && before.whiteCaptures === position.whiteCaptures
      && position.consecutivePasses === passes && position.currentPlayer === expectedPlayer
      && JSON.stringify(pointTuple(position.lastMove)) === JSON.stringify(pointTuple(expectedLastMove))
      ? { kind: 'pass', color, globalMoveNumber } : { kind: 'unverified' };
  }
  const prior = position.history[position.history.length - 2];
  const result = attemptMove(before.board, before.move.x, before.move.y, color, 'Go', prior ? getBoardHash(prior.board) : null);
  if (!result || before.board.length !== position.board.length
    || getBoardHash(result.newBoard) !== getBoardHash(position.board)
    || position.currentPlayer !== opposite(color) || position.consecutivePasses !== 0
    || position.lastMove?.x !== before.move.x || position.lastMove?.y !== before.move.y
    || position.blackCaptures !== before.blackCaptures + (color === 'black' ? result.captured : 0)
    || position.whiteCaptures !== before.whiteCaptures + (color === 'white' ? result.captured : 0)) {
    return { kind: 'unverified' };
  }
  const captured: CoachPoint[] = [];
  before.board.forEach((row, y) => row.forEach((stone, x) => {
    if (stone?.color === opposite(color) && position.board[y][x] === null) captured.push(labelCoachPoint({ x, y }, position.board.length));
  }));
  return {
    kind: 'move', color, globalMoveNumber, point: labelCoachPoint(before.move, position.board.length), captured,
    location: describeLocation(before.move, position.board.length),
    libertiesAfter: getGroup(position.board, before.move)?.liberties ?? 0,
    effects: moveEffects(before.board, position.board, before.move, color),
  };
}

function boardGroups(board: BoardState): CoachGroup[] {
  return getAllGroups(board).map(group => ({
    color: group.stones[0].color,
    stones: group.stones.map(stone => labelCoachPoint(stone, board.length)),
    liberties: group.libertyPoints.map(point => labelCoachPoint(point, board.length)),
  }));
}

function candidates(position: GamePosition, groups: CoachGroup[]): CoachCandidate[] {
  const points = new Map<string, CoachPoint>();
  for (const group of groups) for (const point of group.liberties) points.set(`${point.x},${point.y}`, point);
  const ownGroups = groups.filter(group => group.color === position.currentPlayer);
  const result: CoachCandidate[] = [];
  for (const point of points.values()) {
    const moved = attemptMove(position.board, point.x, point.y, position.currentPlayer, 'Go', previousHash(position));
    if (!moved) continue;
    const saved = ownGroups.filter(group => group.stones.every(stone => moved.newBoard[stone.y][stone.x]?.color === group.color)
      && (getGroup(moved.newBoard, group.stones[0])?.liberties ?? 0) > 1);
    const reasons: CoachCandidate['reasons'] = [];
    if (saved.length) reasons.push('escape-atari');
    if (moved.captured) reasons.push('capture');
    if (!reasons.length) continue;
    result.push({ point: { ...point }, reasons, capturedStones: moved.captured,
      savedStones: saved.reduce((count, group) => count + group.stones.length, 0),
      libertiesAfter: getGroup(moved.newBoard, point)?.liberties ?? 0 });
  }
  // Put verified escapes first; this is a teaching order, not a strength evaluation.
  return result.sort((a, b) => b.savedStones - a.savedStones || b.capturedStones - a.capturedStones
    || a.point.y - b.point.y || a.point.x - b.point.x).slice(0, 3);
}

export function buildCoachEvidence(position: GamePosition, userColor: Player, komi: number): CoachEvidence {
  const groups = boardGroups(position.board);
  const atari = groups.filter(group => group.liberties.length === 1);
  const stones: CoachEvidence['stones'] = [];
  position.board.forEach((row, y) => row.forEach((stone, x) => {
    if (stone) stones.push({ color: stone.color, point: labelCoachPoint({ x, y }, position.board.length) });
  }));
  return {
    positionKey: coachPositionKey(position, userColor, komi), boardSize: position.board.length,
    toPlay: position.currentPlayer, userColor, komi, moveNumber: position.history.length,
    moveNumberMeaning: '当前棋谱记录的全局手数：黑白双方落子与停着合计，摆放初始棋子不计；不是某一方的落子次数。',
    coordinateSystem: 'x/y 从左上角以 0 开始；棋盘字母列从左到右，跳过 I；数字行从下到上以 1 开始。黑白视角均不翻转坐标。',
    stones, captures: { black: position.blackCaptures, white: position.whiteCaptures },
    lastAction: getCoachLastAction(position), groups, atariGroups: atari, candidates: candidates(position, atari),
    limits: ['只验证当前规则和一手变化；候选不是最佳手。', '规则证据不包含引擎目损、胜负预测、后续死活或形势优劣判断。',
      '只有 kind=move 的 lastAction.captured 是通过历史重放确认的上一手提子。'],
  };
}

const colorName = (color: Player) => color === 'black' ? '黑棋' : '白棋';

export function shouldExplainCoachPosition(evidence: CoachEvidence): boolean {
  const action = evidence.lastAction;
  return action.kind === 'move' && ((action.libertiesAfter === 1 && action.effects.previousLiberties !== 1)
    || action.effects.pressuredGroups.some(group => group.libertiesBefore > 1 && group.libertiesAfter === 1));
}

function explainMove(evidence: CoachEvidence, action: Extract<CoachLastAction, { kind: 'move' }>): string {
  const name = colorName(action.color);
  const otherColor = opposite(action.color);
  const effects = action.effects;
  const atari = effects.pressuredGroups.find(group => group.libertiesBefore > 1 && group.libertiesAfter === 1);
  // A newly threatened learner must not be distracted by a simultaneous capture.
  if (atari && (otherColor === evidence.userColor || action.libertiesAfter !== 1)) {
    const group = evidence.atariGroups.find(item => item.color === otherColor
      && item.stones.some(stone => stone.x === atari.point.x && stone.y === atari.point.y));
    const liberty = group?.liberties[0]?.label;
    const danger = `（${atari.point.label}）被打吃了，只剩一口气${liberty ? `（${liberty}）` : ''}。`;
    return otherColor === evidence.userColor
      ? `你的棋${danger}先看能否接长或吃子解围。`
      : `对手的棋${danger}观察它能否接长，打吃还不等于吃到。`;
  }
  if (action.libertiesAfter === 1) {
    const group = evidence.atariGroups.find(item => item.color === action.color
      && item.stones.some(stone => stone.x === action.point.x && stone.y === action.point.y));
    const warning = `红点这块${name}只剩一口气${group ? `（${group.liberties[0].label}）` : ''}`;
    return action.color === evidence.userColor
      ? `${warning}。对手下一手若能合法占住，就会提走你的棋。`
      : `${warning}。这是对手的棋，先检查能否合法吃掉。`;
  }
  if (action.captured.length) return `这手占住了 ${action.captured[0].label} 那块棋的最后一口气，所以能整块提走。`;
  if (effects.savedStones) return `这手多出了出口，红点这块现在有${action.libertiesAfter}口气，暂时解了打吃；不等于已经做活。`;
  if (effects.connectedGroups > 1) return `${effects.connectedGroups}块棋连成一块，共用${action.libertiesAfter}口气；重复的空点只算一次，不能把原来的气数直接相加。`;
  if (effects.previousLiberties !== null && action.libertiesAfter < effects.previousLiberties) {
    return `这手填了自己的气，整块棋的出口少了（${effects.previousLiberties}→${action.libertiesAfter}口）；新棋子没有补回足够的出口。`;
  }
  const pressure = effects.pressuredGroups.find(group => group.libertiesAfter < group.libertiesBefore);
  if (pressure) return `${otherColor === evidence.userColor ? '你的' : '对手的'} ${pressure.point.label} 那块气变少了（${pressure.libertiesBefore}→${pressure.libertiesAfter}口），但不等于能吃到；还要看它从哪里接出新出口。`;
  if (effects.connectedGroups) return `接长后，红点这块一共有${action.libertiesAfter}口气；要数整块棋旁的空点，重复的只算一次。`;
  const edge = action.point.x === 0 || action.point.y === 0 || action.point.x === evidence.boardSize - 1 || action.point.y === evidence.boardSize - 1;
  if (edge) return `红点这颗棋有${action.libertiesAfter}口气：边线外没有气，要给它留着向棋盘内接出的出口。`;
  const diagonal = evidence.stones.find(stone => stone.color === action.color
    && Math.abs(stone.point.x - action.point.x) === 1 && Math.abs(stone.point.y - action.point.y) === 1);
  return diagonal ? `红点和 ${diagonal.point.label} 斜对角挨着，不算连接；只有上下左右连在一起，才会共用气。`
    : '这手没有直接的吃子或打吃，可以继续下。';
}

export function getLocalCoachMessage(evidence: CoachEvidence, intent: CoachIntent): string {
  if (intent === 'explain-last-move') {
    const action = evidence.lastAction;
    if (action.kind === 'none') return '还没有上一手；点“提示”，看看从哪里开始。';
    if (action.kind === 'unverified') return '记录对不上这盘棋，暂时讲不了上一手；点选棋子可以看当前的气。';
    if (action.kind === 'pass') return '停了一手是放弃这次落子，不等于认输；双方连续停着，才结束落子并数目。';
    return explainMove(evidence, action);
  }
  const whose = evidence.toPlay === evidence.userColor ? '你的棋' : '对手的棋';
  const candidate = evidence.candidates[0];
  if (candidate?.savedStones) {
    const move = candidate.capturedStones ? '吃子腾出出口' : '接长，多出出口';
    return `看 ${candidate.point.label}：${whose}可在这里${move}，解除打吃；新落下这块${candidate.libertiesAfter === 1 ? '也只剩一口气，要留意反提' : `有${candidate.libertiesAfter}口气，不等于做活`}。`;
  }
  if (candidate?.capturedStones) {
    return `看 ${candidate.point.label}，这是${colorName(opposite(evidence.toPlay))}的最后一口气。${evidence.toPlay === evidence.userColor ? '你' : '对手'}占住就能提子，${candidate.libertiesAfter === 1 ? '但新落下这块也只剩一口气，要留意反提' : `新落下这块还有${candidate.libertiesAfter}口气`}。`;
  }
  const own = evidence.atariGroups.find(group => group.color === evidence.toPlay);
  if (own) return `${whose}（${own.stones[0].label}）只剩 ${own.liberties[0].label} 这一口气，直接接长也没能解围；这不等于完全无法救，还可留意别处的吃子。`;
  const target = evidence.atariGroups[0];
  if (target) return `${colorName(target.color)}在 ${target.stones[0].label} 的棋只剩 ${target.liberties[0].label} 一口气，但现在不能合法占住；一口气不一定就能吃。`;
  if (!evidence.stones.some(stone => stone.color === evidence.userColor)) {
    return evidence.toPlay === evidence.userColor
      ? '可以在空旷角部附近试着落子：借两条边较容易围空，别紧贴边线，留些发展空间。'
      : '先等对手落子；下次可以从空旷角部开始，借两条边围空，别紧贴边线。';
  }
  const focus = evidence.groups.filter(group => group.color === evidence.userColor)
    .sort((a, b) => a.liberties.length - b.liberties.length || b.stones.length - a.stones.length)[0];
  const anchor = focus.stones[0].label;
  if (focus.liberties.length <= 2) {
    return `先看你的 ${anchor} 这块，只剩${focus.liberties.length}口气（${focus.liberties.map(point => point.label).join('、')}）；比较从哪边接长能多留出口。`;
  }
  return `你的 ${anchor} 这块有${focus.liberties.length}口气，暂未被打吃；可以看看空旷的角边，给下一块棋留发展空间。`;
}

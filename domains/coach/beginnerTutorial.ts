import { createTutorialSession, getTutorialHighlight, playTutorialPoint, countTutorialTerritory, passTutorialTurn } from './beginnerInteraction';
import type { TutorialPuzzleType } from './beginnerPositions';

export interface BeginnerTutorialStep {
  id: string;
  title: string;
  content: string;
  puzzleType: TutorialPuzzleType;
  boardSize: number;
}

// Topic migration only: original OGS lesson data remains available unchanged.
// Alias IDs match sourceOgs.ts, so the catalog can remove duplicate entries.
export const beginnerSourceLessonIds: readonly string[] = [
  'ogs-rules-intro', 'ogs-self-capture', 'ogs-eyes', 'ogs-ko', 'ogs-territory',
  'ogs-ending-the-game', 'ogs-the-board', 'ogs-count-liberties', 'ogs-count_chains',
  'ogs-in_atari', 'go.rules.capture', 'ogs-capture_chain', 'go.tactics.escape-atari', 'ogs-connect', 'ogs-cut',
];

export const TUTORIAL_STEPS: readonly BeginnerTutorialStep[] = [
  { id: 'beginner-liberties', title: '棋子的气',
    content: '棋子上下左右相邻的空交叉点叫“气”，斜着的不算。\n点黑子，可以查看它的气。',
    puzzleType: 'qi', boardSize: 5 },
  { id: 'beginner-capture', title: '提子',
    content: '白子只剩一口气，叫“被打吃”。\n在发光处下黑棋，堵住最后一口气，就能提走它。',
    puzzleType: 'capture', boardSize: 7 },
  { id: 'beginner-connection', title: '同生共死',
    content: '横竖相连的同色棋子是一块棋，共享所有的气。\n点黑子，可以查看整块棋的气。',
    puzzleType: 'connection', boardSize: 5 },
  { id: 'beginner-forbidden', title: '禁入点',
    content: '落子后既提不走对方，自己又没气，就是“禁入点”，不能下。\n试着在白棋围住的中心下黑棋。',
    puzzleType: 'forbidden', boardSize: 7 },
  { id: 'beginner-ko', title: '打劫',
    content: '白棋若立即回提，就会还原黑棋提子前的棋盘，劫规则不允许这样下。\n先提走白子，再试试白棋回提。',
    puzzleType: 'ko', boardSize: 9 },
  { id: 'beginner-two-eyes', title: '眼位与死活',
    content: '同一块棋有两只独立的真眼，就不会被提走。\n在发光处下黑棋，把中间的空地分成两只眼。',
    puzzleType: 'eyes', boardSize: 9 },
  { id: 'beginner-pass', title: '终局：虚手',
    content: '不落子、停一手，叫“虚手”，也叫“停着”。双方连续各停一手后，先确认死子，再计分。\n点击“停着”。',
    puzzleType: 'endgame', boardSize: 9 },
  { id: 'beginner-territory', title: '终局判定：数地',
    content: '- 地盘只算己方围住的空点，不算棋子。\n- 得分加上提子，白棋再加贴目。\n点击“计算地盘”，看这局的胜负。',
    puzzleType: 'territory', boardSize: 9 },
  { id: 'beginner-opening', title: '开局与棋形',
    content: '“金角银边草肚皮”：开局通常先占角，围地更有效率。\n先下左上角发光处，等白棋应手，再用“小飞”守角。',
    puzzleType: 'final_shape', boardSize: 9 },
  { id: 'beginner-board-view', title: '把棋盘看清楚',
    content: '- 双指缩放，双指拖动棋盘。\n- 放大后，点右下角按钮还原。\n可以试一试，也可以直接点“下一步”。',
    puzzleType: 'zoom', boardSize: 13 },
  { id: 'beginner-explore', title: '接下来，随你探索',
    content: '基础规则先讲到这里。选一种方式继续，之后也能从首页切换。',
    puzzleType: 'explore', boardSize: 9 },
];

export function initTutorialStep(stepIndex: number) {
  const step = TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0];
  return createTutorialSession(step.puzzleType, step.boardSize);
}

export const tutorialContent = { TUTORIAL_STEPS, initTutorialStep, getTutorialHighlight,
  playTutorialPoint, countTutorialTerritory, passTutorialTurn };
export { getTutorialHighlight, playTutorialPoint, countTutorialTerritory, passTutorialTurn };

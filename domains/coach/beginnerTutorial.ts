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
    content: '棋子上下左右相邻的空交叉点，就是它的“气”。斜着的空点不算。\n点点黑棋，看看它的四口气。',
    puzzleType: 'qi', boardSize: 5 },
  { id: 'beginner-capture', title: '提走一颗棋子',
    content: '白棋只剩最后一口气。黑棋占住那里，就能把白棋提走。\n请在高亮处落子。',
    puzzleType: 'capture', boardSize: 5 },
  { id: 'beginner-connection', title: '相连的棋，共享气',
    content: '横竖直接相连的同色棋是一块，共享全部的气；同一个空点只数一次。斜着靠近还不算相连。\n点点这块黑棋，看看它共有几口气。',
    puzzleType: 'connection', boardSize: 5 },
  { id: 'beginner-atari-escape', title: '被打吃了，先找出口',
    content: '只剩一口气，就叫“被打吃”。再不救，下一手可能被提走。\n这次你执黑，请沿最后一口气接长，看看气有没有变多。',
    puzzleType: 'atari_escape', boardSize: 5 },
  { id: 'beginner-connect-cut', title: '连接，也要留意断点',
    content: '两颗黑棋之间留着一个空点。黑先下，能连成一块；白先占住，就会阻止连接。\n请把两边黑棋连起来。',
    puzzleType: 'connect_cut', boardSize: 5 },
  { id: 'beginner-capture-group', title: '提子，要看整块棋',
    content: '这两颗白棋相连，共享最后一口气。\n请堵住高亮的出口，看看会提走几颗棋子。',
    puzzleType: 'capture_group', boardSize: 5 },
  { id: 'beginner-forbidden', title: '禁入点',
    content: '落子时先检查能否提掉对方，再看自己有没有气。既不能提子、自己又没气，就不能下。\n请试着在白棋围住的中心下黑棋。',
    puzzleType: 'forbidden', boardSize: 5 },
  { id: 'beginner-ko', title: '打劫，不能马上提回',
    content: '先提走白子，再换白棋尝试回提。\n如果立即还原上一手之前的棋盘，这次回提就会被劫规则禁止。',
    puzzleType: 'ko', boardSize: 5 },
  { id: 'beginner-two-eyes', title: '两只独立的眼',
    content: '三个相通的空点，仍是一片眼位。\n请在正中间下黑棋，把它分成上、下两只独立的眼。',
    puzzleType: 'eyes', boardSize: 7 },
  { id: 'beginner-pass', title: '终局：双方停着',
    content: '双方都觉得没有值得下的地方时，可以停一手，叫“停着”。连续两次停着后进入终局处理。\n这张图双方都有两片独立眼位。请先停一手。',
    puzzleType: 'endgame', boardSize: 9 },
  { id: 'beginner-territory', title: '终局：数地与贴目',
    content: '这里只数由同色棋围住的空点，棋子本身不算地。最终得分还要加提子，白棋另加贴目。\n请点击“计算地盘”，看看这张活棋图的结果。',
    puzzleType: 'territory', boardSize: 9 },
  { id: 'beginner-opening', title: '开局与小飞',
    content: '“金角银边草肚皮”：开局通常先占角部，围地更有效率。\n先下左上角的高亮点，等白棋应手，再试试“小飞”守角。',
    puzzleType: 'final_shape', boardSize: 9 },
  { id: 'beginner-board-view', title: '把棋盘看清楚',
    content: '双指缩放、拖动棋盘，右下角按钮还原视图。\n可以试试看，也可以直接进入下一步。',
    puzzleType: 'zoom', boardSize: 13 },
  { id: 'beginner-explore', title: '接下来，随你探索',
    content: '基础规则就到这里。选一种方式试试吧，之后也可以从首页切换。',
    puzzleType: 'explore', boardSize: 9 },
];

export function initTutorialStep(stepIndex: number) {
  const step = TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0];
  return createTutorialSession(step.puzzleType, step.boardSize);
}

export const tutorialContent = { TUTORIAL_STEPS, initTutorialStep, getTutorialHighlight,
  playTutorialPoint, countTutorialTerritory, passTutorialTurn };
export { getTutorialHighlight, playTutorialPoint, countTutorialTerritory, passTutorialTurn };

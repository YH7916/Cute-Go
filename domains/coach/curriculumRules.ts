import { inspectMove } from '../../core/go/rules';
import { recordMove } from '../game/positionState';
import { lesson, teacherSources } from './curriculumTypes';
import { exercisePosition } from './exercise';
import type { Point } from '../../types';

// Keep the actual predecessor: a board picture alone cannot represent a ko ban.
function koPosition(rows: readonly string[], point: Point) {
  const position = exercisePosition(rows);
  const move = inspectMove(position.board, point.x, point.y, 'black');
  if (!move.legal || move.result.captured !== 1) throw new Error('Invalid teaching ko setup');
  return recordMove(position, move.result.newBoard, point, move.result.captured, false);
}
const cornerKo = koPosition(['.XO..', 'XO.O.', '.XO..', '.....', '.....'], { x: 2, y: 1 });
const centerKo = koPosition(['.......', '...XO..', '..XO.O.', '...XO..', '.......', '.......', '.......'], { x: 4, y: 2 });

export const rulesLessons = [
  lesson('C', 'rules.suicide', '被围住的空点，都能下吗',
    '落子后先提走对方无气的棋，再检查自己的气。如果没有提子、自己又没气，这手就不能下。',
    '我们比较两种情况：钻进去仍没有气，和先提掉对方、给自己腾出气。',
    '不能只看落点四周是什么颜色。提子后的棋盘，才决定自己的气够不够。', [
      { kind: 'point', position: exercisePosition(['.....', '..O..', '.O.O.', '..O..', '.....']),
        rubric: { kind: 'legal' }, prompt: '你执黑。中央空点被白棋围住了，找一个下完仍有气的空点落子。',
        hints: ['中央落子不能提走周围白棋，而且黑棋自己没有气。', '看看包围圈外：落子后能挨着空交叉点的位置可以下。'],
        explanation: '中央是禁入点，因为不能提子又没有气。你在外面合法落子，保留了自己的气。' },
      { kind: 'point', position: exercisePosition(['.X...', 'XOX..', 'O.O..', '.O...', '.....']),
        rubric: { kind: 'capture', minimum: 1 }, prompt: '你执黑。白棋围住了一个空点，但这次可以从里面提子。找出来，提掉一颗白棋。',
        hints: ['先找上方那颗白棋的最后一气。', '在它下面落子，先提掉它，黑棋就从它空出的位置获得气。'],
        explanation: '虽然落点原来四周都是白棋，黑先提掉一颗白棋就有了气，所以这手合法。' },
    ], ['basics.escape'], { position: exercisePosition(['.....', '..O..', '.O.O.', '..O..', '.....']), steps: [
      { text: '中央四周都是白棋，而且周围白棋都有别的气。' },
      { point: { x: 2, y: 2 }, expectedRejection: 'suicide', text: '黑不能下中央：提不走白棋，自己又没气。棋盘保持原样，仍轮黑。' },
      { point: { x: 0, y: 0 }, text: '黑换到角上，这里有相邻空点，落子合法。' },
    ] }, [teacherSources.curriculum]),
  lesson('C', 'rules.ko', '遇到劫，不能马上提回来',
    '简单劫禁止立即把整张棋盘还原。先在别处落一手，对方应手后，才可能回提。',
    '这课先练轮次和合法性。我会按约定在别处应一手，再请你回提；实战对方也可以选择消劫。',
    '别处落子不一定是有用的劫材；能回提也不代表已经赢了劫。每次仍要检查局面。', [
      { kind: 'sequence', position: cornerKo, minimumCaptures: 1,
        prompt: '你执白，黑刚提了一子。先在右下角落子；等黑在旁边应手，再提回原来的黑子。',
        hints: ['马上回提会还原上一张棋盘，被劫规则禁止。先完成右下角这一手。', '白先下右下角，黑在它左边应手后，回到刚空出的左上方那个点提黑。'],
        explanation: '经过别处一白一黑，回提不会立即还原整张棋盘。这次回提合法；这里只练规则，未证明右下角是好劫材。',
        solution: [{ point: { x: 4, y: 4 }, reply: { x: 3, y: 4 }, text: '黑已在右下方应手。现在轮白，回到刚才的劫处试着提回。',
          next: [{ point: { x: 1, y: 1 }, text: '白回提一子，完整棋盘已与之前不同。' }] }] },
      { kind: 'sequence', position: centerKo, minimumCaptures: 1,
        prompt: '你执白，这次劫在上方靠中间。先下右下角，等黑应手后，再找到刚空出的点回提。',
        hints: ['看黑方上一手的位置，别把上一题的坐标搬过来。', '白先下右下角；黑应在左上邻近点后，白回到那颗黑棋左侧的空点提子。'],
        explanation: '劫的位置换了，规则没变：要保留前一局面来检查，不能只凭静态棋图说能不能回提。',
        solution: [{ point: { x: 6, y: 6 }, reply: { x: 5, y: 5 }, text: '黑在右下方应手了。请重新观察上方的劫，找到回提点。',
          next: [{ point: { x: 3, y: 2 }, text: '白提回原来的黑子，完成一次合法的隔手回提。' }] }] },
    ], ['rules.suicide'], { position: cornerKo, steps: [
      { text: '黑刚提子，轮白。刚空出的点看起来能提黑，但要先检查劫。' },
      { point: { x: 1, y: 1 }, expectedRejection: 'ko', text: '白立即回提会还原棋盘，被劫规则拒绝；棋盘与行棋方都不变。' },
      { point: { x: 4, y: 4 }, text: '白先在别处下一手。这只是轮次示例，还不是判断劫材大小。' },
      { point: { x: 3, y: 4 }, text: '黑也在别处应手。实战黑还可以选择在劫处消劫。' },
      { point: { x: 1, y: 1 }, text: '现在白回提合法，因为整张棋盘已改变。' },
    ] }, [teacherSources.curriculum], true),
];

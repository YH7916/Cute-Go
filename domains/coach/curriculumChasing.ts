import { lesson, teacherSources } from './curriculumTypes';
import { exercisePosition } from './exercise';

export const chasingLessons = [
  lesson('F', 'tactics.ladder', '连续追吃：每次都重新数气',
    '连续打吃时，对方每逃一手，整块棋的气都会变化。跟着出口调整方向，一直读到真正提走。',
    '一开始追对了不够。中途放宽一个出口，对方就可能从两气变成三气，摆脱追击。',
    '路上出现对方援兵时，要重新检查能否接应；不能只按记住的折线路线落子。', [
      { kind: 'sequence', familyId: 'go.tactics.ladder.short-chase',
        position: exercisePosition(['.....', '.X...', '.XO..', '..X..', '.....']), minimumCaptures: 4,
        prompt: '轮黑。用连续打吃追住中央白棋，一直下到把它提走。',
        hints: ['先比较两个打吃方向：白接长后，哪条路仍然只有两气？', '第一手从右侧打吃；白往上逃后，继续占住它的一个出口。靠边后不要漏掉最后一气。'],
        explanation: '每次都重新数整块白棋的气，连续压住出口，直到边界让它再也逃不出。',
        solution: [{ point: { x: 3, y: 2 }, reply: { x: 2, y: 1 }, text: '白已接长。重新找这整块白棋的两个出口。', next: [
          { point: { x: 2, y: 0 }, reply: { x: 3, y: 1 }, text: '白转向右边。继续打吃，别放宽它的出口。', next: [
            { point: { x: 4, y: 1 }, reply: { x: 3, y: 0 }, text: '白到了上边，现在整块只剩最后一气。', next: [
              { point: { x: 4, y: 0 }, text: '追到边上后，黑填最后一气，整块白棋被提走。' },
            ] },
          ] },
          { point: { x: 3, y: 1 }, reply: { x: 2, y: 0 }, text: '这个方向也能继续打吃。白到了上边，还要数左右出口。', next: [
            { point: { x: 1, y: 0 }, reply: { x: 3, y: 0 }, text: '白向右接长，只剩右端一气。', next: [
              { point: { x: 4, y: 0 }, text: '沿另一条合法追法，黑也提走了整块白棋。' },
            ] },
            { point: { x: 3, y: 0 }, reply: { x: 1, y: 0 }, text: '白向左接长，只剩左端一气。', next: [
              { point: { x: 0, y: 0 }, text: '黑在左端收住出口，提走整块白棋。' },
            ] },
          ] },
        ] }],
        refutations: [{ after: { x: 2, y: 1 }, reply: { x: 3, y: 2 }, text: '白向右接长后有三气，下一手不能再连续打吃。先比较对方逃出后的气，再选方向。' }] },
      { kind: 'sequence', familyId: 'go.tactics.ladder.long-chase',
        position: exercisePosition(['.......', '.......', '..X....', '..XO...', '...X...', '.......', '.......']), minimumCaptures: 6,
        prompt: '轮黑。这次离边更远。连续打吃，跟着白棋的应手把整段变化下完。',
        hints: ['先把对方压在两气以内。每次白接长以后，停一下，重新找出口。', '从右侧开始追，再交替控制上方与右侧的出口；到了上边仍要完成最后的提子。'],
        explanation: '追的路变长了，依据仍是每一手后的实际气数；一直下到提子，才能确认追吃完成。',
        solution: [{ point: { x: 4, y: 3 }, reply: { x: 3, y: 2 }, text: '白向上接长。继续看整块的出口。', next: [
          { point: { x: 3, y: 1 }, reply: { x: 4, y: 2 }, text: '白向右转。跟着它的气调整方向。', next: [
            { point: { x: 5, y: 2 }, reply: { x: 4, y: 1 }, text: '白又向上接长，距离上边近了。', next: [
              { point: { x: 4, y: 0 }, reply: { x: 5, y: 1 }, text: '白转向右上。继续封住外面的出口。', next: [
                { point: { x: 6, y: 1 }, reply: { x: 5, y: 0 }, text: '白到了上边。找到最后一气，再结束这段变化。', next: [
                  { point: { x: 6, y: 0 }, text: '最后一气被填住，六颗白棋一起被提走。' },
                ] },
              ] },
            ] },
          ] },
        ] }],
        refutations: [{ after: { x: 3, y: 2 }, reply: { x: 4, y: 3 }, text: '白向宽处逃出后有三气，连续打吃断了。先把逃跑方向算清楚。' }] },
    ], ['tactics.double-atari'], { position: exercisePosition(['.....', '.X...', '.XO..', '..X..', '.....']),
      exposedFamilyIds: ['go.tactics.ladder.short-chase'], steps: [
        { text: '先看这条短变化。黑从右侧打吃，白每次沿剩下的气接长。' },
        { point: { x: 3, y: 2 }, text: '黑打吃。' }, { point: { x: 2, y: 1 }, text: '白接长，现在两气。' },
        { point: { x: 2, y: 0 }, text: '黑封上方，继续打吃。' }, { point: { x: 3, y: 1 }, text: '白转向右边，还是两气。' },
        { point: { x: 4, y: 1 }, text: '黑封外面，逼白靠边。' }, { point: { x: 3, y: 0 }, text: '白靠边后只剩一气。' },
        { point: { x: 4, y: 0 }, text: '黑填最后一气。连续追吃要一直读到这里，不能在第一手打吃时就停。' },
      ] }, [teacherSources.chasing]),
];

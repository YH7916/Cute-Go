import { lesson, teacherSources } from './curriculumTypes';
import { exercisePosition } from './exercise';

export const lifeLessons = [
  lesson('F', 'life.make-two-eyes', '已有一眼，另一眼缺在哪里',
    '做眼不总是往内部填子。先保留已经成形的眼，再找另一片眼位的缺口，分清补墙与填眼。',
    '看着像眼的空点，若还通向外面的对方棋，就需要先补好边界。',
    '两个空点不一定是两眼。要检查它们是否分开，以及围住空点的棋是否连成一整块。', [
      { kind: 'point', familyId: 'go.life.make-two-eyes.wall-gap',
        position: exercisePosition(['OOOOOOO', 'OXXXXXO', 'OX.X..O', 'OXXXXXO', 'OOOOOOO', '.......', '.......']),
        rubric: { kind: 'two-eyes', anchor: { x: 1, y: 1 } }, prompt: '轮黑。黑棋已有一只眼。保住它，并补出第二只完整的眼。',
        hints: ['先找已经被完整包住的空点，不要填掉它。', '右边的眼位还通着外面的白棋。应该补外墙，还是填里面？'],
        explanation: '补上右边外墙，里面的空点才成为第二只眼；已有的左眼也保留下来了。',
        refutations: [{ after: { x: 4, y: 2 }, reply: { x: 5, y: 2 }, text: '黑填了里面，却没补外墙。白从缺口点入，黑只剩左边一眼。做眼前先看缺口在哪里。' }] },
      { kind: 'point', familyId: 'go.life.make-two-eyes.wall-gap',
        position: exercisePosition(['X.X..OO', 'XXXXXOO', 'OOOOOOO', '.......', '.......', '.......', '.......']),
        rubric: { kind: 'two-eyes', anchor: { x: 0, y: 0 } }, prompt: '轮黑。靠边也有同样的问题：留住已有的一眼，再补成另一眼。',
        hints: ['棋盘边界能帮忙围眼，但右侧仍有一个缺口。', '把右侧与白棋相通的地方封住，里面的空点才安全。'],
        explanation: '边界和黑棋共同围住两个分开的空点。补墙留眼，比往内部填子更有用。',
        refutations: [{ after: { x: 3, y: 0 }, reply: { x: 4, y: 0 }, text: '白从右边缺口点入，右边没能留出眼位，黑仍只有左边一眼。' }] },
    ], ['tactics.snapback'], { position: exercisePosition(['X.X..OO', 'XXXXXOO', 'OOOOOOO', '.......', '.......', '.......', '.......']),
      exposedFamilyIds: ['go.life.make-two-eyes.wall-gap'], steps: [
        { text: '左边已经有一眼。右边的两个空点里，一个是眼位，一个是缺口，不能混在一起。' },
        { point: { x: 4, y: 0 }, text: '黑补右边的墙，留住里面的空点。现在同一块黑棋有两只完整的眼。' },
      ] }, [teacherSources.eyes], true),
];

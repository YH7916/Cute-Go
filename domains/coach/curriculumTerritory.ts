import { lesson, teacherSources } from './curriculumTypes';
import { exercisePosition } from './exercise';

export const territoryLessons = [
  lesson('D', 'life.two-eyes', '给同一块棋留两只眼',
    '眼是自己完整棋块围住的内部空点。同一块棋有两个独立的真眼时，对方不能一手同时填完，它就能活。',
    '试着把一片长空分成两个独立的小眼。下完再看：两眼的墙是不是同一块棋？',
    '两个相邻空点仍是一片空间；两只眼是安全的活法，但没有两眼不一定死，双活等情况要另看。', [
      { kind: 'point', position: exercisePosition(['OOOOOOO', 'OXXXXXO', 'OX...XO', 'OXXXXXO', 'OOOOOOO', '.......', '.......']),
        rubric: { kind: 'two-eyes', anchor: { x: 1, y: 1 } }, prompt: '你执黑。黑棋内部有三个连着的空点，下一手把它们分成两只独立的小眼。',
        hints: ['不要把三个空点全部填满，要给棋块留下呼吸的地方。', '在长空的正中间下，把两端的空点隔开。'],
        explanation: '中间一颗棋把长空分成两眼。每只眼的边界都属于同一块黑棋，白填任何一眼都会自杀。' },
      { kind: 'point', position: exercisePosition(['X...X', 'XXXXX', 'OOOOO', 'O.O.O', 'OOOOO']),
        rubric: { kind: 'two-eyes', anchor: { x: 0, y: 0 } }, prompt: '这次黑棋靠着上边。把内部三个空点分成两眼，让这块黑棋活下来。',
        hints: ['棋盘边界可以帮忙围眼，但相邻空点仍需分开。', '把上边长空的中央补上，留下左右两个独立空点。'],
        explanation: '靠边也能做两眼；上方的棋盘边界和同一块黑棋，一起围住了两个独立空点。' },
    ], ['rules.ko'], { position: exercisePosition(['X...X', 'XXXXX', 'OOOOO', 'O.O.O', 'OOOOO']), steps: [
      { text: '上边黑棋内部有三个连着的空点。我们留空做眼，不把自己的空间填满。' },
      { point: { x: 2, y: 0 }, text: '黑分开长空，左右各留一只眼。' },
      { point: { x: 1, y: 0 }, expectedRejection: 'suicide', text: '白不能填左眼：黑还有右眼一气，白提不走黑棋，自己又没有气。' },
    ] }, [teacherSources.eyes]),
  lesson('D', 'rules.territory-dead', '围住空点，把一盘棋下完',
    '围棋最终比谁的得分多。双方都认为没有值得下的棋时连续停着，再确认死子、数地和提子，白方另加贴目。',
    '这里已确认双方活棋、没有死子，只数指定一方围住的空点。活棋本身不计入这项地数。',
    '本应用用地加提子计分，不是把盘上棋子加一遍；同时接触黑白的公共空点也不能全算给一方。', [
      { kind: 'number', position: exercisePosition(['X.X.X', 'XXXXX', '.....', 'OOOOO', 'O.O.O']),
        rubric: { kind: 'territory', color: 'black' }, prompt: '双方已确认活棋、没有死子。只数黑方的地：黑棋围住了几个空点？',
        hints: ['先看上边黑棋围住的空点；棋子本身不是空点。', '上边两个空点只挨黑棋；中间一排同时接触黑白，不归黑方。'],
        explanation: '黑方上边的两个空点是地，中间公共空区不计入。地数不是最终比分，还要结合提子和贴目。' },
      { kind: 'number', position: exercisePosition(['X.X.X..', 'XXXXXXX', '.......', 'OOOOOOO', 'O.O.O.O', 'OOOOOOO', '.......']),
        rubric: { kind: 'territory', color: 'white' }, prompt: '换一张双方都已活的棋盘。只数白方的地，包括棋盘下边围住的空点。',
        hints: ['白棋内部的三只小眼是地，白墙下方整排空点也只接触白棋。', '三只小眼加最下面七个空点；中间黑白之间的一排不归白方。'],
        explanation: '白方三个内部空点加下边七个空点，共有十目地。贴目和提子另计，不能把这个数当成全部白方得分。' },
    ], ['life.two-eyes'], { position: exercisePosition(['X.X.X', 'XXXXX', '.....', 'OOOOO', 'O.O.O']), steps: [
      { text: '黑白各自都有两眼，这里已确认没有死子。上边两个空点只接触黑棋，是黑地。' },
      { text: '最下面两个空点是白地；中间一排同时接触黑白，是公共空区。棋子本身不计入地数。' },
      { text: '实战先确认没有需要继续争夺的地方。双方连续停着后进入终局，确认死子，再计地、提子与白方贴目。' },
    ] }, [teacherSources.curriculum]),
];

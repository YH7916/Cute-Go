import data from './sourceData/ggg.json';
import type { CurriculumLesson } from './curriculumTypes';
import type { Exercise, ExerciseVariationNode } from './exerciseTypes';
import type { Point } from '../../types';
import { sourcePlayer, sourcePosition } from './sourcePosition';

interface SourceNode {
  color: string | null; point: Point | null; correct: boolean; wrong: boolean; text: string;
  boardMarks: { point: Point | null; label: string }[]; children: SourceNode[];
}
const revision = `ggg:${data.sourceCommit}:zh-2026-10-03`;
const groups = [
  { id: 'ggg-short-reading', title: '短变化练习', ids: ['25', '06', '10', '15', '20', '47', '11', '05', '35', '89'] },
  { id: 'ggg-connect-live', title: '连接与两眼', ids: ['74', '71'] },
  { id: 'ggg-capturing-race', title: '对杀练习', ids: ['91', '76'] },
  { id: 'ggg-snapback-cut', title: '倒扑与断子', ids: ['104', '99'] },
];

// Local task guidance checked against the initial diagrams and complete source
// variations. These are not translations of an upstream objective or new verdicts;
// the original root comments and author-annotated outcomes remain in sourceData.
// Problem 99 already states its capture objective, so it keeps that original text.
const localObjectives: Readonly<Record<string, string>> = {
  '25': '让下边被围住的黑棋做活。',
  '06': '破坏右下白棋的眼形，阻止白棋做活。',
  '10': '让下边被围住的黑棋做出两只眼。',
  '15': '破坏下边白棋的眼形，阻止白棋做活。',
  '20': '让右下贴边的黑棋做出两只眼。',
  '47': '破坏下边白棋的眼形，阻止白棋做活。',
  '11': '救活下边贴边的黑棋，做出两只眼。',
  '05': '连接下边的黑棋，让它们一起做活。',
  '35': '让左下贴边的黑棋连好，做出两只眼。',
  '89': '破坏右下白棋的眼形，阻止白棋做活。',
  '74': '连接下边的黑棋，避免被白棋切断。',
  '71': '让左边被围住的黑棋做出两只眼。',
  '91': '赢下右边的对杀，先吃掉贴边的两颗白子。',
  '76': '赢下左下的对杀，吃住夹在黑棋之间的三颗白子。',
  '104': '连接下边的两块黑棋，避免因气紧被白棋倒扑。',
};

function marks(node: SourceNode) {
  return node.boardMarks.flatMap(({ point, label }) => point ? [{ point, label }] : []);
}
function variation(node: SourceNode): ExerciseVariationNode {
  if (!node.color) throw new Error('Non-move node inside source continuation');
  return { point: node.point, color: sourcePlayer(node.color), correct: node.correct, wrong: node.wrong,
    text: node.text ? node.text.replaceAll('。', '。\n').trim() : undefined, boardMarks: marks(node), children: node.children.map(variation) };
}

function exercise(id: string, lessonId: string): Exercise {
  const problem = data.problems.find((item) => item.id === `ggg-easy-${id}`);
  if (!problem) throw new Error(`Missing source problem: ${id}`);
  const objective = localObjectives[id];
  const prompt = objective ? `${problem.root.text}\n${objective}` : problem.root.text;
  const observation = objective?.includes('对杀') ? '先数双方的气，比较从哪边紧气。'
    : objective?.includes('破坏') ? '找白棋做出两只眼的关键点。'
      : objective?.includes('连接') ? '先看白棋能从哪里切断。' : '找能把眼位分开的关键点。';
  return { id: problem.id, familyId: problem.id, skillId: lessonId, contentRevision: revision,
    kind: 'variation', position: sourcePosition(problem.boardSize, problem.toPlay, problem.initialStones),
    solution: problem.root.children.map(variation), boardMarks: marks(problem.root), prompt,
    hints: [observation, '试试圈出的点，再看对方应手。'],
    teachingNotes: `${prompt}\n\n- ${observation}\n- 想好对方的应手，再决定下一步。`,
    explanation: '这一条变化完成了。', sources: [{ title: 'Go Game Guru · 围棋练习', url: problem.sourceUrl }] };
}

export const gggSections = [{ id: 'ggg-practice', title: '吃子与死活练习' }];
export const gggLessons: readonly CurriculumLesson[] = groups.map((group, index) => {
  const exercises = group.ids.map((id) => exercise(id, group.id));
  const first = exercises[0];
  if (!first.position) throw new Error('Missing source position');
  return { id: group.id, skillId: group.id, section: 'ggg-practice', title: group.title,
    concept: '读一读对方的应手，再继续完成这一局部的变化。', example: first.prompt, misconception: '',
    prerequisites: [index === 0 ? 'ogs-capturing_race' : groups[index - 1].id],
    contentRevision: revision, reviewStatus: 'source-adapted', validation: 'rules-checked', exercises,
    demonstration: { position: first.position, exposedFamilyIds: [first.familyId], steps: [{ text: first.prompt }] },
    sources: exercises.flatMap((item) => item.sources ?? []) };
});

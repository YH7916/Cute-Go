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
  '99': '吃掉切断黑棋的白子。',
};

// Edit only the displayed Chinese comments. The archived comments, moves,
// labels and author verdicts remain intact.
const commentCopy: Readonly<Record<string, string>> = {
  '正确。白棋不能在 A 处切断，因为那样会让自己只剩一口气。':
    '白棋若在 A 切断，自己就只剩一气，无法切断黑棋。',
  '现在白棋可以打劫，但黑棋本来可以避免这一点。':
    '白棋现在可以打劫；黑棋原本能避免这个劫。',
  '正确。如果白棋下在 A，黑棋可以在 B 提子。如果白棋下在 B，黑棋就在 A 连接，因此黑棋有两只眼，可以活棋。':
    '- 白下 A，黑在 B 提子；白下 B，黑在 A 连接。\n- 两种应手都能保住两眼，黑棋活了。',
  '这是要点。白棋下在这里后，黑棋就会死。':
    '白棋占住要点后，黑棋无法做活。',
  '正确。白棋气不够，无法在 A 或 B 打吃，因此黑棋会赢得对杀。':
    '白棋气不够，无法在 A 或 B 打吃，黑棋赢得对杀。',
  '正确。白棋只有两口气，而黑棋各块棋的气都比这多。无论白棋接下来怎样下，黑棋都能打吃。':
    '- 白棋只有两气，黑棋各块的气都更多。\n- 白棋无论怎样应手，黑棋都能打吃。',
  '这条变化对黑棋比前一条还差，因为白棋已经安全，而黑棋仍须担心白棋在 A 切断。':
    '这条变化对黑棋更差：白棋已安全，黑棋还要防白在 A 切断。',
  '这一手使黑棋气紧。': '白棋这手让黑棋气紧。',
  '怎样才能避免这种情况？': '退一步，想想怎样避免黑棋气紧。',
  '这样也可以，但不是最佳下法。白棋在 A 推进时，黑棋不能在 B 挡住，因为白棋可以在 C 切断。':
    '- 这手也可行，但不是最佳下法。\n- 白在 A 推进时，黑若在 B 挡，白就能在 C 切断。',
  '这样也正确。': '这手也正确。',
};

function marks(node: SourceNode) {
  return node.boardMarks.flatMap(({ point, label }) => point ? [{ point, label }] : []);
}
function variation(node: SourceNode): ExerciseVariationNode {
  if (!node.color) throw new Error('Non-move node inside source continuation');
  return { point: node.point, color: sourcePlayer(node.color), correct: node.correct, wrong: node.wrong,
    text: node.text ? commentCopy[node.text] ?? node.text : undefined, boardMarks: marks(node), children: node.children.map(variation) };
}

function exercise(id: string, lessonId: string): Exercise {
  const problem = data.problems.find((item) => item.id === `ggg-easy-${id}`);
  if (!problem) throw new Error(`Missing source problem: ${id}`);
  const objective = localObjectives[id];
  const prompt = objective ? `${problem.toPlay === 'white' ? '白' : '黑'}先，${objective}` : problem.root.text;
  const observation = objective?.includes('对杀') ? '先数双方的气，比较从哪边紧气。'
    : objective?.includes('破坏') ? '找白棋做出两只眼的关键点。'
      : objective?.includes('连接') ? '先看白棋能从哪里切断。'
        : id === '99' ? '先看断子与周围白棋的连接。' : '找能把眼位分开的关键点。';
  return { id: problem.id, familyId: problem.id, skillId: lessonId, contentRevision: revision,
    kind: 'variation', position: sourcePosition(problem.boardSize, problem.toPlay, problem.initialStones),
    solution: problem.root.children.map(variation), boardMarks: marks(problem.root), prompt,
    hints: [observation, '试试圈出的点，再看对方应手。'],
    teachingNotes: `- ${observation}\n- 想好对方怎样应手，再决定下一步。`,
    explanation: '这一条变化完成了。', sources: [{ title: 'Go Game Guru · 围棋练习', url: problem.sourceUrl }] };
}

export const gggSections = [{ id: 'ggg-practice', title: '吃子与死活练习' }];
export const gggLessons: readonly CurriculumLesson[] = groups.map((group, index) => {
  const exercises = group.ids.map((id) => exercise(id, group.id));
  const first = exercises[0];
  if (!first.position) throw new Error('Missing source position');
  return { id: group.id, skillId: group.id, section: 'ggg-practice', title: group.title,
    concept: '算清对方的应手，再下完这段局部变化。', example: first.prompt, misconception: '',
    prerequisites: [index === 0 ? 'ogs-capturing_race' : groups[index - 1].id],
    contentRevision: revision, reviewStatus: 'source-adapted', validation: 'rules-checked', exercises,
    demonstration: { position: first.position, exposedFamilyIds: [first.familyId], steps: [{ text: first.prompt }] },
    sources: exercises.flatMap((item) => item.sources ?? []) };
});

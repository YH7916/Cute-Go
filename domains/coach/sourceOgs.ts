import data from './sourceData/ogs.json';
import foundationCopy from './sourceData/ogs-copy-foundations.json';
import skillsCopy from './sourceData/ogs-copy-skills.json';
import type { CurriculumLesson } from './curriculumTypes';
import type { Exercise, ExerciseVariationNode } from './exerciseTypes';
import type { Player, Point } from '../../types';
import { restoreSourceCapture, sourcePlayer, sourcePosition } from './sourcePosition';

interface OgsPage {
  id: string; text: string[]; sourceUrl: string;
  position: { width: number; height: number; initialPlayer: string; black: Point[]; white: Point[];
    marks: Record<string, Point[] | undefined> };
  answer: { kind: string; correct?: unknown; wrong?: unknown; options?: { id: string; label: string }[];
    action?: string; points?: Point[] };
}
interface MutableVariation {
  point: Point | null; color: Player; correct?: boolean; wrong?: boolean; children: MutableVariation[];
}
const revision = `ogs:${data.source.commit}:zh-2026-10-03`;
const teachingCopy: Readonly<Record<string, { prompt: string; notes: string }>> = { ...foundationCopy, ...skillsCopy };
const scoreLessons = new Set(['ogs-territory', 'ogs-count-territory', 'ogs-ending-the-game']);
const scoring = '这组题按“地盘＋提子”的数目法计算。';
const skillAliases: Readonly<Record<string, string>> = {
  'ogs-capture_stone': 'go.rules.capture', 'ogs-escape': 'go.tactics.escape-atari',
};
const observationHints: Readonly<Record<string, string>> = {
  'ogs-rules-intro': '先看轮到哪一方，再找棋子旁边的空交叉点。',
  'ogs-self-capture': '先看能否提掉邻近的棋；提子后才判断自己有没有气。',
  'ogs-eyes': '分清两个独立的眼，还是一个较大的眼。',
  'ogs-ko': '留意提子后能否立即回提，以及别处有没有必须应对的劫材。',
  'ogs-territory': '先数围住的空点；这组题中，死子同时计俘子和空地点。',
  'ogs-ending-the-game': '先确认现在是停着、移除死子，还是结束计分。',
  'ogs-the-board': '先辨认角、边、中央和星位。',
  'ogs-count-liberties': '沿着整块棋找上下左右的空点，同一个空点只数一次。',
  'ogs-count_chains': '只有横竖直接相连才是一块，斜着靠近不算相连。',
  'ogs-in_atari': '数标记棋块的气：只剩一口气，就是被打吃。',
  'ogs-capture_stone': '找标记白子的最后一口气。',
  'ogs-capture_chain': '把相连的棋当成一个整体，找它剩下的最后一口气。',
  'ogs-escape': '找被打吃棋块的出口，再数接长后的气。',
  'ogs-connect': '找能把两边同色棋横竖连起来的空点。',
  'ogs-cut': '找对方连接两边棋子的关键空点。',
  'ogs-real-false-eye': '检查围住眼的棋子，会不会先被打吃或提走。',
  'ogs-make-alive': '找能把眼位分成两个独立空点的位置。',
  'ogs-atari-correct-side': '比较两个打吃方向，看看对方接长后会往哪里逃。',
  'ogs-play_double_atari': '找能同时占住两块目标棋各一口气的位置。',
  'ogs-ladder': '每次打吃后重新数气，别让逃跑的棋得到三口气。',
  'ogs-snapback': '先想让对方提走一子后，能不能再把对方整块提回来。',
  'ogs-net': '观察逃跑的路线，找能一次封住出口的位置。',
  'ogs-count-territory': '空地点逐个数，死子按这组题的数目法每颗合计两目。',
  'ogs-close_territory': '找对方能钻进地盘的缺口。',
  'ogs-capturing_race': '比较两块棋的气，先紧对方的气，再检查自己的气。',
};

function paths(value: unknown): Point[][] {
  if (!Array.isArray(value)) throw new Error('Missing OGS answer paths');
  return value.map((line: unknown) => {
    if (!Array.isArray(line) || !line.length) throw new Error('Empty OGS answer path');
    return line.map((point: unknown) => {
      if (!point || typeof point !== 'object' || !('x' in point) || !('y' in point) ||
          typeof point.x !== 'number' || typeof point.y !== 'number' ||
          !Number.isInteger(point.x) || !Number.isInteger(point.y)) throw new Error('Invalid OGS answer point');
      return { x: point.x, y: point.y };
    });
  });
}

function variation(page: OgsPage): readonly ExerciseVariationNode[] {
  const roots: MutableVariation[] = [];
  for (const [verdict, lines] of [['correct', paths(page.answer.correct)], ['wrong', paths(page.answer.wrong)]] as const) {
    for (const line of lines) {
      let children = roots;
      let color = sourcePlayer(page.position.initialPlayer);
      for (const [index, point] of line.entries()) {
        const move = point.x < 0 && point.y < 0 ? null : point;
        let node = children.find((entry) => entry.color === color &&
          (entry.point === move || !!entry.point && !!move && entry.point.x === move.x && entry.point.y === move.y));
        if (!node) { node = { point: move, color, children: [] }; children.push(node); }
        if (index === line.length - 1) node[verdict] = true;
        children = node.children;
        color = color === 'black' ? 'white' : 'black';
      }
    }
  }
  return roots;
}

function exercise(page: OgsPage, lessonId: string, originalLessonId: string): Exercise {
  if (page.position.width !== page.position.height) throw new Error('Rectangular source board is unsupported');
  let position = sourcePosition(page.position.width, page.position.initialPlayer, [
    ...page.position.black.map((point) => ({ ...point, color: 'black' })),
    ...page.position.white.map((point) => ({ ...point, color: 'white' })),
  ]);
  // This source page explicitly starts just after White captured at its "1" mark.
  if (page.id === 'ogs-ko-page05') position = restoreSourceCapture(position, { x: 0, y: 10 }, { x: 0, y: 9 });
  const symbols: Readonly<Record<string, string>> = { triangle: '△', square: '□', circle: '○', cross: '×' };
  const boardMarks = Object.entries(page.position.marks).flatMap(([key, points]) =>
    (points ?? []).map((point) => ({ point, label: symbols[key] ?? key })));
  const copy = teachingCopy[page.id];
  if (!copy) throw new Error(`Missing teaching copy: ${page.id}`);
  const prompt = copy.prompt;
  const base = { id: page.id, familyId: page.id, skillId: lessonId, contentRevision: revision, position, boardMarks,
    teachingNotes: copy.notes,
    prompt, hints: [observationHints[originalLessonId] ?? '先观察目标棋块和它的气。', '试试圈出的点，再观察气的变化。'] as const,
    explanation: '这一题完成了。',
    sources: [{ title: 'Online-Go.com Learning Hub', url: page.sourceUrl }] };
  if (page.answer.kind === 'move-tree') return { ...base, kind: 'variation', solution: variation(page) };
  if (page.answer.kind === 'choice') {
    const correct = page.answer.correct;
    if (!Array.isArray(correct) || !correct.length || !correct.every((value) => typeof value === 'string') || !page.answer.options?.length) {
      throw new Error(`Invalid source choices: ${page.id}`);
    }
    const ids = correct.filter((value): value is string => typeof value === 'string');
    const label = page.answer.options.filter((option) => ids.includes(option.id)).map((option) => option.label).join('、');
    return { ...base, kind: 'choice', choices: page.answer.options, correctChoiceId: ids[0], correctChoiceIds: ids,
      hints: [base.hints[0], `这一题的答案是“${label}”。再看棋盘确认一下。`], explanation: `对，答案是“${label}”。` };
  }
  if (page.answer.kind === 'remove-stones') {
    if (!page.answer.points?.length) throw new Error(`Missing removal points: ${page.id}`);
    return { ...base, kind: 'action', action: 'remove', expectedPoints: page.answer.points,
      hints: ['找被白棋包围、做不出两眼的黑棋。', '选择圈出的四颗黑子，把这整块死棋移除。'],
      explanation: '这四颗黑子是死子，移除后才能计分。' };
  }
  if (page.answer.kind === 'action' && (page.answer.action === 'pass' || page.answer.action === 'finish')) {
    return { ...base, kind: 'action', action: page.answer.action,
      hints: [page.answer.action === 'pass' ? '双方都没有值得下的地方时，可以停着。' : '死子已移除，现在比较双方得分。',
        page.answer.action === 'pass' ? '点击“停一手”。' : '点击“结束对局”。'],
      explanation: page.answer.action === 'pass' ? '停着不落子。双方先后停着后，就进入终局处理。' : '黑棋 24 目，白棋 22 目，黑棋获胜。' };
  }
  throw new Error(`Unsupported source interaction: ${page.id}`);
}

export const ogsSections = data.sections.map(({ id, title }) => ({ id, title }));
let previousLesson: string | undefined;
export const ogsLessons: readonly CurriculumLesson[] = data.sections.flatMap((section) => section.lessons.map((source) => {
  const id = skillAliases[source.id] ?? source.id;
  const exercises = source.pages.map((page) => exercise(page, id, source.id));
  const first = exercises[0];
  if (!first?.position) throw new Error(`Empty source lesson: ${source.id}`);
  const lesson: CurriculumLesson = { id, skillId: id, section: section.id,
    title: source.id === 'ogs-count-territory' ? '数地与死子' : source.title,
    concept: `${source.subtext}${scoreLessons.has(source.id) ? `。${scoring}` : ''}`,
    example: first.prompt, misconception: '', prerequisites: previousLesson ? [previousLesson] : [],
    contentRevision: revision, reviewStatus: 'source-adapted', validation: 'rules-checked', exercises,
    demonstration: { position: first.position, exposedFamilyIds: [first.familyId], steps: [{ text: first.prompt }] },
    sources: exercises.flatMap((item) => item.sources ?? []) };
  previousLesson = id;
  return lesson;
}));

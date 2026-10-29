import { sourceLessons } from './sourceCurriculum';
import { tutorialContent } from './beginnerTutorial';

// The tutorial introduces rules; the course still needs their practice boards.
// Source archives, exercise identities and content revisions remain unchanged.
export const beginnerLessons = tutorialContent.TUTORIAL_STEPS;

// Practice liberties, capture and rescue before eyes, then read tactics before
// territory and mixed problems. Group-counting pages stay in the source archive.
const courseUnits = [
  { id: 'ogs-stage-1', title: '数气与提子', lessonIds: [
    'ogs-count-liberties', 'ogs-in_atari', 'go.rules.capture',
    'ogs-capture_chain', 'ogs-self-capture',
  ] },
  { id: 'ogs-stage-2', title: '解围与连接', lessonIds: [
    'go.tactics.escape-atari', 'ogs-connect', 'ogs-cut',
  ] },
  { id: 'ogs-life', title: '眼形与做活', lessonIds: [
    'ogs-eyes', 'ogs-real-false-eye', 'ogs-make-alive',
  ] },
  { id: 'ogs-stage-3', title: '吃子与对杀', lessonIds: [
    'ogs-atari-correct-side', 'ogs-play_double_atari', 'ogs-ladder', 'ogs-net',
    'ogs-snapback', 'ogs-capturing_race', 'ogs-ko',
  ] },
  { id: 'ogs-endgame', title: '围地与终局', lessonIds: [
    'ogs-territory', 'ogs-close_territory', 'ogs-count-territory', 'ogs-ending-the-game',
  ] },
  { id: 'ggg-practice', title: '综合练习', lessonIds: [
    'ggg-short-reading', 'ggg-connect-live', 'ggg-capturing-race', 'ggg-snapback-cut',
  ] },
];
const introductions: Readonly<Record<string, string>> = {
  'ogs-real-false-eye': '真眼周围的棋能守住眼位；假眼周围有棋可能被提走，不能算可靠的一眼。',
  'ogs-atari-correct-side': '打吃要选好方向，限制对方接长后的出路，才有机会吃住它。',
  'ogs-play_double_atari': '一手同时打吃对方两块棋，叫双打吃。',
  'ogs-ladder': '征子是连续打吃，逼对方沿阶梯形路线逃跑；先看逃跑路上有没有接应的棋。',
  'ogs-net': '枷是先封住对方的逃跑路线，借周围棋子困住目标，不一定要立即打吃。',
  'ogs-snapback': '倒扑是先让对方提走投入的棋子，使对方整块棋只剩一气，再回提更多棋。',
  'ogs-capturing_race': '对杀是两块未活的棋互相紧气、争先提子；要算清紧对方气和增加自己气的次序。',
  'ogs-ko': '劫材是在别处制造对方需要应对的威胁，对方应手后再回来提劫；劫争也能用来争取连接和提子。',
};
export const curriculumLessons = courseUnits.flatMap(section => section.lessonIds.map(id => {
  const source = sourceLessons.find(lesson => lesson.id === id);
  if (!source) throw new Error(`Missing course lesson: ${id}`);
  // The tutorial already demonstrates immediate ko recapture. The fourth eyes
  // page gives away the false-eye answer; its independent practice follows next.
  const exercises = id === 'ogs-ko' ? source.exercises.filter(exercise => exercise.id !== 'ogs-ko-page01')
    : id === 'ogs-eyes' ? source.exercises.filter(exercise => exercise.id !== 'ogs-eyes-page04') : source.exercises;
  const first = exercises[0];
  if (!first?.position) throw new Error(`Missing course position: ${id}`);
  return { ...source, section: section.id, exercises, introduction: introductions[id],
    ...(id === 'ogs-ko' ? { title: '劫的应用', concept: '读完对方应手，练习利用劫规则连接、提子与寻找劫材。' } : {}),
    ...(exercises !== source.exercises ? { example: first.prompt,
      demonstration: { position: first.position, exposedFamilyIds: [first.familyId], steps: [{ text: first.prompt }] },
      sources: exercises.flatMap(exercise => exercise.sources ?? []) } : {}),
  };
})).map((lesson, index, lessons) => ({ ...lesson, prerequisites: index ? [lessons[index - 1].id] : [] }));
export const curriculumSections = courseUnits.map(({ id, title }) => ({ id, title }));
export const curriculumExercises = curriculumLessons.flatMap(lesson => lesson.exercises);

// Normal game coaching needs bounded general definitions, not source-page
// instructions referring to a different board or a particular marked shape.
export { curriculumConcepts } from './curriculumDrafts';

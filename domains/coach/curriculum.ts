import { sourceLessons, sourceSections } from './sourceCurriculum';
import { beginnerSourceLessonIds, tutorialContent } from './beginnerTutorial';

// Both entry points read the same beginner content. Source archives retain their
// original IDs and revisions; the advanced path omits topics taught here.
export const beginnerLessons = tutorialContent.TUTORIAL_STEPS;
const sourceKo = sourceLessons.find(lesson => lesson.id === 'ogs-ko');
if (!sourceKo) throw new Error('Missing source ko lesson');
const koExercises = sourceKo.exercises.filter(exercise => exercise.id !== 'ogs-ko-page01');
const firstKoExercise = koExercises[0];
if (!firstKoExercise?.position) throw new Error('Missing advanced ko position');
// Immediate recapture is taught in the beginner path. Retain the source's
// multi-move applications and ko-threat practice after the tactical lessons.
const koApplications = { ...sourceKo, title: '劫的应用', section: 'ogs-stage-3',
  concept: '读完对方应手，练习利用劫规则连接、提子与寻找劫材。',
  example: firstKoExercise.prompt, exercises: koExercises,
  demonstration: { position: firstKoExercise.position, exposedFamilyIds: [firstKoExercise.familyId],
    steps: [{ text: firstKoExercise.prompt }] },
  sources: koExercises.flatMap(exercise => exercise.sources ?? []) };
export const curriculumLessons = sourceLessons
  .flatMap(lesson => lesson.id === 'ogs-capturing_race' ? [lesson, koApplications]
    : beginnerSourceLessonIds.includes(lesson.id) ? [] : [lesson])
  .map((lesson, index, lessons) => ({ ...lesson, prerequisites: index ? [lessons[index - 1].id] : [] }));
const sectionTitles: Readonly<Record<string, string>> = {
  'ogs-stage-2': '棋形与死活', 'ogs-stage-3': '攻防与收官', 'ggg-practice': '综合练习',
};
export const curriculumSections = sourceSections
  .filter(section => curriculumLessons.some(lesson => lesson.section === section.id))
  .map(section => ({ ...section, title: sectionTitles[section.id] ?? section.title }));
export const curriculumExercises = curriculumLessons.flatMap(lesson => lesson.exercises);

// Normal game coaching needs bounded general definitions, not source-page
// instructions referring to a different board or a particular marked shape.
export { curriculumConcepts } from './curriculumDrafts';

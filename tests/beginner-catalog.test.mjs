import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { setup } from './helpers/learningCenter.mjs';
import { LearningCenter, Modal, ProgressBar, render, elements, text } from './helpers/learningUi.mjs';

const { beginnerLessons, curriculumLessons, curriculumExercises, curriculumSections,
  beginnerSourceLessonIds, tutorialContent, sourceLessons, sourceSections } = await loadTestModule({ contents: `
  export { beginnerLessons, curriculumLessons, curriculumExercises, curriculumSections } from './domains/coach/curriculum';
  export { beginnerSourceLessonIds, tutorialContent } from './domains/coach/beginnerTutorial';
  export { sourceLessons, sourceSections } from './domains/coach/sourceCurriculum';
` });

const advancedIds = ['ogs-real-false-eye', 'ogs-make-alive', 'ogs-atari-correct-side',
  'ogs-play_double_atari', 'ogs-ladder', 'ogs-snapback', 'ogs-net', 'ogs-count-territory',
  'ogs-close_territory', 'ogs-capturing_race', 'ogs-ko', 'ggg-short-reading', 'ggg-connect-live',
  'ggg-capturing-race', 'ggg-snapback-cut'];
const migratedIds = ['ogs-rules-intro', 'ogs-self-capture', 'ogs-eyes', 'ogs-ko', 'ogs-territory',
  'ogs-ending-the-game', 'ogs-the-board', 'ogs-count-liberties', 'ogs-count_chains', 'ogs-in_atari',
  'go.rules.capture', 'ogs-capture_chain', 'go.tactics.escape-atari', 'ogs-connect', 'ogs-cut'];

test('advanced lessons omit the migrated beginner topics while retaining original practice identities', () => {
  assert.deepEqual(curriculumLessons.map(lesson => lesson.id), advancedIds);
  assert.deepEqual([...beginnerSourceLessonIds].sort(), [...migratedIds].sort());
  assert.equal(curriculumLessons.length, 15);
  assert.equal(curriculumExercises.length, 58);
  assert.equal(new Set(curriculumExercises.map(exercise => exercise.id)).size, 58);
  for (const id of migratedIds) {
    assert.ok(sourceLessons.some(lesson => lesson.id === id), `${id}: source lesson must remain available`);
    assert.equal(curriculumLessons.some(lesson => lesson.id === id), id === 'ogs-ko', `${id}: only advanced ko applications remain`);
    assert.equal(curriculumExercises.some(exercise => exercise.skillId === id), id === 'ogs-ko', `${id}: only advanced ko applications remain`);
  }
  assert.equal(curriculumExercises.some(exercise => exercise.id === 'ogs-ko-page01'), false,
    'the introductory ko capture must not repeat in the advanced path');
  for (const lesson of curriculumLessons) {
    const source = sourceLessons.find(item => item.id === lesson.id);
    if (lesson.id !== 'ogs-ko') assert.equal(lesson.exercises, source.exercises, `${lesson.id}: preserve original exercise lists`);
    for (const exercise of lesson.exercises) assert.equal(exercise, source.exercises.find(item => item.id === exercise.id),
      `${exercise.id}: preserve source IDs, revisions and answer trees`);
    assert.equal(lesson.contentRevision, source.contentRevision);
  }
});

test('advanced ko retains its four applications and opens the first retained source page', t => {
  const lesson = curriculumLessons.find(item => item.id === 'ogs-ko');
  const source = sourceLessons.find(item => item.id === 'ogs-ko');
  assert.equal(lesson.title, '劫的应用');
  assert.equal(lesson.section, 'ogs-stage-3');
  assert.deepEqual(lesson.exercises.map(exercise => exercise.id),
    ['ogs-ko-page02', 'ogs-ko-page03', 'ogs-ko-page04', 'ogs-ko-page05']);
  assert.equal(source.exercises[0].id, 'ogs-ko-page01');
  assert.equal(source.exercises.length, 5, 'the full archived ko lesson is unchanged');
  const first = lesson.exercises[0];
  assert.equal(lesson.example, first.prompt);
  assert.equal(lesson.demonstration.position, first.position);
  assert.deepEqual(lesson.demonstration.exposedFamilyIds, [first.familyId]);
  assert.deepEqual(lesson.demonstration.steps, [{ text: first.prompt }]);
  const host = setup(t);
  host.render().view.onLesson('ogs-ko');
  assert.equal(host.render().view.activeLessonId, 'ogs-ko');
  assert.equal(host.render().view.active.title, '劫的应用');
  assert.equal(host.render().view.active.prompt, first.prompt);
});

test('beginner migration leaves the full source archive at 29 lessons and 114 pages', () => {
  assert.equal(sourceLessons.length, 29);
  assert.equal(sourceLessons.flatMap(lesson => lesson.exercises).length, 114);
  assert.deepEqual(sourceSections.map(section => section.id), ['ogs-stage-1', 'ogs-stage-2', 'ogs-stage-3', 'ggg-practice']);
  assert.equal(sourceLessons[0].id, 'ogs-rules-intro');
  assert.equal(sourceLessons.find(lesson => lesson.id === 'go.rules.capture').exercises[0].id, 'ogs-capture_stone-page01');
  assert.deepEqual(sourceLessons.find(lesson => lesson.id === 'ogs-real-false-eye').prerequisites, ['ogs-cut'],
    'advanced prerequisite repair must not mutate the archived source lesson');
});

test('advanced sections and prerequisites contain only the remaining course path', () => {
  assert.deepEqual(curriculumSections, [
    { id: 'ogs-stage-2', title: '棋形与死活' },
    { id: 'ogs-stage-3', title: '攻防与收官' },
    { id: 'ggg-practice', title: '综合练习' },
  ]);
  for (const [index, lesson] of curriculumLessons.entries()) {
    assert.deepEqual(lesson.prerequisites, index ? [advancedIds[index - 1]] : [], lesson.id);
    assert.ok(curriculumSections.some(section => section.id === lesson.section));
  }
});

test('beginner catalog metadata comes from the same 14 steps displayed by the original tutorial', t => {
  assert.equal(beginnerLessons, tutorialContent.TUTORIAL_STEPS);
  assert.equal(beginnerLessons.length, 14);
  assert.equal(new Set(beginnerLessons.map(lesson => lesson.id)).size, 14);
  const host = setup(t);
  const view = host.render().view;
  assert.deepEqual(view.beginnerLessons, beginnerLessons.map(({ id, title }) => ({ id, title })));
  assert.deepEqual(view.lessons.map(lesson => lesson.id), advancedIds,
    'beginner replay entries must not become graded advanced lessons');
});

test('the real advanced entry starts with real and false eyes instead of repeating basic rules', t => {
  const host = setup(t);
  host.render().open();
  const view = host.render().view;
  assert.equal(view.activeLessonId, 'ogs-real-false-eye');
  assert.equal(view.active.kind, 'choice');
  assert.equal(view.active.phase, 'practice');
  assert.equal(view.active.independent, true);
  assert.equal(host.record.attempts.length, 0);
  assert.equal(host.record.exposures.length, 0);
});

test('course replay opens the chosen beginner step and excludes replay entries from advanced progress', t => {
  const learning = setup(t);
  learning.render().open();
  const view = learning.render().view;
  const host = render(t, { ...view, tutorialContent }, LearningCenter);
  const top = elements(host.render()).find(node => node.props.leftButtons);
  elements(top.props.leftButtons).find(node => node.props['aria-label'] === '打开课程').props.onClick();
  const menu = elements(host.render()).find(node => node.type === Modal);
  const progressComponent = elements(menu).find(node => node.type === ProgressBar);
  const progress = ProgressBar(progressComponent.props);
  assert.equal(progress.props['aria-valuemax'], 15);
  assert.equal(progress.props['aria-valuenow'], 0);
  assert.match(text(menu), /已完成 0 \/ 15 课/);
  const beginnerSection = elements(menu).find(node => node.props['aria-labelledby'] === 'course-section-beginner');
  assert.ok(beginnerSection);
  const entries = elements(beginnerSection).filter(node => typeof node.props.onClick === 'function');
  assert.equal(entries.length, 14);
  const chosenIndex = 3;
  entries[chosenIndex].props.onClick();
  const replay = elements(host.render()).find(node => node.props.initialStepId);
  assert.ok(replay, 'the beginner entry must use the existing tutorial modal');
  assert.equal(replay.props.initialStepId, beginnerLessons[chosenIndex].id);
  assert.equal(replay.props.tutorialContent, tutorialContent);
  replay.props.onClose();
  assert.equal(elements(host.render()).find(node => node.type === Modal).props.isOpen, true);
  assert.equal(learning.render().view.activeLessonId, 'ogs-real-false-eye');
  assert.equal(learning.record.attempts.length, 0, 'opening beginner replay must not fabricate graded progress');
});

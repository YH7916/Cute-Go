import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTestModule } from './helpers/loadTestModule.mjs';
import { setup } from './helpers/learningCenter.mjs';

const { curriculumLessons, curriculumExercises, curriculumSections, sourceLessons } = await loadTestModule({ contents: `
  export { curriculumLessons, curriculumExercises, curriculumSections } from './domains/coach/curriculum';
  export { sourceLessons } from './domains/coach/sourceCurriculum';
` });
const lessonIds = curriculumLessons.map(lesson => lesson.id);
const foundations = ['ogs-count-liberties', 'ogs-in_atari', 'go.rules.capture',
  'ogs-capture_chain', 'ogs-self-capture', 'go.tactics.escape-atari', 'ogs-connect', 'ogs-cut'];
const tactics = ['ogs-atari-correct-side', 'ogs-play_double_atari', 'ogs-ladder', 'ogs-net',
  'ogs-snapback', 'ogs-capturing_race', 'ogs-ko'];

test('ordinary courses retain foundation practice before asking learners to judge eyes', () => {
  assert.deepEqual(lessonIds.slice(0, foundations.length), foundations);
  assert.deepEqual(lessonIds.slice(foundations.length, foundations.length + 3),
    ['ogs-eyes', 'ogs-real-false-eye', 'ogs-make-alive']);
  for (const id of foundations) {
    const lesson = curriculumLessons.find(item => item.id === id);
    assert.equal(lesson.exercises.length, 3, `${id}: retain the source practice boards`);
  }
});

test('group-counting questions leave the active course while their source pages and liberty practice remain', () => {
  const archived = sourceLessons.find(lesson => lesson.id === 'ogs-count_chains');
  assert.deepEqual(archived.exercises.map(exercise => exercise.id),
    ['ogs-count_chains-page01', 'ogs-count_chains-page03', 'ogs-count_chains-page06']);
  assert.equal(lessonIds.includes('ogs-count_chains'), false);
  assert.equal(curriculumExercises.some(exercise => exercise.skillId === 'ogs-count_chains'), false);
  assert.equal(curriculumLessons[0].id, 'ogs-count-liberties');
  assert.equal(curriculumLessons[0].exercises, sourceLessons.find(lesson => lesson.id === 'ogs-count-liberties').exercises);
});

test('new learners directly enter liberty practice without fabricated tutorial or exercise completion', t => {
  const host = setup(t);
  host.render().open();
  const view = host.render().view;
  assert.equal(view.activeLessonId, 'ogs-count-liberties');
  assert.equal(view.active.kind, 'choice');
  assert.equal(view.active.phase, 'practice');
  assert.equal(view.active.independent, true);
  assert.match(view.active.prompt, /几口气/);
  assert.equal(host.record.attempts.length, 0);
  assert.equal(host.record.exposures.length, 0);
});

test('eyes and ko keep practical applications without repeating their guided introduction pages', () => {
  const eyes = curriculumLessons.find(lesson => lesson.id === 'ogs-eyes');
  assert.ok(eyes, 'large-eye and two-eye practice must precede true/false-eye questions');
  assert.deepEqual(eyes.exercises.map(exercise => exercise.id),
    ['ogs-eyes-page01', 'ogs-eyes-page02', 'ogs-eyes-page03']);
  const ko = curriculumLessons.find(lesson => lesson.id === 'ogs-ko');
  assert.equal(ko.title, '劫的应用');
  assert.deepEqual(ko.exercises.map(exercise => exercise.id),
    ['ogs-ko-page02', 'ogs-ko-page03', 'ogs-ko-page04', 'ogs-ko-page05']);
  for (const lesson of [eyes, ko]) {
    const first = lesson.exercises[0];
    assert.equal(lesson.example, first.prompt);
    assert.equal(lesson.demonstration.position, first.position);
    assert.deepEqual(lesson.demonstration.exposedFamilyIds, [first.familyId]);
  }
  assert.equal(curriculumExercises.some(exercise => exercise.id === 'ogs-eyes-page04'), false);
  assert.equal(curriculumExercises.some(exercise => exercise.id === 'ogs-ko-page01'), false);
  assert.equal(lessonIds.includes('ogs-rules-intro'), false);
  assert.equal(lessonIds.includes('ogs-the-board'), false);
});

test('tactics build from chasing to special captures, then territory and integrated practice', () => {
  const start = lessonIds.indexOf('ogs-atari-correct-side');
  assert.deepEqual(lessonIds.slice(start, start + tactics.length), tactics);
  assert.deepEqual(lessonIds.slice(start + tactics.length), [
    'ogs-territory', 'ogs-close_territory', 'ogs-count-territory', 'ogs-ending-the-game',
    'ggg-short-reading', 'ggg-connect-live', 'ggg-capturing-race', 'ggg-snapback-cut',
  ]);
  assert.equal(lessonIds.length, 26);
  assert.equal(new Set(lessonIds).size, 26);
  assert.equal(curriculumExercises.length, 100);
  assert.equal(new Set(curriculumExercises.map(exercise => exercise.id)).size, 100);
});

test('sections group one continuous course path and prerequisites follow the preceding lesson', () => {
  assert.deepEqual(curriculumSections.map(section => section.title),
    ['数气与提子', '解围与连接', '眼形与做活', '吃子与对杀', '围地与终局', '综合练习']);
  const groups = curriculumSections.map(section => curriculumLessons.filter(lesson => lesson.section === section.id));
  assert.deepEqual(groups.map(group => group.length), [5, 3, 3, 7, 4, 4]);
  assert.deepEqual(groups.flat().map(lesson => lesson.id), lessonIds);
  for (const [index, lesson] of curriculumLessons.entries()) {
    assert.deepEqual(lesson.prerequisites, index ? [curriculumLessons[index - 1].id] : [], lesson.id);
  }
});

test('only concepts beyond the beginner tutorial receive a brief course introduction', () => {
  assert.deepEqual(curriculumLessons.filter(lesson => lesson.introduction).map(lesson => lesson.id),
    ['ogs-real-false-eye', ...tactics]);
  for (const lesson of curriculumLessons.filter(item => item.introduction)) {
    assert.ok(lesson.introduction.length <= 80, lesson.id);
    assert.doesNotMatch(lesson.introduction, /[A-Z]|[①②③]|[△○×]|page|第.*题/, `${lesson.id}: no answer-point disclosure`);
    assert.notEqual(lesson.introduction, lesson.exercises[0].teachingNotes);
  }
  assert.match(curriculumLessons.find(lesson => lesson.id === 'ogs-snapback').introduction, /先.*提走.*再.*提/);
  assert.match(curriculumLessons.find(lesson => lesson.id === 'ogs-ko').introduction, /劫材.*别处.*应手/);
});

test('reordering preserves source exercise identities, revisions, positions, answers and the raw archive', () => {
  assert.equal(sourceLessons.length, 29);
  assert.equal(sourceLessons.flatMap(lesson => lesson.exercises).length, 114);
  assert.equal(sourceLessons[0].id, 'ogs-rules-intro');
  assert.deepEqual(sourceLessons.find(lesson => lesson.id === 'ogs-real-false-eye').prerequisites, ['ogs-cut']);
  assert.equal(sourceLessons.find(lesson => lesson.id === 'ogs-eyes').exercises.length, 4);
  assert.equal(sourceLessons.find(lesson => lesson.id === 'ogs-ko').exercises.length, 5);
  for (const lesson of curriculumLessons) {
    const source = sourceLessons.find(item => item.id === lesson.id);
    assert.equal(lesson.skillId, source.skillId, lesson.id);
    assert.equal(lesson.contentRevision, source.contentRevision, lesson.id);
    if (!['ogs-eyes', 'ogs-ko'].includes(lesson.id)) assert.equal(lesson.exercises, source.exercises, lesson.id);
    for (const exercise of lesson.exercises) {
      assert.equal(exercise, source.exercises.find(item => item.id === exercise.id),
        `${exercise.id}: retain the original object and every field used by progress and grading`);
    }
  }
});

test('an archive-only group-counting record stays intact while opening starts active foundation practice', t => {
  const host = setup(t);
  const completed = sourceLessons.find(lesson => lesson.id === 'ogs-count_chains').exercises;
  for (const [index, exercise] of completed.entries()) {
    host.record.attempts.push({ attemptId: `previous-${index}`, sequence: index + 1,
      exerciseId: exercise.id, familyId: exercise.familyId, skillId: exercise.skillId,
      contentRevision: exercise.contentRevision, outcome: 'success', hintLevel: 0,
      occurredAt: Date.now() - 1000, source: 'course' });
  }
  const previousAttempts = structuredClone(host.record.attempts);
  host.render().open();
  const view = host.render().view;
  assert.equal(view.activeLessonId, 'ogs-count-liberties');
  assert.equal(view.lessons.some(lesson => lesson.id === 'ogs-count_chains'), false);
  assert.equal(view.lessons.every(lesson => lesson.completedSteps === 0), true,
    'archived group-counting results must not become completion credit for an active lesson');
  assert.deepEqual(host.record.attempts, previousAttempts);
  assert.equal(host.record.exposures.length, 0);
});

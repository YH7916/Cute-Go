import { foundationLessons } from './curriculumFoundations';
import { rulesLessons } from './curriculumRules';
import { territoryLessons } from './curriculumTerritory';
import { tacticsLessons } from './curriculumTactics';
import { lifeLessons } from './curriculumLife';
import { sequenceLessons } from './curriculumSequences';
import { chasingLessons } from './curriculumChasing';
import type { CurriculumLesson } from './curriculumTypes';

// Retained draft fixtures and bounded coaching concepts. These exercises are not in the learning catalog.
const lessons = [...foundationLessons, ...rulesLessons, ...territoryLessons,
  ...tacticsLessons, ...sequenceLessons, ...chasingLessons, ...lifeLessons];
const lessonOrder = [
  'go.rules.place-turn', 'go.rules.groups-liberties', 'go.rules.capture',
  'go.basics.connect', 'go.basics.atari', 'go.basics.escape',
  'go.rules.suicide', 'go.rules.ko', 'go.life.two-eyes', 'go.rules.territory-dead',
  'go.tactics.escape-atari', 'go.tactics.capture-direction', 'go.tactics.double-atari',
  'go.tactics.ladder', 'go.tactics.snapback', 'go.life.make-two-eyes',
];
export const curriculumLessons: readonly CurriculumLesson[] = lessonOrder.map(id => {
  const lesson = lessons.find(item => item.id === id);
  if (!lesson) throw new Error(`Missing curriculum lesson: ${id}`);
  return lesson;
});
export const curriculumSections = [
  { id: 'A', title: '落子、气与提子' }, { id: 'B', title: '连接、打吃与救棋' },
  { id: 'C', title: '禁入与劫' }, { id: 'D', title: '活棋与终局' },
  { id: 'E', title: '救棋与切断' }, { id: 'F', title: '连续攻防与手筋' },
] as const;
export const curriculumExercises = curriculumLessons.flatMap(item => item.exercises);
export const curriculumConcepts = curriculumLessons.map(({ id, concept, misconception }) => ({ id, concept, misconception }));

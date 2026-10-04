import { ogsLessons, ogsSections } from './sourceOgs';
import { gggLessons, gggSections } from './sourceGgg';
import type { CurriculumLesson } from './curriculumTypes';

export const sourceLessons: readonly CurriculumLesson[] = [...ogsLessons, ...gggLessons];
export const sourceSections = [...ogsSections, ...gggSections];

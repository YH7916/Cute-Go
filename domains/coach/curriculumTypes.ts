import type { Exercise, ExerciseDraft } from './exerciseTypes';
import type { GamePosition } from '../game/positionState';
import type { Point } from '../../types';
import type { MoveRejectionReason } from '../../core/go/rules';

export interface LessonDemonstration {
  position: GamePosition;
  exposedFamilyIds?: readonly string[];
  steps: readonly { point?: Point; text: string; expectedRejection?: MoveRejectionReason }[];
}
export interface LessonSource { title: string; url: string }

export type CurriculumSection = string;
export interface CurriculumLesson {
  id: string; skillId: string; section: CurriculumSection; title: string;
  concept: string; example: string; misconception: string; prerequisites: readonly string[];
  contentRevision: string; reviewStatus: 'original-draft' | 'source-adapted'; exercises: readonly Exercise[];
  validation: 'rules-checked'; demonstration: LessonDemonstration; sources: readonly LessonSource[];
}
export const CURRICULUM_REVISION = '2026-10-03.4';

export const teacherSources = {
  curriculum: { title: '日本棋院 · 入门课程教案', url: 'https://www.nihonkiin.or.jp/teach/school_teach/digest/11.html' },
  capture: { title: '日本棋院 · 提子教学', url: 'https://www.nihonkiin.or.jp/teach/school_teach/digest/04.html' },
  escape: { title: 'PANDANET · 逃子与提子连接', url: 'https://www.weiqi-pandanet.cn/howtoplaygo/03-02.htm' },
  attack: { title: 'PANDANET · 吃子方向与切断', url: 'https://www.weiqi-pandanet.cn/howtoplaygo/03-01.htm' },
  chasing: { title: 'PANDANET · 连续追吃与征子', url: 'https://www.weiqi-pandanet.cn/howtoplaygo/08-02.htm' },
  connection: { title: 'PANDANET · 连接方法', url: 'https://www.weiqi-pandanet.cn/howtoplaygo/03-03.htm' },
  eyes: { title: 'PANDANET · 两眼活棋', url: 'https://www.weiqi-pandanet.cn/howtoplaygo/05-01.htm' },
} satisfies Record<string, LessonSource>;

export function lesson(section: CurriculumSection, skill: string, title: string, concept: string, example: string,
  misconception: string, exercises: readonly [ExerciseDraft, ExerciseDraft], prerequisites: readonly string[],
  demonstration: LessonDemonstration, sources: readonly LessonSource[] = [teacherSources.curriculum],
  sameFamily = false): CurriculumLesson {
  const skillId = `go.${skill}`;
  return { id: skillId, skillId, section, title, concept, example, misconception,
    prerequisites: prerequisites.map(id => `go.${id}`), contentRevision: CURRICULUM_REVISION, reviewStatus: 'original-draft',
    validation: 'rules-checked', demonstration, sources,
    exercises: exercises.map((exercise, index) => ({ ...exercise, id: `${skillId}.${index + 1}`,
      familyId: exercise.familyId ?? `${skillId}.board-${sameFamily ? 1 : index + 1}`, skillId, contentRevision: CURRICULUM_REVISION })),
  };
}

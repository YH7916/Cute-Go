import type { GamePosition } from '../game/positionState';
import type { Player, Point } from '../../types';

export type ExerciseAnswer = { kind: 'choice'; choiceId: string } | { kind: 'point'; point: Point }
  | { kind: 'number'; value: number } | { kind: 'sequence' | 'variation'; points: readonly Point[] }
  | { kind: 'action'; action: 'pass' | 'finish' | 'remove'; points: readonly Point[] };
export interface ExerciseVariationNode {
  point: Point | null; color: Player; correct?: boolean; wrong?: boolean; text?: string;
  children: readonly ExerciseVariationNode[];
  boardMarks?: readonly { point: Point; label: string }[];
}
export interface ExerciseRefutation { after: Point; reply: Point; text: string }
export interface ExerciseSequenceStep {
  point: Point; reply?: Point; text?: string; next?: readonly ExerciseSequenceStep[];
  refutations?: readonly ExerciseRefutation[];
}
export interface ExerciseBase {
  id: string; familyId: string; skillId: string; contentRevision: string;
  prompt: string; hints: readonly [string, string]; explanation: string;
  teachingNotes?: string;
  position?: GamePosition;
  boardMarks?: readonly { point: Point; label: string }[];
  sources?: readonly { title: string; url: string }[];
  refutations?: readonly ExerciseRefutation[];
}
export type Exercise = ExerciseBase & (
  | { kind: 'choice'; choices: readonly { id: string; label: string }[]; correctChoiceId: string; correctChoiceIds?: readonly string[] }
  | { kind: 'point'; position: GamePosition; rubric:
    | { kind: 'capture'; minimum: number }
    | { kind: 'connect'; anchors: readonly [Point, Point] }
    | { kind: 'escape'; anchor: Point; minimumLiberties: number }
    | { kind: 'atari'; anchor: Point }
    | { kind: 'cut'; anchors: readonly [Point, Point] }
    | { kind: 'two-eyes'; anchor: Point }
    | { kind: 'legal' } }
  | { kind: 'sequence'; position: GamePosition; solution: readonly ExerciseSequenceStep[]; minimumCaptures: number }
  | { kind: 'variation'; position: GamePosition; solution: readonly ExerciseVariationNode[] }
  | { kind: 'action'; position: GamePosition; action: 'pass' | 'finish' | 'remove'; expectedPoints?: readonly Point[] }
  | { kind: 'number'; position: GamePosition; rubric: { kind: 'liberties'; anchor: Point } | { kind: 'territory'; color: 'black' | 'white' } }
);
export interface ExerciseGrade {
  outcome: 'success' | 'failure' | 'unverified' | 'continue'; explanation: string; nextPosition?: GamePosition;
  boardMarks?: readonly { point: Point; label: string }[];
}
export type ExerciseDraft = Omit<ExerciseBase, 'id' | 'familyId' | 'skillId' | 'contentRevision'> & { familyId?: string } & (
  | { kind: 'choice'; choices: readonly { id: string; label: string }[]; correctChoiceId: string }
  | { kind: 'point'; position: GamePosition; rubric: Extract<Exercise, { kind: 'point' }>['rubric'] }
  | { kind: 'sequence'; position: GamePosition; solution: readonly ExerciseSequenceStep[]; minimumCaptures: number }
  | { kind: 'number'; position: GamePosition; rubric: Extract<Exercise, { kind: 'number' }>['rubric'] }
);

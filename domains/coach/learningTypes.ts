import type { GamePosition } from '../game/positionState';

export type LearningOutcome = 'success' | 'failure' | 'abandoned' | 'unverified';
export type LearningSource = 'course' | 'practice' | 'review' | 'game';
interface LearningContext {
  skillId: string;
  exerciseId: string;
  familyId: string;
  contentRevision: string;
  hintLevel: number;
  occurredAt: number;
  source: LearningSource;
}
export interface LearningAttemptInput extends LearningContext {
  attemptId: string;
  outcome: LearningOutcome;
  retryOf?: string;
}
export interface LearningExposureInput extends LearningContext {
  exposureId: string;
  attemptId?: string;
}
export interface LearningAttempt extends LearningAttemptInput { sequence: number }
export interface LearningExposure extends LearningExposureInput { sequence: number }
export interface SavedLearningPosition {
  id: string;
  label: string;
  position: GamePosition;
  skillId?: string;
  createdAt: number;
}
export interface LearningRecord {
  version: 1;
  attempts: LearningAttempt[];
  exposures: LearningExposure[];
  savedPositions: SavedLearningPosition[];
}
export interface SkillProgress {
  skillId: string;
  independentSuccesses: number;
  independentFamilyIds: string[];
  retained: boolean;
  lastAttemptAt: number;
  lastOutcome: LearningOutcome;
  reviewStage: number;
  nextReviewAt: number | null;
}

export function emptyLearningRecord(): LearningRecord {
  return { version: 1, attempts: [], exposures: [], savedPositions: [] };
}

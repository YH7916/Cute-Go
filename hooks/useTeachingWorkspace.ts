import { useMemo } from 'react';
import { getDefaultKomi } from '../core/go/config';
import { coachPositionKey } from '../domains/coach/evidence';
import { collectReviewMoments, createReviewExercise } from '../domains/coach/reviewTeaching';
import type { GamePosition } from '../domains/game/positionState';
import { useLearningProgress } from './useLearningProgress';
import { useLearningCenter } from './useLearningCenter';
import { tutorialContent } from '../domains/coach/beginnerTutorial';

export function useTeachingWorkspace(ownerScopeId: string, game: GamePosition, reviewing: boolean) {
  const learning = useLearningProgress(ownerScopeId);
  const personalExercises = useMemo(() => learning.savedPositions.flatMap(saved => {
    const exercise = createReviewExercise(saved.position, saved.id);
    return exercise ? [exercise] : [];
  }), [learning.savedPositions]);
  const center = useLearningCenter(learning, personalExercises);
  const moments = useMemo(() => reviewing ? collectReviewMoments(game) : [], [game, reviewing]);
  const savePosition = (position: GamePosition) => {
    const key = coachPositionKey(position, position.currentPlayer, getDefaultKomi(position.board.length));
    const existing = learning.savedPositions.find(saved => coachPositionKey(saved.position,
      saved.position.currentPlayer, getDefaultKomi(saved.position.board.length)) === key);
    if (existing) return existing.id;
    const id = `review-${globalThis.crypto.randomUUID()}`;
    const exercise = createReviewExercise(position, id);
    const saved = learning.savePosition({ id, label: exercise?.prompt ?? `第 ${position.history.length} 手 · 复盘片段`,
      position, ...(exercise ? { skillId: exercise.skillId } : {}), createdAt: Date.now() });
    if (!saved) return null;
    // Saving follows looking at the game/review. It is useful rehearsal, not an unseen exam.
    if (exercise) learning.recordExposure({ exposureId: `${id}:review`, exerciseId: id, familyId: exercise.familyId,
      skillId: exercise.skillId, contentRevision: exercise.contentRevision, hintLevel: 1, occurredAt: Date.now(), source: 'review' });
    return id;
  };
  return { ...center, moments, savePosition, learning, tutorialContent,
    savedPositions: learning.savedPositions.map(saved => ({ ...saved,
      playable: personalExercises.some(exercise => exercise.id === saved.id) })),
  };
}

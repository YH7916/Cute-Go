import type { LearningAttempt, LearningExposure, LearningRecord, SkillProgress } from './learningTypes';

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_DAYS = [1, 3, 7, 14, 30];

export function nextLearningSequence(record: LearningRecord): number {
  return Math.max(0, ...record.attempts.map(item => item.sequence), ...record.exposures.map(item => item.sequence)) + 1;
}

function exposedBefore(exposure: LearningExposure, attempt: LearningAttempt): boolean {
  return exposure.familyId === attempt.familyId
    && (exposure.sequence < attempt.sequence || exposure.occurredAt < attempt.occurredAt);
}

// Only original attempts and hint exposure are stored. Every screen uses this
// projection; a successful retry never rewrites the learner's first response.
export function projectLearning(record: LearningRecord, now = Date.now()) {
  const progress: Record<string, SkillProgress> = Object.create(null);
  const seenFamilies = new Set<string>();
  const firstIndependent = new Map<string, number>();
  for (const attempt of [...record.attempts].sort((a, b) => a.sequence - b.sequence)) {
    const exposure = record.exposures.filter(item => exposedBefore(item, attempt));
    const independent = !seenFamilies.has(attempt.familyId) && exposure.length === 0
      && attempt.hintLevel === 0 && !attempt.retryOf;
    const skill = progress[attempt.skillId] ??= {
      skillId: attempt.skillId, independentSuccesses: 0, independentFamilyIds: [], retained: false,
      lastAttemptAt: attempt.occurredAt, lastOutcome: attempt.outcome, reviewStage: 0, nextReviewAt: null,
    };
    if (independent && attempt.outcome === 'success') {
      skill.independentSuccesses += 1;
      skill.independentFamilyIds.push(attempt.familyId);
      const first = firstIndependent.get(attempt.skillId);
      if (first !== undefined && attempt.occurredAt - first >= DAY) skill.retained = true;
      if (first === undefined) firstIndependent.set(attempt.skillId, attempt.occurredAt);
    }
    // An old exercise can advance spacing, but cannot create transfer evidence.
    // A previous answer's explanation is learning, not a hint in a later review.
    // Current hints are attributed to this attempt; callers also retain their
    // maximum hint level and retryOf across immediate retries.
    const recentHint = exposure.some(item => item.attemptId === attempt.attemptId);
    const unassisted = attempt.hintLevel === 0 && !recentHint && !attempt.retryOf;
    if (attempt.outcome === 'failure') {
      skill.reviewStage = 0;
      skill.nextReviewAt = attempt.occurredAt + DAY;
      skill.retained = false;
    } else if (attempt.outcome === 'success') {
      if (unassisted && (skill.nextReviewAt === null || attempt.occurredAt >= skill.nextReviewAt)) {
        const stage = Math.min(skill.reviewStage, REVIEW_DAYS.length - 1);
        skill.nextReviewAt = attempt.occurredAt + REVIEW_DAYS[stage] * DAY;
        skill.reviewStage = Math.min(skill.reviewStage + 1, REVIEW_DAYS.length);
      } else if (skill.nextReviewAt === null) {
        skill.nextReviewAt = attempt.occurredAt + DAY;
      }
    }
    skill.lastAttemptAt = attempt.occurredAt;
    skill.lastOutcome = attempt.outcome;
    seenFamilies.add(attempt.familyId);
  }
  return {
    progress,
    dueSkillIds: Object.values(progress).filter(item => item.nextReviewAt !== null && item.nextReviewAt <= now).map(item => item.skillId),
    mistakeSkillIds: [...new Set(record.attempts.filter(item => item.outcome === 'failure').map(item => item.skillId))],
    exposedFamilyIds: [...new Set(record.exposures.map(item => item.familyId))],
    attemptedFamilyIds: [...seenFamilies],
  };
}

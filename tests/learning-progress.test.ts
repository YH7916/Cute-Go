import assert from 'node:assert/strict';
import test from 'node:test';
import { projectLearning } from '../domains/coach/learning';
import { emptyLearningRecord } from '../domains/coach/learningTypes';
import type { LearningAttempt, LearningExposure } from '../domains/coach/learningTypes';
import { mergeLearningRecords, parseLearningBackup, parseLearningRecord } from '../domains/coach/learningValidation';
import { createInitialPosition } from '../domains/game/positionState';

const DAY = 86_400_000;
const attempt = (overrides: Partial<LearningAttempt> = {}): LearningAttempt => ({
  attemptId: 'attempt-1', skillId: 'go.liberties', exerciseId: 'exercise-1', familyId: 'family-1', contentRevision: 'v1',
  outcome: 'success', hintLevel: 0, occurredAt: 1000, source: 'practice', sequence: 1, ...overrides,
});
const exposure = (overrides: Partial<LearningExposure> = {}): LearningExposure => ({
  exposureId: 'hint-1', skillId: 'go.liberties', exerciseId: 'exercise-1', familyId: 'family-1', contentRevision: 'v1',
  hintLevel: 1, occurredAt: 500, source: 'practice', sequence: 1, ...overrides,
});

test('an exposed or previously attempted family cannot become independent by reopening it', () => {
  const record = { ...emptyLearningRecord(), exposures: [exposure()], attempts: [
    attempt({ sequence: 2, outcome: 'failure' }),
    attempt({ attemptId: 'retry-next-session', sequence: 3, occurredAt: DAY + 1000 }),
  ] };
  const { progress, exposedFamilyIds } = projectLearning(record);
  assert.equal(progress['go.liberties'].independentSuccesses, 0);
  assert.equal(progress['go.liberties'].reviewStage, 1, 'an unassisted next-day review can advance spacing');
  assert.deepEqual(exposedFamilyIds, ['family-1']);
});

test('successful old-item reviews advance intervals but never manufacture transfer evidence', () => {
  const record = emptyLearningRecord();
  let time = 1000;
  for (const [index, interval] of [1, 3, 7, 14, 30].entries()) {
    record.attempts.push(attempt({ attemptId: `a${index}`, sequence: index + 1, occurredAt: time }));
    const skill = projectLearning(record, time).progress['go.liberties'];
    assert.equal(skill.nextReviewAt, time + interval * DAY);
    assert.equal(skill.independentSuccesses, 1);
    assert.equal(skill.retained, false);
    time += interval * DAY;
  }
  assert.deepEqual(projectLearning(record, time).dueSkillIds, ['go.liberties']);
});

test('same-day successes do not consume multiple intervals and current hints block due review', () => {
  const record = { ...emptyLearningRecord(), attempts: [attempt(),
    attempt({ attemptId: 'same-day', sequence: 2, occurredAt: 2000 }),
    attempt({ attemptId: 'assisted-due', sequence: 4, occurredAt: DAY + 1000 })],
  exposures: [exposure({ sequence: 3, occurredAt: DAY + 900, attemptId: 'assisted-due' })] };
  const skill = projectLearning(record).progress['go.liberties'];
  assert.equal(skill.reviewStage, 1);
  assert.equal(skill.nextReviewAt, DAY + 1000);
});

test('retention needs a new unexposed family on a later day; failure remains in mistake history', () => {
  const record = { ...emptyLearningRecord(), attempts: [attempt(),
    attempt({ attemptId: 'transfer', familyId: 'family-2', sequence: 2, occurredAt: DAY + 1000 }),
  ] };
  assert.equal(projectLearning(record).progress['go.liberties'].retained, true);
  record.attempts.push(attempt({ attemptId: 'miss', sequence: 3, occurredAt: DAY + 2000, outcome: 'failure' }));
  assert.equal(projectLearning(record).progress['go.liberties'].retained, false);
  assert.deepEqual(projectLearning(record).mistakeSkillIds, ['go.liberties']);
});

test('unknown and abandoned outcomes do not produce success, spacing or retention', () => {
  const record = { ...emptyLearningRecord(), attempts: [attempt({ outcome: 'unverified' }),
    attempt({ attemptId: 'exit', familyId: 'other', sequence: 2, outcome: 'abandoned' })] };
  const skill = projectLearning(record).progress['go.liberties'];
  assert.equal(skill.independentSuccesses, 0);
  assert.equal(skill.nextReviewAt, null);
});

test('backup validates full positions and removes claimed answers instead of persisting rubrics', () => {
  const position = { ...createInitialPosition(9), correctChoiceId: 'invented' };
  const record = parseLearningRecord({ ...emptyLearningRecord(), savedPositions: [
    { id: 'p', label: '练习局面', position, createdAt: 1000, rubric: { kind: 'win' } },
  ] });
  assert.equal(JSON.stringify(record).includes('invented'), false);
  assert.equal(JSON.stringify(record).includes('rubric'), false);
  assert.throws(() => parseLearningRecord({ ...record, savedPositions: [{ ...record.savedPositions[0], position: { ...position, currentPlayer: 'blue' } }] }));
  assert.throws(() => parseLearningBackup('{bad-json'));
  assert.throws(() => parseLearningRecord({ ...record, version: 2 }));
  assert.throws(() => parseLearningRecord({ ...record, attempts: [attempt(), attempt({ attemptId: 'duplicate-sequence' })] }));
});

test('backup import is idempotent and refuses to overwrite the immutable first answer', () => {
  const original = parseLearningRecord({ ...emptyLearningRecord(), attempts: [attempt({ outcome: 'failure' })] });
  assert.deepEqual(mergeLearningRecords(original, original), original);
  const conflict = parseLearningRecord({ ...original, attempts: [attempt({ outcome: 'success' })] });
  assert.throws(() => mergeLearningRecords(original, conflict), /冲突/);
  assert.equal(original.attempts[0].outcome, 'failure');
});

test('merging old hint evidence cannot turn a previously exposed exercise into unseen success', () => {
  const current = parseLearningRecord({ ...emptyLearningRecord(), attempts: [attempt()] });
  const imported = parseLearningRecord({ ...emptyLearningRecord(), exposures: [exposure()] });
  assert.equal(projectLearning(mergeLearningRecords(current, imported)).progress['go.liberties'].independentSuccesses, 0);
});

test('an explanation exposed after submission does not erase an independently correct first answer', () => {
  const record = { ...emptyLearningRecord(), attempts: [attempt()], exposures: [
    exposure({ sequence: 2, occurredAt: 1001, attemptId: 'attempt-1', hintLevel: 4 }),
  ] };
  assert.equal(projectLearning(record).progress['go.liberties'].independentSuccesses, 1);
});

test('yesterday\'s answer explanation does not count as a hint in today\'s due review', () => {
  const record = { ...emptyLearningRecord(), attempts: [attempt(),
    attempt({ attemptId: 'next-day-review', sequence: 3, occurredAt: DAY + 1000, source: 'review' }),
  ], exposures: [exposure({ sequence: 2, occurredAt: 1001, attemptId: 'attempt-1', hintLevel: 4 })] };
  const skill = projectLearning(record).progress['go.liberties'];
  assert.equal(skill.reviewStage, 2);
  assert.equal(skill.nextReviewAt, 4 * DAY + 1000);
  assert.equal(skill.independentSuccesses, 1);
  assert.equal(skill.retained, false);
});

test('a current due-review hint and an immediate retry do not advance spacing', () => {
  const record = { ...emptyLearningRecord(), attempts: [attempt(),
    attempt({ attemptId: 'hinted-review', sequence: 4, occurredAt: DAY + 1000, source: 'review' }),
    attempt({ attemptId: 'instant-retry', sequence: 5, occurredAt: DAY + 1001, source: 'review', retryOf: 'hinted-review' }),
  ], exposures: [exposure({ sequence: 2, occurredAt: 1001, attemptId: 'attempt-1', hintLevel: 4 }),
    exposure({ exposureId: 'today-hint', sequence: 3, occurredAt: DAY + 900, attemptId: 'hinted-review', hintLevel: 1 })] };
  assert.equal(projectLearning(record).progress['go.liberties'].reviewStage, 1);
});

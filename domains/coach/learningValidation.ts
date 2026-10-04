import type { BoardState, HistoryItem, Point } from '../../types';
import type { GamePosition } from '../game/positionState';
import type { LearningAttemptInput, LearningExposureInput, LearningRecord, SavedLearningPosition } from './learningTypes';

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 240; }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function player(value: unknown): value is 'black' | 'white' { return value === 'black' || value === 'white'; }
function point(value: unknown, size: number): value is Point {
  return object(value) && integer(value.x) && integer(value.y) && value.x < size && value.y < size;
}
function nullablePoint(value: unknown, size: number): value is Point | null { return value === null || point(value, size); }
function board(value: unknown): value is BoardState {
  if (!Array.isArray(value) || value.length < 2 || value.length > 19) return false;
  const size = value.length;
  return value.every((row: unknown, y) => Array.isArray(row) && row.length === size && row.every((stone: unknown, x) =>
    stone === null || (object(stone) && player(stone.color) && text(stone.id) && stone.x === x && stone.y === y)));
}
function snapshot(value: unknown, size: number): value is Omit<GamePosition, 'history'> {
  return object(value) && board(value.board) && value.board.length === size && player(value.currentPlayer)
    && integer(value.blackCaptures) && integer(value.whiteCaptures) && integer(value.consecutivePasses)
    && value.consecutivePasses <= 2 && nullablePoint(value.lastMove, size);
}
function historyItem(value: unknown, size: number): value is HistoryItem {
  return object(value) && nullablePoint(value.move, size) && snapshot(value, size);
}
function gamePosition(value: unknown): value is GamePosition {
  if (!object(value) || !board(value.board)) return false;
  const size = value.board.length;
  return Array.isArray(value.history) && value.history.length <= 1000
    && value.history.every((item: unknown) => historyItem(item, size)) && snapshot(value, size);
}
function cleanSnapshot(value: Omit<GamePosition, 'history'>): Omit<GamePosition, 'history'> {
  return { board: value.board.map(row => row.map(stone => stone
    ? { color: stone.color, id: stone.id, x: stone.x, y: stone.y } : null)),
  currentPlayer: value.currentPlayer, blackCaptures: value.blackCaptures, whiteCaptures: value.whiteCaptures,
  consecutivePasses: value.consecutivePasses, lastMove: value.lastMove ? { x: value.lastMove.x, y: value.lastMove.y } : null };
}
function cleanPosition(value: GamePosition): GamePosition {
  return { ...cleanSnapshot(value), history: value.history.map(item => ({ ...cleanSnapshot(item),
    move: item.move ? { x: item.move.x, y: item.move.y } : null })) };
}
function context(value: unknown): value is Record<string, unknown> {
  return object(value) && text(value.skillId) && text(value.exerciseId) && text(value.familyId)
    && text(value.contentRevision) && integer(value.hintLevel) && value.hintLevel <= 4 && integer(value.occurredAt)
    && ['course', 'practice', 'review', 'game'].includes(String(value.source));
}
export function isLearningAttempt(value: unknown): value is LearningAttemptInput {
  return context(value) && text(value.attemptId)
    && ['success', 'failure', 'abandoned', 'unverified'].includes(String(value.outcome))
    && (value.retryOf === undefined || text(value.retryOf));
}
export function isLearningExposure(value: unknown): value is LearningExposureInput {
  return context(value) && text(value.exposureId) && integer(value.hintLevel) && value.hintLevel > 0
    && (value.attemptId === undefined || text(value.attemptId));
}
export function isSavedLearningPosition(value: unknown): value is SavedLearningPosition {
  return object(value) && text(value.id) && text(value.label) && integer(value.createdAt)
    && (value.skillId === undefined || text(value.skillId)) && gamePosition(value.position);
}

export function parseLearningRecord(value: unknown): LearningRecord {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.attempts) || !Array.isArray(value.exposures)
    || !Array.isArray(value.savedPositions) || value.attempts.length > 10000 || value.exposures.length > 20000
    || value.savedPositions.length > 100) throw new Error('学习备份格式或版本不支持。');
  const sequences = new Set<number>();
  function sequence(item: unknown): number {
    if (!object(item) || !integer(item.sequence) || item.sequence === 0 || sequences.has(item.sequence)) {
      throw new Error('学习记录序号无效或重复。');
    }
    sequences.add(item.sequence);
    return item.sequence;
  }
  const attempts = value.attempts.map((item: unknown) => {
    if (!isLearningAttempt(item)) throw new Error('作答记录无效。');
    return { attemptId: item.attemptId, skillId: item.skillId, exerciseId: item.exerciseId, familyId: item.familyId,
      contentRevision: item.contentRevision, outcome: item.outcome, hintLevel: item.hintLevel, occurredAt: item.occurredAt,
      source: item.source, ...(item.retryOf ? { retryOf: item.retryOf } : {}), sequence: sequence(item) };
  });
  const exposures = value.exposures.map((item: unknown) => {
    if (!isLearningExposure(item)) throw new Error('提示记录无效。');
    return { exposureId: item.exposureId, skillId: item.skillId, exerciseId: item.exerciseId, familyId: item.familyId,
      contentRevision: item.contentRevision, hintLevel: item.hintLevel, occurredAt: item.occurredAt, source: item.source,
      ...(item.attemptId ? { attemptId: item.attemptId } : {}), sequence: sequence(item) };
  });
  const savedPositions = value.savedPositions.map((item: unknown) => {
    if (!isSavedLearningPosition(item)) throw new Error('收藏局面无效。');
    return { id: item.id, label: item.label, position: cleanPosition(item.position), createdAt: item.createdAt,
      ...(item.skillId ? { skillId: item.skillId } : {}) };
  });
  if (new Set(attempts.map(item => item.attemptId)).size !== attempts.length
    || new Set(exposures.map(item => item.exposureId)).size !== exposures.length
    || new Set(savedPositions.map(item => item.id)).size !== savedPositions.length) throw new Error('学习记录标识重复。');
  return { version: 1, attempts, exposures, savedPositions };
}

export function parseLearningBackup(json: string): LearningRecord {
  if (json.length > 4_000_000) throw new Error('学习备份过大。');
  return parseLearningRecord(JSON.parse(json) as unknown);
}

// Import is an explicit restore. Existing immutable IDs may not be rewritten.
export function mergeLearningRecords(current: LearningRecord, incoming: LearningRecord): LearningRecord {
  const merged: LearningRecord = structuredClone(current);
  let sequence = Math.max(0, ...current.attempts.map(item => item.sequence), ...current.exposures.map(item => item.sequence));
  const events = [...incoming.attempts, ...incoming.exposures].sort((a, b) => a.sequence - b.sequence);
  for (const item of events) {
    const previous = 'attemptId' in item && 'outcome' in item
      ? current.attempts.find(entry => entry.attemptId === item.attemptId)
      : current.exposures.find(entry => entry.exposureId === item.exposureId);
    if (previous) {
      if (JSON.stringify({ ...previous, sequence: 0 }) !== JSON.stringify({ ...item, sequence: 0 })) {
        throw new Error('备份与本机的原始记录冲突，未导入。');
      }
    } else if ('outcome' in item) merged.attempts.push({ ...item, sequence: ++sequence });
    else merged.exposures.push({ ...item, sequence: ++sequence });
  }
  for (const position of incoming.savedPositions) {
    if (!merged.savedPositions.some(item => item.id === position.id)) merged.savedPositions.push(position);
  }
  return parseLearningRecord(merged);
}

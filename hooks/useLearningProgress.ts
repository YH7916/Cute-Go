import { useEffect, useRef, useState } from 'react';
import { nextLearningSequence, projectLearning } from '../domains/coach/learning';
import { emptyLearningRecord } from '../domains/coach/learningTypes';
import type { LearningAttemptInput, LearningExposureInput, LearningRecord, SavedLearningPosition } from '../domains/coach/learningTypes';
import { isLearningAttempt, isLearningExposure, isSavedLearningPosition, mergeLearningRecords,
  parseLearningBackup, parseLearningRecord } from '../domains/coach/learningValidation';
import { deleteLearningStorage, readLearningStorage, writeLearningStorage } from '../services/coach/learningStorage';

interface LearningState {
  owner: string;
  record: LearningRecord;
  loaded: boolean;
  saving: boolean;
  storageError: string;
  storageLocked: boolean;
  revision: number;
}
const STORAGE_ERROR = '课程进度尚未保存到本机；关闭页面可能丢失本次进度，请稍后重试。';
const LOAD_ERROR = '本机课程进度读取失败，已暂停保存并保留原数据。本次进度仅在当前页面有效。';
function initial(owner: string): LearningState {
  return { owner, record: emptyLearningRecord(), loaded: false, saving: false, storageError: '', storageLocked: false, revision: 0 };
}

export function useLearningProgress(ownerScopeId: string) {
  const [state, setState] = useState(() => initial(ownerScopeId));
  const current = useRef(state);
  const alive = useRef(false);
  const session = useRef(0);
  const activeOwner = useRef(ownerScopeId);
  activeOwner.current = ownerScopeId;
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    let active = true;
    session.current += 1;
    alive.current = true;
    const next = initial(ownerScopeId);
    current.current = next;
    setState(next);
    void readLearningStorage(ownerScopeId).then(value => {
      if (!active || activeOwner.current !== ownerScopeId) return;
      const record = value === undefined ? emptyLearningRecord() : parseLearningRecord(value);
      current.current = { ...next, record, loaded: true };
      setState(current.current);
    }).catch(() => {
      if (!active || activeOwner.current !== ownerScopeId) return;
      current.current = { ...next, loaded: true, storageError: LOAD_ERROR, storageLocked: true };
      setState(current.current);
    });
    return () => { active = false; alive.current = false; session.current += 1; };
  }, [ownerScopeId]);

  function available(): boolean {
    return alive.current && activeOwner.current === ownerScopeId && current.current.owner === ownerScopeId && current.current.loaded;
  }
  function commit(record: LearningRecord, remove = false): boolean {
    if (!available()) return false;
    const protectedWrite = current.current.storageLocked && !remove;
    const next = { ...current.current, record: parseLearningRecord(record), saving: !protectedWrite, revision: current.current.revision + 1 };
    current.current = next;
    setState(next);
    if (protectedWrite) return true;
    const requestSession = session.current;
    const persisted = remove ? deleteLearningStorage(ownerScopeId) : writeLearningStorage(ownerScopeId, next.record);
    void persisted.then(() => finish('')).catch(() => finish(STORAGE_ERROR));
    function finish(storageError: string) {
      if (!alive.current || activeOwner.current !== ownerScopeId || session.current !== requestSession) return;
      if (remove && !storageError && next.storageLocked && current.current !== next) {
        // Work recorded while deletion was pending stays in memory, then becomes
        // eligible for persistence only after the old data is actually removed.
        current.current = { ...current.current, storageLocked: false, storageError: '' };
        commit(current.current.record);
        return;
      }
      if (current.current !== next) return;
      current.current = { ...next, saving: false,
        storageLocked: remove && !storageError ? false : next.storageLocked,
        storageError: storageError && next.storageLocked ? `${LOAD_ERROR} 删除未完成。` : storageError };
      setState(current.current);
    }
    return true;
  }
  function recordAttempt(input: LearningAttemptInput): boolean {
    if (!available() || !isLearningAttempt(input)) return false;
    const record = current.current.record;
    if (record.attempts.length >= 10000 || record.attempts.some(item => item.attemptId === input.attemptId)) return false;
    return commit({ ...record, attempts: [...record.attempts, { ...input, sequence: nextLearningSequence(record) }] });
  }
  function recordExposure(input: LearningExposureInput): boolean {
    if (!available() || !isLearningExposure(input)) return false;
    const record = current.current.record;
    if (record.exposures.length >= 20000 || record.exposures.some(item => item.exposureId === input.exposureId)) return false;
    return commit({ ...record, exposures: [...record.exposures, { ...input, sequence: nextLearningSequence(record) }] });
  }
  function savePosition(input: SavedLearningPosition): boolean {
    if (!available() || !isSavedLearningPosition(input)) return false;
    const record = current.current.record;
    if (record.savedPositions.length >= 100 || record.savedPositions.some(item => item.id === input.id)) return false;
    return commit({ ...record, savedPositions: [...record.savedPositions, structuredClone(input)] });
  }
  function removePosition(id: string): void {
    if (!available()) return;
    const record = current.current.record;
    commit({ ...record, savedPositions: record.savedPositions.filter(item => item.id !== id) });
  }
  function exportBackup(): string {
    if (!available()) throw new Error('学习记录仍在加载，请稍后导出。');
    return JSON.stringify(current.current.record, null, 2);
  }
  function importBackup(json: string): void {
    if (!available()) throw new Error('学习记录仍在加载，请稍后导入。');
    commit(mergeLearningRecords(current.current.record, parseLearningBackup(json)));
  }
  function deleteProgress(): void { if (available()) commit(emptyLearningRecord(), true); }
  const visible = state.owner === ownerScopeId ? state : initial(ownerScopeId);
  return {
    ...projectLearning(visible.record, now), ...visible.record,
    loaded: visible.loaded, saving: visible.saving, storageError: visible.storageError,
    recordAttempt, recordExposure, savePosition, removePosition, exportBackup, importBackup, deleteProgress,
  };
}

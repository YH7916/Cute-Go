import { loadTestModule } from './loadTestModule.mjs';

const { useLearningCenter, renderHook, projectLearning, curriculumLessons, curriculumExercises, exercisePosition, inspectMove } = await loadTestModule({ reactHost: true, contents: `
  export { useLearningCenter } from './hooks/useLearningCenter';
  export { renderHook } from './tests/helpers/reactHooks';
  export { projectLearning } from './domains/coach/learning';
  export { curriculumLessons, curriculumExercises } from './domains/coach/curriculum';
  export { exercisePosition } from './domains/coach/exercise';
  export { inspectMove } from './core/go/rules';
` });

export { curriculumLessons, curriculumExercises, exercisePosition, inspectMove };
export const capture = { id: 'personal-capture', familyId: 'capture-fixture', skillId: 'go.rules.capture', contentRevision: 'test.1',
  kind: 'point', position: exercisePosition(['.X...', 'XOX..', '.....', '.....', '.....']), rubric: { kind: 'capture', minimum: 1 },
  prompt: '黑先，提走白棋。', hints: ['找白棋相邻空点。', '白棋下面是最后一气。'], explanation: '填住最后一气后，白棋被提走。' };
export const sequence = { ...capture, id: 'personal-sequence', familyId: 'sequence-fixture', kind: 'sequence', minimumCaptures: 2,
  position: exercisePosition(['.X.X.', 'XOXOX', '.....', '.....', '.....']),
  solution: [{ point: { x: 1, y: 2 }, reply: { x: 4, y: 4 }, text: '白走后，继续提另一颗白子。', next: [{ point: { x: 3, y: 2 } }] }] };

export function setup(t, personal = [capture, sequence]) {
  let record = { version: 1, attempts: [], exposures: [], savedPositions: [] };
  let loaded = true;
  const events = [], imports = [];
  const learning = () => ({ ...record, ...projectLearning(record, Date.now()), loaded, saving: false, storageError: '',
    recordAttempt: item => {
      if (!loaded || record.attempts.some(old => old.attemptId === item.attemptId)) return false;
      events.push('attempt'); record.attempts.push({ ...item, sequence: events.length }); return true;
    },
    recordExposure: item => {
      if (!loaded) return false;
      events.push('exposure'); record.exposures.push({ ...item, sequence: events.length }); return true;
    },
    savePosition: () => true, removePosition: () => {}, exportBackup: () => JSON.stringify(record),
    importBackup: json => { imports.push(json); }, deleteProgress: () => { record = { version: 1, attempts: [], exposures: [], savedPositions: [] }; },
  });
  const host = renderHook(() => useLearningCenter(learning(), personal));
  t.after(() => host.unmount());
  return { ...host, get record() { return record; }, events, imports, setLoaded: value => { loaded = value; } };
}

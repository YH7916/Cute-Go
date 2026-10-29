import { useEffect, useMemo, useRef, useState } from 'react';
import { curriculumExercises, curriculumLessons, curriculumSections } from '../domains/coach/curriculum';
import type { Exercise } from '../domains/coach/exerciseTypes';
import type { LearningSource } from '../domains/coach/learningTypes';
import { useLearningPractice } from './useLearningPractice';
import type { useLearningProgress } from './useLearningProgress';

const NO_EXERCISES: readonly Exercise[] = [];
type LearningFilter = 'all' | 'mistakes' | 'due' | 'personal';

export function useLearningCenter(learning: ReturnType<typeof useLearningProgress>, personalExercises: readonly Exercise[] = NO_EXERCISES) {
  const [isOpen, setOpenState] = useState(false);
  const opened = useRef(false);
  function setOpen(value: boolean) { opened.current = value; setOpenState(value); }
  const [filter, setFilter] = useState<LearningFilter>('all');
  const [message, setMessage] = useState('');
  const [deletePending, setDeletePending] = useState(false);
  const catalog = useMemo(() => [...curriculumExercises, ...personalExercises.filter(item =>
    !curriculumExercises.some(course => course.id === item.id))], [personalExercises]);
  const catalogRef = useRef(catalog);
  catalogRef.current = catalog;
  const loaded = useRef(learning.loaded);
  const importGeneration = useRef(0);
  const actionGeneration = useRef(0);
  const pendingOpen = useRef(false);
  const previouslyLoaded = useRef(learning.loaded);
  function invalidateActions() { actionGeneration.current += 1; importGeneration.current += 1; }
  if (loaded.current && !learning.loaded) invalidateActions();
  loaded.current = learning.loaded;
  const renderGeneration = actionGeneration.current;
  function bindAction<Args extends unknown[]>(action: (...args: Args) => void) {
    return (...args: Args) => { if (renderGeneration === actionGeneration.current) action(...args); };
  }
  const practice = useLearningPractice(learning, {
    canAct: () => renderGeneration === actionGeneration.current && opened.current && loaded.current,
    bindAction, invalidateActions, onMessage: setMessage, onOpenExercise: openExercise, onNext: nextExercise,
  });
  useEffect(() => {
    if (!learning.loaded) {
      importGeneration.current += 1; practice.clear(); setMessage(''); setDeletePending(false);
      if (previouslyLoaded.current) { pendingOpen.current = false; setOpen(false); }
    }
    else if (pendingOpen.current) { pendingOpen.current = false; open(); }
    previouslyLoaded.current = learning.loaded;
  }, [learning.loaded]);
  useEffect(() => () => { invalidateActions(); loaded.current = false; opened.current = false; }, []);

  function openExercise(id: string, source: LearningSource = 'review', retryOf?: string): boolean {
    const exercise = catalogRef.current.find(item => item.id === id);
    if (!exercise || !loaded.current) return false;
    practice.begin(exercise, source, retryOf);
    if (source === 'course') learning.setCourseCursor({ exerciseId: exercise.id,
      contentRevision: exercise.contentRevision, completed: false, updatedAt: Date.now() });
    setOpen(true); setMessage(''); setDeletePending(false);
    return true;
  }
  function chooseExercise(skillId: string, omitId?: string, courseOnly = false): Exercise | undefined {
    const candidates = (courseOnly ? curriculumExercises : catalog).filter(item => item.skillId === skillId && item.id !== omitId);
    if (courseOnly) return candidates.find(item => !learning.attempts.some(attempt => attempt.exerciseId === item.id
      && attempt.contentRevision === item.contentRevision && attempt.outcome === 'success')) ?? candidates[0];
    return candidates.find(item => !learning.exposedFamilyIds.includes(item.familyId) && !learning.attemptedFamilyIds.includes(item.familyId))
      ?? candidates.find(item => !learning.exposedFamilyIds.includes(item.familyId)) ?? candidates[0];
  }
  function openLesson(id: string) {
    const exercise = chooseExercise(id, undefined, true);
    const lesson = curriculumLessons.find(item => item.id === id);
    if (!exercise || !lesson || !loaded.current) return;
    openExercise(exercise.id, filter === 'all' ? 'course' : 'practice');
  }
  function open() {
    practice.leave();
    setOpen(true); setDeletePending(false); setFilter('all');
    if (!loaded.current) { pendingOpen.current = true; return; }
    const cursor = learning.courseCursor;
    let index = curriculumExercises.findIndex(item => item.id === cursor?.exerciseId && item.contentRevision === cursor.contentRevision);
    let completed = cursor?.completed ?? false;
    if (index < 0) {
      const last = [...learning.attempts].sort((a, b) => b.sequence - a.sequence).find(attempt => attempt.source === 'course'
        && curriculumExercises.some(item => item.id === attempt.exerciseId && item.contentRevision === attempt.contentRevision));
      index = curriculumExercises.findIndex(item => item.id === last?.exerciseId);
      completed = last?.outcome === 'success';
    }
    if (index < 0) { startCourse(); return; }
    const next = curriculumExercises[index + Number(completed)];
    if (next) openExercise(next.id, 'course');
    else finishCourse();
  }
  function startCourse() {
    if (!loaded.current || !opened.current) return;
    const next = curriculumLessons.find(lesson => lesson.exercises.some(exercise => !learning.attempts.some(attempt =>
      attempt.exerciseId === exercise.id && attempt.contentRevision === exercise.contentRevision && attempt.outcome === 'success')))
      ?? curriculumLessons[0];
    if (next) openExercise(chooseExercise(next.skillId, undefined, true)?.id ?? next.exercises[0].id, 'course');
  }
  function nextExercise(exercise: Exercise, source: LearningSource): void {
    const lesson = curriculumLessons.find(item => item.skillId === exercise.skillId);
    const next = source === 'course' ? lesson?.exercises[lesson.exercises.findIndex(item => item.id === exercise.id) + 1]
      : chooseExercise(exercise.skillId, exercise.id);
    if (next) openExercise(next.id, source);
    else if (source === 'course' && lesson && curriculumLessons.indexOf(lesson) < curriculumLessons.length - 1) {
      openExercise(curriculumLessons[curriculumLessons.indexOf(lesson) + 1].exercises[0].id, source);
    } else finishCourse();
  }
  function finishCourse() { practice.leave(); setMessage('这一轮练习完成了。可以选一课复习，或返回首页进入陪练实战。'); }
  function close() { pendingOpen.current = false; practice.leave(); setOpen(false); setDeletePending(false); }
  function exportBackup() {
    try {
      const url = URL.createObjectURL(new Blob([learning.exportBackup()], { type: 'application/json' }));
      const anchor = document.createElement('a'); anchor.href = url;
      anchor.download = `cute-go-learning-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0); setMessage('已导出学习记录和收藏局面。');
    } catch { setMessage('暂时无法导出，请等待记录加载后再试。'); }
  }
  async function importBackup(file: File) {
    const importFor = learning.importBackup;
    const generation = ++importGeneration.current;
    try {
      if (file.size > 4_000_000) throw new Error('Too large');
      const json = await file.text();
      if (generation !== importGeneration.current || !loaded.current) return;
      importFor(json); setMessage('已合并备份；重复记录不会重复计数。');
    } catch { if (generation === importGeneration.current) setMessage('未能导入，请选择有效的围棋学习备份（不超过 4 MB）。'); }
  }
  function deleteProgress() {
    if (!deletePending) { setDeletePending(true); return; }
    importGeneration.current += 1;
    practice.leave(); learning.deleteProgress(); setDeletePending(false); setMessage('已请求清空当前档案的学习记录；正在写入本机。');
  }
  const visibleLessons = curriculumLessons.filter(item => filter === 'all' || filter === 'personal'
    || (filter === 'mistakes' ? learning.mistakeSkillIds : learning.dueSkillIds).includes(item.skillId));
  const completedCourse = curriculumExercises.every(exercise => learning.attempts.some(attempt =>
    attempt.exerciseId === exercise.id && attempt.contentRevision === exercise.contentRevision && attempt.outcome === 'success'));
  const startedCourse = learning.attempts.some(attempt => curriculumExercises.some(exercise =>
    attempt.exerciseId === exercise.id && attempt.contentRevision === exercise.contentRevision));
  const view = {
    isOpen, onClose: bindAction(close), loaded: learning.loaded, filter,
    onStartCourse: bindAction(startCourse),
    startCourseLabel: completedCourse ? '从头练习' as const : startedCourse ? '继续学习' as const : '从基础开始' as const,
    onFilter: bindAction((value: LearningFilter) => { practice.leave(); setFilter(value); setDeletePending(false); }), sections: curriculumSections,
    lessons: visibleLessons.map(item => {
      const attempts = learning.attempts.filter(attempt => attempt.skillId === item.skillId && attempt.contentRevision === item.contentRevision);
      const completedSteps = item.exercises.filter(exercise => learning.attempts.some(attempt =>
        attempt.exerciseId === exercise.id && attempt.contentRevision === exercise.contentRevision && attempt.outcome === 'success')).length;
      return { id: item.id, section: item.section, title: item.title,
        completedSteps, totalSteps: item.exercises.length,
        status: completedSteps === item.exercises.length
          ? '练习通过' : attempts.length ? '练习中' : '未练',
        prerequisites: item.prerequisites.map(id => curriculumLessons.find(entry => entry.skillId === id)?.title ?? id).join('、') };
    }), onLesson: bindAction(openLesson),
    onPersonal: bindAction((id: string) => { openExercise(id); }), active: practice.activeView, activeLessonId: practice.activeView?.lessonId,
    notice: learning.storageError || message,
    onExport: bindAction(exportBackup), onImport: bindAction((file: File) => { void importBackup(file); }), onDelete: bindAction(deleteProgress), deletePending,
  };
  return { isOpen, isActive: () => opened.current, open: bindAction(open), close: bindAction(close),
    openExercise: (id: string, source?: LearningSource, retryOf?: string) =>
      renderGeneration === actionGeneration.current && openExercise(id, source, retryOf), view };
}

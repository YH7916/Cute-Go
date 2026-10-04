import { useEffect, useMemo, useRef, useState } from 'react';
import { getBoardHash, getGroup } from '../core/board';
import { inspectMove } from '../core/go/rules';
import { curriculumLessons } from '../domains/coach/curriculum';
import { applyExerciseGrade, gradeExercise } from '../domains/coach/exercise';
import { createExerciseDemonstration, getExerciseGuidance, playExerciseExploration } from '../domains/coach/exerciseInteraction';
import type { Exercise, ExerciseAnswer, ExerciseGrade } from '../domains/coach/exerciseTypes';
import type { LearningSource } from '../domains/coach/learningTypes';
import { undoPosition, type GamePosition } from '../domains/game/positionState';
import type { Point } from '../types';
import type { useLearningProgress } from './useLearningProgress';

interface PracticeSession {
  exercise: Exercise; source: LearningSource; attemptId: string; retryOf?: string;
  answer: ExerciseAnswer | null; numberText: string; hintLevel: number;
  grade: ExerciseGrade | null; position?: GamePosition; hintCount: number; explanationVisible: boolean;
  eligibleIndependent: boolean;
  phase: 'demonstration' | 'practice' | 'feedback'; demoIndex: number;
  moves: readonly Point[]; continuation: string;
  previous: PracticeSession | null; demoReturn?: PracticeSession; focusPoint?: Point; observation?: string;
  replyKey?: string;
  boardMarks?: Exercise['boardMarks'];
}

interface LearningPracticeOptions {
  canAct(): boolean;
  bindAction<Args extends unknown[]>(action: (...args: Args) => void): (...args: Args) => void;
  invalidateActions(): void;
  onMessage(message: string): void;
  onOpenExercise(id: string, source?: LearningSource, retryOf?: string): boolean;
  onNext(exercise: Exercise, source: LearningSource): void;
}

// Owns one isolated practice and its undo/demo snapshots. The center supplies
// the same generation/open/load guard used by directory and record actions.
export function useLearningPractice(learning: ReturnType<typeof useLearningProgress>, options: LearningPracticeOptions) {
  const [session, setSession] = useState<PracticeSession | null>(null);
  const latest = useRef(session);
  latest.current = session;
  const demonstration = useMemo(() => session ? createExerciseDemonstration(session.exercise) : [], [session?.exercise]);
  useEffect(() => () => { latest.current = null; }, []);
  function update(next: PracticeSession | null) { latest.current = next; setSession(next); }
  function context(current: PracticeSession) {
    const { exercise } = current;
    return { skillId: exercise.skillId, exerciseId: exercise.id, familyId: exercise.familyId,
      contentRevision: exercise.contentRevision, hintLevel: current.hintLevel, occurredAt: Date.now(), source: current.source };
  }
  function active(): PracticeSession | null {
    return options.canAct() && latest.current === session ? session : null;
  }
  function leave() {
    options.invalidateActions();
    const saved = latest.current;
    const current = saved?.demoReturn ? { ...saved.demoReturn, hintLevel: saved.hintLevel } : saved;
    if (current?.phase === 'practice' && !current.grade) learning.recordAttempt({ ...context(current), attemptId: current.attemptId, outcome: 'abandoned', retryOf: current.retryOf });
    update(null);
  }
  function begin(exercise: Exercise, source: LearningSource, retryOf?: string) {
    const eligibleIndependent = !retryOf && !learning.attemptedFamilyIds.includes(exercise.familyId)
      && !learning.exposedFamilyIds.includes(exercise.familyId) && latest.current?.exercise.familyId !== exercise.familyId;
    leave();
    update({ exercise, source, attemptId: crypto.randomUUID(), retryOf, answer: null, numberText: '', hintLevel: 0,
      grade: null, position: exercise.position, hintCount: 0, explanationVisible: false, eligibleIndependent,
      phase: 'practice', demoIndex: 0, moves: [], continuation: '', previous: null, boardMarks: exercise.boardMarks });
  }
  function clear() { update(null); }
  function demonstrate(current: PracticeSession) {
    if (!demonstration.length) return;
    if (!learning.recordExposure({ ...context(current), hintLevel: 3, exposureId: crypto.randomUUID(), attemptId: current.attemptId })) {
      options.onMessage('示范尚未记入学习记录，请稍后再试。'); return;
    }
    update({ ...current, phase: 'demonstration', demoIndex: 0, position: demonstration[0].position,
      hintLevel: 3, eligibleIndependent: false, grade: null, demoReturn: current, observation: '', focusPoint: undefined, replyKey: undefined });
  }
  function showDemonstration() {
    const current = active();
    if (!current || current.phase === 'demonstration') return;
    demonstrate(current);
  }
  function returnFromDemo() {
    const current = active();
    if (current?.phase !== 'demonstration' || !current.demoReturn) return;
    update({ ...current.demoReturn, hintLevel: Math.max(3, current.demoReturn.hintLevel), eligibleIndependent: false, replyKey: undefined });
  }
  function continueLesson() {
    const current = active();
    if (!current) return;
    if (current.phase === 'feedback') {
      if (current.grade?.outcome !== 'success') options.onOpenExercise(current.exercise.id, current.source, current.attemptId);
      else nextExercise();
      return;
    }
    if (current.phase !== 'demonstration') return;
    const step = demonstration[current.demoIndex + 1];
    if (!step) { returnFromDemo(); return; }
    update({ ...current, position: step.position, demoIndex: current.demoIndex + 1, observation: '', focusPoint: undefined });
  }
  function showHint() {
    let current = active();
    if (current?.phase === 'feedback' && current.grade?.outcome !== 'success'
      && (current.exercise.kind === 'number' || current.exercise.kind === 'choice' || current.exercise.kind === 'action')) {
      current = { ...current, phase: 'practice', grade: null, attemptId: crypto.randomUUID(), retryOf: current.attemptId,
        eligibleIndependent: false, hintLevel: Math.max(1, current.hintLevel) };
    }
    if (!current || current.phase !== 'practice' || current.grade || current.hintCount >= 2) return;
    const hintCount = current.hintCount + 1;
    const hintLevel = Math.max(current.hintLevel, hintCount);
    if (!learning.recordExposure({ ...context(current), hintLevel, exposureId: crypto.randomUUID(), attemptId: current.attemptId })) {
      options.onMessage('提示尚未记入学习记录，请稍后再试。'); return;
    }
    update({ ...current, hintLevel, hintCount, observation: '', explanationVisible: false });
  }
  function showExplanation() {
    const current = active();
    if (!current) return;
    if (current.explanationVisible) { update({ ...current, explanationVisible: false }); return; }
    if (!current.grade && !learning.recordExposure({ ...context(current), hintLevel: 3,
      exposureId: crypto.randomUUID(), attemptId: current.attemptId })) {
      options.onMessage('讲解尚未记入学习记录，请稍后再试。'); return;
    }
    update({ ...current, explanationVisible: true, observation: '', hintLevel: current.grade ? current.hintLevel : Math.max(3, current.hintLevel) });
  }
  function submitAnswer(current: PracticeSession, answer: ExerciseAnswer) {
    if (current.phase !== 'practice' || current.grade) return;
    const graded = gradeExercise(current.exercise, answer);
    const boardAnswer = answer.kind === 'point' || answer.kind === 'sequence' || answer.kind === 'variation';
    const grade = boardAnswer && (graded.outcome === 'failure' || graded.outcome === 'unverified')
      ? { ...graded, explanation: graded.outcome === 'unverified'
        ? '这步暂不能判定，请重试或悔棋。'
        : `${graded.explanation}\n请重试或悔棋。` } : graded;
    let position = current.position;
    if (position) applyExerciseGrade({ readPosition: () => position!, writePosition: next => { position = typeof next === 'function' ? next(position!) : next; } },
      { ...current.exercise, position } as Exercise, grade);
    const moves = answer.kind === 'sequence' || answer.kind === 'variation' ? answer.points : current.moves;
    const next = { ...current, answer, position, moves, previous: current, hintCount: 0, boardMarks: grade.boardMarks ?? current.boardMarks,
      observation: '', focusPoint: undefined, explanationVisible: false,
      replyKey: position && current.position && position.history.length >= current.position.history.length + 2 ? crypto.randomUUID() : undefined };
    if (grade.outcome === 'continue') {
      update({ ...next, continuation: grade.explanation }); return;
    }
    if (!learning.recordAttempt({ ...context(current), attemptId: current.attemptId, outcome: grade.outcome, retryOf: current.retryOf })) {
      options.onMessage('本次作答尚未记入学习记录，请稍后再试。'); return;
    }
    // Feedback exposes this family only after recording the first unaided response.
    learning.recordExposure({ ...context(current), hintLevel: 4, exposureId: crypto.randomUUID(), attemptId: current.attemptId });
    update({ ...next, grade, phase: 'feedback' });
  }
  function submit() {
    const current = active();
    if (current?.answer) submitAnswer(current, current.answer);
  }
  function play(x: number, y: number) {
    const current = active();
    if (!current?.position || current.phase !== 'practice') return;
    if (current.position.board[y]?.[x]) { inspect(x, y); return; }
    if (current.exercise.kind !== 'point' && current.exercise.kind !== 'sequence' && current.exercise.kind !== 'variation') return;
    const previous = current.position.history.at(-1);
    const legal = inspectMove(current.position.board, x, y, current.position.currentPlayer, 'Go', previous ? getBoardHash(previous.board) : null);
    if (!legal.legal) {
      const rejected = playExerciseExploration(current.position, { x, y }, current.position.currentPlayer);
      update({ ...current, observation: rejected.explanation, focusPoint: undefined }); return;
    }
    if (current.exercise.kind === 'point') submitAnswer(current, { kind: 'point', point: { x, y } });
    if (current.exercise.kind === 'sequence') submitAnswer(current, { kind: 'sequence', points: [...current.moves, { x, y }] });
    if (current.exercise.kind === 'variation') submitAnswer(current, { kind: 'variation', points: [...current.moves, { x, y }] });
  }
  function undo() {
    const current = active();
    if (!current) return;
    if (current.phase === 'demonstration') {
      if (current.demoIndex > 0) update({ ...current, demoIndex: current.demoIndex - 1,
        position: demonstration[current.demoIndex - 1].position, observation: '', focusPoint: undefined });
      return;
    }
    if (!current.previous) return;
    if (!learning.recordExposure({ ...context(current), hintLevel: 1, exposureId: crypto.randomUUID(), attemptId: current.attemptId })) return;
    update({ ...current.previous, eligibleIndependent: false, hintLevel: Math.max(1, current.hintLevel),
      attemptId: current.grade && !current.previous.grade ? crypto.randomUUID() : current.attemptId,
      retryOf: current.grade && !current.previous.grade ? current.attemptId : current.retryOf, observation: '', focusPoint: undefined, replyKey: undefined });
  }
  function inspect(x: number, y: number) {
    const current = active();
    if (!current?.position?.board[y]?.[x]) return;
    const group = getGroup(current.position.board, { x, y });
    if (!group) return;
    if (current.exercise.kind === 'action' && current.exercise.action === 'remove'
      && current.phase !== 'demonstration' && current.grade?.outcome !== 'success') {
      const selected = current.answer?.kind === 'action' ? current.answer.points : [];
      const includes = (point: Point) => group.stones.some(stone => stone.x === point.x && stone.y === point.y);
      const points = selected.some(includes) ? selected.filter(point => !includes(point))
        : [...selected, ...group.stones.map(({ x: sx, y: sy }) => ({ x: sx, y: sy }))];
      setAnswer({ kind: 'action', action: 'remove', points });
      return;
    }
    if (!current.grade && current.phase === 'practice') learning.recordExposure({ ...context(current), hintLevel: 1,
      exposureId: crypto.randomUUID(), attemptId: current.attemptId });
    update({ ...current, focusPoint: { x, y }, hintLevel: Math.max(1, current.hintLevel),
      observation: `这块${group.stones[0].color === 'black' ? '黑' : '白'}棋有 ${group.stones.length} 颗棋子，共 ${group.liberties} 气。沿着亮起的线找空点；同一个空点只数一次。`, explanationVisible: false });
  }
  function setAnswer(answer: ExerciseAnswer, numberText = '') {
    const current = active();
    if (!current || current.phase === 'demonstration' || current.grade?.outcome === 'success') return;
    update({ ...current, answer, numberText, phase: 'practice', grade: null, observation: '',
      ...(current.grade ? { attemptId: crypto.randomUUID(), retryOf: current.attemptId,
        eligibleIndependent: false, hintLevel: Math.max(1, current.hintLevel) } : {}) });
  }
  function retry() {
    const current = active();
    if (current && options.onOpenExercise(current.exercise.id, current.source, current.attemptId) && latest.current) {
      update({ ...latest.current, hintLevel: current.hintLevel });
    }
  }
  function performAction() {
    const current = active();
    if (!current || current.exercise.kind !== 'action') return;
    const points = current.answer?.kind === 'action' ? current.answer.points : [];
    submitAnswer(current, { kind: 'action', action: current.exercise.action, points });
  }
  function nextExercise() {
    const current = active();
    if (current) options.onNext(current.exercise, current.source);
  }
  const lesson = session ? curriculumLessons.find(item => item.skillId === session.exercise.skillId) : undefined;
  const guidance = useMemo(() => session ? getExerciseGuidance(session.exercise, session.moves, session.position, session.hintCount)
    : { hint: '', points: [] }, [session?.exercise, session?.moves, session?.position, session?.hintCount]);
  const instruction = session?.phase === 'demonstration' ? demonstration[session.demoIndex]?.text ?? ''
    : session?.explanationVisible ? session.exercise.teachingNotes
      ?? [lesson?.concept, lesson?.misconception, session.exercise.prompt].filter(Boolean).join('\n')
      : session?.observation || (session?.grade?.explanation ?? (session?.continuation || (lesson?.reviewStatus === 'source-adapted'
          ? session?.exercise.prompt : [lesson?.concept, session?.exercise.prompt].filter(Boolean).join('\n'))));
  const activeView = session ? {
    phase: session.phase, lastMove: session.position?.lastMove ?? null,
    blackCaptures: session.position?.blackCaptures ?? 0, whiteCaptures: session.position?.whiteCaptures ?? 0,
    replyKey: session.replyKey, replyPreview: session.replyKey && session.position ? undoPosition(session.position, 1) : undefined,
    instruction: instruction ?? '',
    continueLabel: session.phase === 'demonstration'
      ? (session.demoIndex + 1 < demonstration.length ? '下一手' : '回到练习')
      : session.grade?.outcome === 'success' ? '继续学习' : '再试一次',
    onContinue: continueLesson, onUndo: undo,
    onDemonstrate: demonstration.length ? showDemonstration : undefined,
    onReturnFromDemo: returnFromDemo, demoStep: session.demoIndex + 1, demoTotal: demonstration.length,
    canUndo: session.phase === 'demonstration' ? session.demoIndex > 0 : !!session.previous,
    onInspect: inspect, focusPoint: session.focusPoint,
    boardMarks: session.phase === 'demonstration' ? demonstration[session.demoIndex]?.boardMarks ?? session.exercise.boardMarks : session.boardMarks,
    markers: session.phase !== 'demonstration' && session.answer?.kind === 'action' ? session.answer.points
      : session.phase === 'demonstration' ? demonstration[session.demoIndex]?.points ?? []
      : session.phase === 'practice' ? guidance.points : [],
    lessonProgress: lesson ? `第 ${curriculumLessons.indexOf(lesson) + 1} / ${curriculumLessons.length} 课 · 第 ${lesson.exercises.findIndex(item => item.id === session.exercise.id) + 1} / ${lesson.exercises.length} 题` : '我的复盘练习',
    turnLabel: session.phase === 'demonstration' ? '本题示范'
      : session.grade?.outcome === 'success' ? '本题完成' : session.grade && ['point', 'sequence', 'variation'].includes(session.exercise.kind) ? '请重试或悔棋'
        : session.exercise.kind === 'choice' || session.exercise.kind === 'number' ? '观察棋盘后作答'
        : session.exercise.kind === 'action' ? session.exercise.action === 'remove' ? '点选死子' : '一起收官' : `你执${session.exercise.position?.currentPlayer === 'white' ? '白' : '黑'}`,
    lessonId: lesson?.id,
    title: lesson?.title ?? '我的复盘练习', concept: lesson?.concept, example: lesson?.example, misconception: lesson?.misconception,
    prompt: session.exercise.prompt, kind: session.exercise.kind, board: session.position?.board,
    currentPlayer: session.position?.currentPlayer ?? 'black' as const, selectedPoint: session.answer?.kind === 'point' ? session.answer.point : null,
    choices: session.exercise.kind === 'choice' ? session.exercise.choices : [],
    selectedChoice: session.answer?.kind === 'choice' ? session.answer.choiceId : '', numberAnswer: session.numberText,
    numberUnit: session.exercise.kind === 'number' && session.exercise.rubric.kind === 'territory' ? '目' : '气',
    hint: guidance.hint, hintLevel: session.hintCount, result: session.grade,
    explanationVisible: session.explanationVisible, onExplanation: showExplanation,
    independent: session.eligibleIndependent && session.hintLevel === 0,
    onChoice: (choiceId: string) => setAnswer({ kind: 'choice', choiceId }),
    actionLabel: session.exercise.kind === 'action' ? session.exercise.action === 'pass' ? '停一手'
      : session.exercise.action === 'finish' ? '结束对局' : '选好了' : undefined,
    actionSelectionCount: session.exercise.kind === 'action' && session.exercise.action === 'remove'
      ? session.answer?.kind === 'action' ? session.answer.points.length : 0 : undefined,
    onAction: performAction,
    onPoint: play,
    onNumber: (value: string) => {
      const current = active();
      if (!current || current.phase === 'demonstration' || current.grade?.outcome === 'success') return;
      const number = value.trim() === '' ? NaN : Number(value);
      if (Number.isInteger(number) && number >= 0) setAnswer({ kind: 'number', value: number }, value);
      else update({ ...current, numberText: value, answer: null });
    },
    onHint: showHint, onSubmit: submit, onRetry: retry,
    onNext: nextExercise, onBack: options.bindAction(leave), canSubmit: !!session.answer && learning.loaded,
  } : null;
  return { activeView, begin, leave, clear };
}

import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Check, ChevronRight, Home, X } from 'lucide-react';
import { Button, Modal, Panel, ProgressBar, Toast } from '../../ui/common';
import { GameBoard } from '../GameBoard';
import { ScoreBoard } from '../ScoreBoard';
import { LearningControls } from './LearningControls';
import { TopBar } from '../common/TopBar';
import { CoachMarkers } from '../board/CoachMarkers';
import { calculateBoardConstants } from '../board/geometry';
import { LearningExercise, type LearningExerciseProps } from './LearningExercise';
import type { CoachSkinId } from '../../utils/coachSkins';
import { TutorialModal } from '../TutorialModal';
import type { TutorialContent } from '../app/AppViewModel';

export interface LearningCenterProps {
  isOpen: boolean; onClose: () => void; loaded: boolean; onPractice?: () => void;
  sections: readonly { id: string; title: string }[];
  lessons: readonly { id: string; section: string; title: string; completedSteps: number; totalSteps: number }[];
  onLesson: (id: string) => void;
  active: LearningExerciseProps | null; activeLessonId?: string;
  notice: string;
  coachSkin?: CoachSkinId;
  tutorialContent?: TutorialContent;
  beginnerLessons?: readonly { id: string; title: string }[];
  appearance?: Pick<React.ComponentProps<typeof GameBoard>, 'stoneSkin' | 'boardSkin' | 'stoneAnimationEnabled' | 'separatePieces' | 'vibrate'>;
}

function TeachingBoardMarks({ board, marks }: {
  board: NonNullable<LearningExerciseProps['board']>;
  marks: NonNullable<LearningExerciseProps['boardMarks']>;
}) {
  const { CELL_SIZE, GRID_PADDING } = calculateBoardConstants(board.length, true);
  const shapes: Record<string, string> = { triangle: '△', TR: '△', circle: '○', CR: '○', square: '□', SQ: '□', cross: '×', MA: '×' };
  return <g pointerEvents="none" aria-label="棋盘字母与图形标记">
    {marks.map(({ point, label }, index) => {
      const stone = board[point.y]?.[point.x];
      const ink = stone ? (stone.color === 'black' ? '#fcf6ea' : '#303030') : 'var(--cg-primary-dark, #5c4033)';
      return <g key={`${point.x},${point.y},${index}`} transform={`translate(${GRID_PADDING + point.x * CELL_SIZE},${GRID_PADDING + point.y * CELL_SIZE})`}>
        {!stone && <circle r={CELL_SIZE * 0.29} fill="var(--cg-surface, #fcf6ea)"
          stroke="var(--cg-wood-soft, #e6d5b8)" strokeWidth={4} />}
        {!stone && <circle r={CELL_SIZE * 0.29} fill="none" stroke={ink} strokeWidth={2} />}
        <text textAnchor="middle" dominantBaseline="central" fontSize={CELL_SIZE * 0.48} fontWeight="bold"
          fill={ink} stroke={stone ? (stone.color === 'black' ? '#303030' : '#f0f0f0') : undefined}
          strokeWidth={stone ? 1 : undefined} paintOrder="stroke">{shapes[label] ?? label}</text>
      </g>;
    })}
  </g>;
}

export function LearningCenter(props: LearningCenterProps) {
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [beginnerStep, setBeginnerStep] = useState<string>();
  const courseDialog = useRef<HTMLDivElement>(null);
  const courseTrigger = useRef<HTMLButtonElement>(null);
  function closeCourses() { setCoursesOpen(false); courseTrigger.current?.focus(); }
  useEffect(() => {
    if (coursesOpen) courseDialog.current?.focus();
  }, [coursesOpen]);
  const [settledReplyKey, setSettledReplyKey] = useState<string>();
  const replyKey = props.isOpen && props.active?.replyPreview ? props.active.replyKey : undefined;
  useEffect(() => {
    if (!replyKey) return;
    let current = true;
    const timer = setTimeout(() => { if (current) setSettledReplyKey(replyKey); }, 420);
    return () => { current = false; clearTimeout(timer); };
  }, [replyKey]);
  const responding = Boolean(replyKey && replyKey !== settledReplyKey);
  const active = responding && props.active?.replyPreview ? {
    ...props.active, ...props.active.replyPreview, instruction: '你的棋已落下，看看对方怎样应手。',
    turnLabel: '对方应手中…', hint: '', markers: [], boardMarks: [], focusPoint: undefined,
    onPoint: () => {}, onInspect: () => {},
  } : props.active;
  function startPractice() { setCoursesOpen(false); props.onPractice?.(); }
  if (!props.isOpen) return null;
  const theme = props.appearance?.boardSkin === 'sakura_wood' ? 'theme-sakura' : '';
  const completedLessons = props.lessons.filter(item => item.completedSteps === item.totalSteps).length;
  return <main aria-label="进阶教学" className={`${theme} teaching-layout coach-layout h-full w-full bg-[#f7e7ce] text-[#5c4033] pb-safe ${coursesOpen ? '!overflow-hidden' : ''}`}>
    <Toast message={props.notice || null} />
    <header className="game-sidebar min-w-0 flex flex-col gap-4 pb-4">
      <TopBar leftButtons={<>
        <button aria-label="返回首页" onClick={props.onClose} className="btn-retro btn-brown h-11 w-11 shrink-0 rounded-xl flex items-center justify-center"><Home size={20} /></button>
        <button ref={courseTrigger} aria-label="打开课程" title="课程" onClick={() => setCoursesOpen(true)} className="btn-retro btn-brown h-11 w-11 shrink-0 rounded-xl flex items-center justify-center"><BookOpen size={20} /></button>
      </>} rightContent={<>
        <span className="max-w-[210px] truncate font-black text-lg sm:text-xl" title={active?.title}>{active?.title ?? '进阶教学'}</span>
        <span className="text-right text-[11px] sm:text-xs leading-4 text-[#8c6b38] mt-1 whitespace-nowrap"
          aria-label={active?.phase === 'demonstration' ? '本题示范进度' : '课程进度'}>
          {active ? active.phase === 'demonstration' ? `本题示范 · ${active.demoStep} / ${active.demoTotal}` : active.lessonProgress : '选择课程开始'}
        </span>
      </>} />
      {active && <div className="game-actions flex flex-col gap-4 px-4">
        <ScoreBoard currentPlayer={active.currentPlayer} blackCaptures={active.blackCaptures} whiteCaptures={active.whiteCaptures}
          gameType="Go" stoneSkin={props.appearance?.stoneSkin ?? 'classic'} isThinking={responding}
          showWinRate={false} showCaptures={false} appMode="playing" gameOver={false} userColor={active.currentPlayer} displayWinRate={50} />
        <LearningControls {...active} responding={responding} />
        <span className="sr-only" role="status">{active.turnLabel}</span>
      </div>}
    </header>
    <div className="game-board-area min-h-0 min-w-0 flex items-center justify-center p-2">
      <div className="board-viewport max-w-full max-h-full flex items-center justify-center">
        {active?.board ? <GameBoard {...props.appearance} board={active.board} currentPlayer={active.currentPlayer}
          onIntersectionClick={active.onPoint} onInspectPoint={active.onInspect} lastMove={active.lastMove}
          showQi qiOnHover={false} gameType="Go" gameMode="PvP" showCoordinates autoShowQiAt={active.focusPoint}
          markedPoints={[...active.markers, ...(active.boardMarks?.map(mark => mark.point) ?? [])]}
          extraSVGLayer="foreground" extraSVG={active.boardMarks?.length ? <>
            <TeachingBoardMarks board={active.board} marks={active.boardMarks} />
            <CoachMarkers points={[...active.markers]} board={active.board} />
          </> : <CoachMarkers points={[...active.markers]} board={active.board} />} />
          : <div className="max-w-xs p-4 space-y-3 text-center">
            <Button appearance="retro" variant="secondary" onClick={() => setCoursesOpen(true)} disabled={!props.loaded}>选择课程</Button>
            {!active && props.onPractice && <>
              <Button appearance="retro" variant="primary" onClick={startPractice} disabled={!props.loaded}>去 9 路陪练</Button>
            </>}
          </div>}
      </div>
    </div>
    {active && <LearningExercise {...active} coachSkin={props.coachSkin} />}
    <Modal isOpen={coursesOpen} onClose={closeCourses} position="fixed" maxWidth="max-w-lg" className="!p-0 !border-4 overflow-hidden">
      <div ref={courseDialog} role="dialog" aria-modal="true" aria-labelledby="course-menu-title" tabIndex={-1}
        className="flex max-h-[85dvh] flex-col outline-none" onKeyDown={event => {
          if (event.key === 'Escape') { event.stopPropagation(); closeCourses(); }
          if (event.key === 'Tab') {
            const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])');
            const first = buttons[0], last = buttons[buttons.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
              event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault(); first?.focus();
            }
          }
        }}>
        <header className="shrink-0 border-b border-[#e3c086]/50 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <BookOpen size={22} className="shrink-0 text-[#8c6b38]" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h2 id="course-menu-title" className="font-black text-xl tracking-wide">课程</h2>
            </div>
            <Button variant="ghost" size="sm" className="flex h-11 w-11 items-center justify-center !p-0 shrink-0"
              onClick={closeCourses} aria-label="关闭课程"><X size={20} /></Button>
          </div>
          {props.loaded && <div className="mt-2 flex items-center gap-3 text-xs text-[#8c6b38]" aria-label="课程完成进度">
            <ProgressBar value={completedLessons} max={props.lessons.length} label="已完成课程" className="flex-1" />
            <span className="shrink-0 tabular-nums">已完成 {completedLessons} / {props.lessons.length} 课</span>
          </div>}
        </header>
        <div className="course-menu-list min-h-0 overflow-y-auto overscroll-contain bg-[#e3c086]/20 p-4 sm:p-5 space-y-4" aria-label="课程列表">
          {!!props.beginnerLessons?.length && props.tutorialContent && <section aria-labelledby="course-section-beginner">
            <Panel appearance="retro" className="course-card overflow-hidden">
              <header className="mx-4 border-b border-[#e3c086]/30 py-4">
                <h3 id="course-section-beginner" className="text-lg font-black">新手教学</h3>
              </header>
              <div>
                {props.beginnerLessons.map(item => <Button key={item.id} appearance="retro" variant="ghost" size="md"
                  className="w-full min-h-14 flex items-center gap-3 !rounded-none !px-4 !py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current"
                  onClick={() => { setBeginnerStep(item.id); setCoursesOpen(false); }}>
                  <span className="min-w-0 flex-1 text-[15px] text-[#5c4033] font-medium leading-6">{item.title}</span>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[#8c6b38] opacity-60"><ChevronRight size={16} aria-hidden="true" /></span>
                </Button>)}
              </div>
            </Panel>
          </section>}
          {!props.loaded ? <p role="status" className="text-sm py-4 text-center">正在读取课程进度…</p>
            : props.sections.map(section => {
              const lessons = props.lessons.filter(item => item.section === section.id);
              if (!lessons.length) return null;
              const completed = lessons.filter(item => item.completedSteps === item.totalSteps).length;
              return <section key={section.id} aria-labelledby={`course-section-${section.id}`}>
                <Panel appearance="retro" className="course-card overflow-hidden">
                  <header className="mx-4 flex items-center justify-between gap-3 border-b border-[#e3c086]/30 py-4">
                    <h3 id={`course-section-${section.id}`} className="min-w-0 text-lg font-black">{section.title}</h3>
                    <span className="text-xs text-[#8c6b38] shrink-0 font-normal tabular-nums" aria-label={`已完成 ${completed} / ${lessons.length} 课`}>{completed} / {lessons.length}</span>
                  </header>
                  <div>
                    {lessons.map(item => {
                      const done = item.completedSteps === item.totalSteps;
                      const current = item.id === props.activeLessonId;
                      return <Button key={item.id} appearance="retro" variant="ghost" size="md" aria-current={current ? 'step' : undefined}
                        className={`w-full min-h-14 flex items-center gap-3 !rounded-none !px-4 !py-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-current ${current ? 'bg-[#e3c086]/30' : ''}`}
                        onClick={() => { props.onLesson(item.id); closeCourses(); }}>
                        <span className="min-w-0 flex-1">
                          <span className={`block text-[15px] leading-6 text-[#5c4033] ${current ? 'font-bold' : 'font-medium'}`}>{item.title}</span>
                          {done && <span className="sr-only">已完成</span>}
                        </span>
                        {!done && item.completedSteps > 0 && <span className="shrink-0 text-xs font-normal tabular-nums"
                          aria-label={`已完成 ${item.completedSteps} / ${item.totalSteps} 步`}>{item.completedSteps} / {item.totalSteps}</span>}
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${current ? 'bg-[#5c4033] text-[#fcf6ea]' : done ? '' : 'opacity-60'}`}>
                          {done ? <Check size={16} strokeWidth={2.5} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                        </span>
                      </Button>;
                    })}
                  </div>
                </Panel>
              </section>;
            })}
        </div>
      </div>
    </Modal>
    {beginnerStep && props.tutorialContent && <TutorialModal key={beginnerStep} isOpen
      initialStepId={beginnerStep} tutorialContent={props.tutorialContent}
      vibrate={props.appearance?.vibrate ?? (() => {})} stoneAnimationEnabled={props.appearance?.stoneAnimationEnabled}
      onClose={() => { setBeginnerStep(undefined); setCoursesOpen(true); }} />}
  </main>;
}

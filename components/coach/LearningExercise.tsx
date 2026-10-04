import React, { useEffect, useRef } from 'react';
import { Play } from 'lucide-react';
import { Button, Panel } from '../../ui/common';
import { CoachPet } from '../CoachPet';
import { CoachBubble } from './CoachBubble';
import type { BoardState, Player, Point } from '../../types';
import type { CoachSkinId } from '../../utils/coachSkins';
import { useCoachPlacement } from './useCoachPlacement';

export interface LearningExerciseProps {
  title: string;
  phase: 'demonstration' | 'practice' | 'exploration' | 'feedback'; instruction: string;
  continueLabel: string; onContinue: () => void; onUndo: () => void; canUndo: boolean;
  onDemonstrate?: () => void;
  onReturnFromDemo: () => void; demoStep: number; demoTotal: number;
  explanationVisible: boolean; onExplanation: () => void;
  lessonProgress: string; turnLabel: string;
  lastMove: Point | null;
  kind: 'choice' | 'point' | 'number' | 'sequence' | 'variation' | 'action';
  actionLabel?: string; onAction?: () => void; actionSelectionCount?: number;
  board?: BoardState; currentPlayer: Player;
  blackCaptures: number; whiteCaptures: number;
  replyPreview?: { board: BoardState; currentPlayer: Player; lastMove: Point | null; blackCaptures: number; whiteCaptures: number }; replyKey?: string;
  focusPoint?: Point; markers: readonly Point[]; onInspect: (x: number, y: number) => void;
  boardMarks?: readonly { point: Point; label: string }[];
  choices: readonly { id: string; label: string }[]; selectedChoice: string; onChoice: (id: string) => void;
  numberAnswer: string; numberUnit: string;
  hint: string; hintLevel: number; result: { outcome: 'success' | 'failure' | 'unverified' | 'continue'; explanation: string } | null;
  independent: boolean; onPoint: (x: number, y: number) => void;
  onNumber: (value: string) => void; onHint: () => void; onSubmit: () => void;
  onRetry: () => void; canSubmit: boolean;
}

export function LearningExercise(props: LearningExerciseProps & { coachSkin?: CoachSkinId }) {
  const { phase, result, coachSkin = 'chuying' } = props;
  const message = useRef<HTMLDivElement>(null);
  const placement = useCoachPlacement();
  const text = phase === 'practice' && props.hint && !props.explanationVisible ? props.hint : props.instruction;
  const answering = phase === 'practice' || (phase === 'feedback' && result?.outcome !== 'success' && ['number', 'choice', 'action'].includes(props.kind));
  const hasTools = answering && (['number', 'choice'].includes(props.kind)
    || (props.kind === 'action' && (props.actionSelectionCount !== undefined || props.onDemonstrate)));
  useEffect(() => { if (message.current) message.current.scrollTop = 0; }, [text]);
  const actionClass = 'h-11 min-w-0 flex items-center justify-center gap-1 whitespace-nowrap';
  return <aside {...placement.container} style={{ minHeight: 'calc(var(--coach-art-height) + 16px)', ...placement.container.style }}
    aria-label="围棋教学讲解" className={`coach-assistant teaching-assistant ${answering && ['number', 'choice', 'action'].includes(props.kind) ? 'teaching-number' : ''} flex items-start min-w-0`}>
    <button {...placement.character} type="button" className="coach-character shrink-0" aria-label="移动讲解助手"
      title="拖动人物；方向键移动，Home 或 Esc 归位" onClick={event => { event.preventDefault(); event.stopPropagation(); }}>
      <CoachPet skinId={coachSkin} state={result?.outcome === 'success' ? 'encouraging' : 'explaining'} />
    </button>
    <Panel {...placement.bubble} className="coach-conversation coach-has-speech flex flex-1 min-w-0 min-h-0 flex-col">
      <svg aria-hidden="true" className="coach-speech-tail" width="12" height="18" viewBox="0 0 12 18"><path d="M12 1 L1 9 L12 17" /></svg>
      <CoachBubble text={text} loading={false} bodyRef={message} coachSkin={coachSkin} />
      {hasTools && <div className="coach-tools w-full shrink-0">
        {answering && props.kind === 'action' && props.onAction && <div className="mb-2 space-y-1">
          {props.actionSelectionCount !== undefined && <p className="text-xs text-[#8c6b38] px-1" role="status">已选 {props.actionSelectionCount} 颗棋子</p>}
        </div>}
        {answering && props.kind === 'number' && <form className="coach-composer flex min-w-0 gap-1" onSubmit={event => {
          event.preventDefault(); if (props.canSubmit) props.onSubmit();
        }}>
          <label className="flex items-center gap-2 text-sm min-w-0 flex-1 whitespace-nowrap">{props.numberUnit === '目' ? '目数' : '气数'}
            <input className="h-11 min-w-0 w-16 rounded-lg border border-[#e3c086] bg-white/40 px-2 select-text"
              type="number" min="0" step="1" inputMode="numeric" aria-label={props.numberUnit === '目' ? '目数' : '气的数量'} value={props.numberAnswer}
              onChange={event => props.onNumber(event.currentTarget.value)} />
          </label>
          <Button appearance="retro" size="sm" type="submit" className="h-11 px-3" disabled={!props.canSubmit}>确认</Button>
        </form>}
        {answering && props.kind === 'choice' && <form className="flex min-w-0 flex-col gap-2" onSubmit={event => { event.preventDefault(); if (props.canSubmit) props.onSubmit(); }}>
          <div role="group" aria-label="选择答案" className="flex min-w-0 flex-wrap gap-2">
            {props.choices.map(choice => <Button key={choice.id} appearance="retro" size="sm" type="button"
              variant={props.selectedChoice === choice.id ? 'primary' : 'secondary'} aria-pressed={props.selectedChoice === choice.id}
              className="min-h-11 min-w-11 flex-1 whitespace-normal break-words !px-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c6b38]"
              onClick={() => props.onChoice(choice.id)}>{choice.label}</Button>)}
          </div>
          <Button appearance="retro" size="sm" type="submit" aria-label="确认选择" className="h-11 w-full px-3" disabled={!props.canSubmit}>确认</Button>
        </form>}
        {props.kind === 'action' && props.onDemonstrate && <Button appearance="retro" size="sm" variant="secondary" className={`${actionClass} w-full`}
          aria-label="看本题示范" onClick={props.onDemonstrate}><Play className="coach-action-icon shrink-0" size={14} aria-hidden="true" />示范</Button>}
      </div>}
      {phase === 'feedback' && <span className="sr-only">{props.independent ? '本次独立作答' : '本次辅助练习'}</span>}
    </Panel>
  </aside>;
}

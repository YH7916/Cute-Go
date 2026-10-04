import React, { useEffect, useRef } from 'react';
import { CoachPet } from './CoachPet';
import { CoachPanel } from './CoachPanel';
import { CoachBubble } from './coach/CoachBubble';
import { Button, Panel } from '../ui/common';
import type { AppViewModel } from './app/AppViewModel';
import type { CoachSkinId } from '../utils/coachSkins';
import { useCoachPlacement } from './coach/useCoachPlacement';

interface CoachAssistantProps {
  coach: AppViewModel['coach'];
  gameOver: boolean;
  coachSkin?: CoachSkinId;
  onInspectPosition?: AppViewModel['review']['inspectPosition'];
  reviewAction?: React.ReactNode;
  review?: AppViewModel['review'];
}

export function CoachAssistant({ coach, gameOver, coachSkin = 'chuying', onInspectPosition, reviewAction, review }: CoachAssistantProps) {
  const message = useRef<HTMLDivElement>(null);
  const placement = useCoachPlacement();
  const text = review ? review.error || (coach.error ? '讲解暂时不可用，可以重试。' : coach.text)
    || (review.inVariation ? '在棋盘上试下，点“原谱”回到这手。' : '用上方按钮选一手，点讲解看原因。') : coach.text;
  const loading = coach.loading && !review?.error;
  const speechVisible = Boolean(text || coach.error || loading);
  useEffect(() => {
    if (message.current) message.current.scrollTop = 0;
  }, [speechVisible, text, loading]);

  return <aside {...placement.container} aria-label={review ? '围棋复盘助手' : '围棋陪练助手'} className={`coach-assistant ${coach.configured && !review ? 'coach-configured' : ''} flex items-start min-w-0`}>
    <button {...placement.character} type="button" className="coach-character shrink-0" aria-label="移动讲解助手"
      title="拖动人物；方向键移动，Home 或 Esc 归位" onClick={event => { event.preventDefault(); event.stopPropagation(); }}>
      <CoachPet skinId={coachSkin} state={coach.loading ? 'thinking' : gameOver ? 'encouraging' : speechVisible ? 'explaining' : 'idle'} />
    </button>
    <Panel {...placement.bubble} className={`coach-conversation ${speechVisible ? 'coach-has-speech' : ''} flex flex-1 min-w-0 min-h-0 flex-col`}>
      {speechVisible && <svg aria-hidden="true" className="coach-speech-tail" width="12" height="18" viewBox="0 0 12 18">
        <path d="M12 1 L1 9 L12 17" />
      </svg>}
      {speechVisible && !review && coach.previousPosition && <div className="flex shrink-0 items-center justify-between gap-2 text-xs text-[#8c6b38]">
        <span>{`刚才第 ${coach.moveNumber} 手`}</span>
        {onInspectPosition && <Button variant="ghost" size="sm" className="shrink-0 px-1 text-xs underline"
          aria-label="回看这步讲解的棋盘" onClick={() => { if (coach.previousPosition) onInspectPosition(coach.previousPosition); }}>回看这步</Button>}
      </div>}
      {speechVisible && <CoachBubble text={text} loading={loading}
        error={review ? undefined : coach.error} source={coach.source} bodyRef={message} coachSkin={coachSkin} />}
      <div id="coach-assistant-panel" className="coach-tools w-full shrink-0">
        <CoachPanel coach={coach} gameOver={gameOver} reviewAction={reviewAction} review={review} />
      </div>
    </Panel>
  </aside>;
}

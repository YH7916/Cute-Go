import React, { useState } from 'react';
import { Send, MessageCircle, Lightbulb, Square } from 'lucide-react';
import { Button } from '../ui/common';
import type { AppViewModel } from './app/AppViewModel';
import { CoachReviewTools } from './coach/CoachReviewTools';

interface CoachPanelProps {
  coach: AppViewModel['coach'];
  gameOver: boolean;
  reviewAction?: React.ReactNode;
  review?: AppViewModel['review'];
}

export function CoachPanel({ coach, gameOver, reviewAction, review }: CoachPanelProps) {
  const [question, setQuestion] = useState('');
  return (
    <div role="region" aria-label={review ? 'AI 复盘讲解' : 'AI 陪练讲解'} className="coach-controls flex flex-col">
      <div className="coach-actions flex shrink-0 items-center gap-1">
        {coach.loading
          ? <Button appearance="retro" size="sm" variant="primary" className="h-11 min-w-11 flex-1 flex items-center justify-center gap-1 whitespace-nowrap" aria-label="停止讲解" onClick={coach.cancel}><Square className="coach-action-icon" size={14} aria-hidden="true" />停止</Button>
          : <Button appearance="retro" size="sm" variant="primary" className="h-11 min-w-11 flex-1 flex items-center justify-center gap-1 whitespace-nowrap" aria-label={review ? '讲解这手' : '讲解当前局面'} title={review ? '讲解这手' : '讲解当前局面'} onClick={() => void coach.ask('explain-position')}><MessageCircle className="coach-action-icon" size={14} aria-hidden="true" />讲解</Button>}
        {review ? <CoachReviewTools review={review} /> : <>
          <Button appearance="retro" size="sm" variant="secondary" className="h-11 min-w-11 flex-1 flex items-center justify-center gap-1 whitespace-nowrap" aria-label="给点提示" title="下一步看哪里" onClick={() => void coach.ask('hint')}><Lightbulb className="coach-action-icon" size={14} aria-hidden="true" />提示</Button>
          {reviewAction}
        </>}
      </div>
      {coach.configured && !review && <form className="coach-composer flex min-w-0 gap-1" onSubmit={event => {
        event.preventDefault();
        const trimmed = question.trim();
        if (!trimmed) return;
        void coach.ask('explain-position', trimmed);
        setQuestion('');
      }}>
        <input aria-label="向陪练提问" placeholder={gameOver ? '继续复盘这盘棋…' : '问规则、看形势…'} value={question}
          onChange={event => setQuestion(event.target.value)} maxLength={500}
          className="min-w-0 h-11 flex-1 rounded-lg border border-[#e3c086] bg-white/40 px-2 text-base select-text focus:outline-none focus:border-[#8c6b38]" />
        <Button appearance="retro" variant="secondary" size="sm" type="submit" className="h-11 w-11 shrink-0 flex items-center justify-center" aria-label="发送问题" disabled={!question.trim()}><Send size={16} aria-hidden="true" /></Button>
      </form>}
    </div>
  );
}

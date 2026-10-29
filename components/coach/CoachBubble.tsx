import React from 'react';
import { COACH_SKINS, type CoachSkinId } from '../../utils/coachSkins';
import { renderTextBlocks } from '../../ui/common';

interface CoachBubbleProps {
  text: string;
  loading: boolean;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  error?: string;
  source?: 'local' | 'cloud';
  coachSkin?: CoachSkinId;
}

export function CoachBubble({ text, loading, bodyRef, error, source, coachSkin = 'chuying' }: CoachBubbleProps) {
  return <div role="status" aria-label={`${COACH_SKINS[coachSkin].name}提示`} aria-live="polite" aria-busy={loading}
    className="coach-speech coach-message flex min-w-0 min-h-0 flex-initial">
    <div ref={bodyRef} data-coach-message className="min-h-0 w-full overflow-y-auto overscroll-contain text-sm leading-[22px] whitespace-pre-wrap break-words select-text">
      <span className="sr-only">{source === 'cloud' ? 'AI' : '本地'}</span>
      {loading && !text ? <span className="text-[#8c6b38]">正在看棋…</span> : renderTextBlocks(text)}
      {error && <p className="text-xs leading-5 text-[#9a4d31]">{error}</p>}
    </div>
  </div>;
}

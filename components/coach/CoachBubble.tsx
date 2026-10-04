import React from 'react';
import { COACH_SKINS, type CoachSkinId } from '../../utils/coachSkins';

interface CoachBubbleProps {
  text: string;
  loading: boolean;
  bodyRef: React.RefObject<HTMLDivElement | null>;
  error?: string;
  source?: 'local' | 'cloud';
  coachSkin?: CoachSkinId;
}

function renderMessage(text: string) {
  const blocks: { list: boolean; lines: string[] }[] = [];
  let current: (typeof blocks)[number] | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) { current = undefined; continue; }
    const list = line.startsWith('- ');
    if (!current || current.list !== list) {
      current = { list, lines: [] };
      blocks.push(current);
    }
    current.lines.push(list ? line.slice(2) : line);
  }
  return blocks.map((block, index) => block.list
    ? <ul key={index} className={`list-disc pl-4 space-y-1 ${index > 0 ? 'mt-2' : ''}`}>
      {block.lines.map((line, item) => <li key={item}>{line}</li>)}
    </ul>
    : <p key={index} className={index > 0 ? 'mt-2' : 'm-0'}>{block.lines.join('\n')}</p>);
}

export function CoachBubble({ text, loading, bodyRef, error, source, coachSkin = 'chuying' }: CoachBubbleProps) {
  return <div role="status" aria-label={`${COACH_SKINS[coachSkin].name}提示`} aria-live="polite" aria-busy={loading}
    className="coach-speech coach-message flex min-w-0 min-h-0 flex-initial">
    <div ref={bodyRef} data-coach-message className="min-h-0 w-full overflow-y-auto overscroll-contain text-sm leading-[22px] whitespace-pre-wrap break-words select-text">
      <span className="sr-only">{source === 'cloud' ? 'AI' : '本地'}</span>
      {loading ? <span className="text-[#8c6b38]">让我看看这步棋…</span> : renderMessage(text)}
      {error && <p className="text-xs leading-5 text-[#9a4d31]">{error}</p>}
    </div>
  </div>;
}

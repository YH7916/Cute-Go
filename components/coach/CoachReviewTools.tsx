import React from 'react';
import { CornerUpLeft, GitBranch, Undo2 } from 'lucide-react';
import { Button } from '../../ui/common';
import type { AppViewModel } from '../app/AppViewModel';

export function CoachReviewTools({ review }: { review: AppViewModel['review'] }) {
  return <>
    <Button appearance="retro" variant="secondary" size="sm"
      className="h-11 min-w-11 flex-1 flex items-center justify-center gap-1 whitespace-nowrap"
      aria-label={review.inVariation ? '返回原谱' : '从这里试下'} title={review.inVariation ? '返回原谱' : '从这里试下'}
      onClick={review.inVariation ? review.exitVariation : review.startVariation}>
      {review.inVariation ? <CornerUpLeft className="coach-action-icon" size={14} aria-hidden="true" />
        : <GitBranch className="coach-action-icon" size={14} aria-hidden="true" />}
      {review.inVariation ? '原谱' : '试下'}
    </Button>
    {review.inVariation && <Button appearance="retro" variant="secondary" size="sm"
      className="h-11 w-11 shrink-0 !p-0 flex items-center justify-center" aria-label="退一手" title="撤回试下的一手"
      onClick={review.undoVariation} disabled={!review.variationMoves}><Undo2 size={16} aria-hidden="true" /></Button>}
  </>;
}

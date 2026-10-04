import React from 'react';
import { RotateCcw, SkipForward, Undo2 } from 'lucide-react';

interface GameAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: React.ReactNode;
  pulse?: boolean;
}

// Match and teaching share the same undo / main action / restart presentation.
// Callers retain ownership of their distinct session transitions.
export function GamePlayControls({ undo, primary, reset }: {
  undo: GameAction; primary?: GameAction; reset: GameAction;
}) {
  const actionClass = 'flex min-w-0 flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50';
  return <div className={`game-play-controls grid gap-3 ${primary ? 'grid-cols-3' : 'grid-cols-2'}`}>
    <button type="button" onClick={undo.onClick} disabled={undo.disabled} className={`btn-retro btn-sand ${actionClass}`}>
      {undo.icon ?? <Undo2 size={20} />}<span className="text-xs">{undo.label}</span>
    </button>
    {primary && <button type="button" onClick={primary.onClick} disabled={primary.disabled}
      className={`btn-retro btn-coffee ${actionClass} ${primary.pulse ? 'animate-pulse' : ''}`}>
      {primary.icon ?? <SkipForward size={20} />}<span className="text-xs">{primary.label}</span>
    </button>}
    <button type="button" onClick={reset.onClick} disabled={reset.disabled} className={`btn-retro btn-beige ${actionClass}`}>
      {reset.icon ?? <RotateCcw size={20} />}<span className="text-xs">{reset.label}</span>
    </button>
  </div>;
}

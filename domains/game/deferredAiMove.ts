import { isSamePosition, type PositionSnapshot } from './positionSnapshot';
export type { PositionSnapshot } from './positionSnapshot';

export interface DeferredMoveOptions {
  timer: { current: ReturnType<typeof setTimeout> | null };
  readPosition: () => PositionSnapshot;
  allowed: () => boolean;
  apply: () => void;
}

export function deferAiMove(options: DeferredMoveOptions): void {
  if (options.timer.current !== null) clearTimeout(options.timer.current);
  const position = options.readPosition();
  const timer = setTimeout(() => {
    if (options.timer.current !== timer) return;
    options.timer.current = null;
    if (isSamePosition(position, options.readPosition()) && options.allowed()) options.apply();
  }, 200);
  options.timer.current = timer;
}

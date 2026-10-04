type Size = { width: number; height: number };
type Point = { x: number; y: number };

export interface CoachPlacementInput {
  viewport: Size;
  character: Size;
  bubble: Size;
  anchor: Point;
}

export interface CoachPlacement {
  character: Point;
  bubble: Point & { width: number; maxHeight: number };
  side: 'left' | 'right' | 'above' | 'below';
  tailOffset: number;
}

const MARGIN = 12;
const GAP = 8;
const MIN_BUBBLE_WIDTH = 160;
const TAIL_INSET = 24;
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const tailOffset = (value: number, extent: number) => extent < TAIL_INSET * 2
  ? extent / 2 : clamp(value, TAIL_INSET, extent - TAIL_INSET);

// Coordinates are relative to the visible viewport; callers own DOM measurements.
export function getCoachPlacement({ viewport, character, bubble, anchor }: CoachPlacementInput): CoachPlacement {
  const position = {
    x: clamp(anchor.x, MARGIN, viewport.width - MARGIN - character.width),
    y: clamp(anchor.y, MARGIN, viewport.height - MARGIN - character.height),
  };
  const width = Math.min(Math.max(0, bubble.width), Math.max(0, viewport.width - MARGIN * 2));
  const height = Math.max(0, bubble.height);
  const mouth = { x: position.x + character.width / 2, y: position.y + character.height * 0.54 };
  const right = Math.max(0, viewport.width - MARGIN - position.x - character.width - GAP);
  const left = Math.max(0, position.x - MARGIN - GAP);
  const minWidth = Math.min(MIN_BUBBLE_WIDTH, width);
  let side: CoachPlacement['side'];
  if (right >= width) side = 'right';
  else if (left >= width) side = 'left';
  else if (Math.max(left, right) >= minWidth) side = right >= left ? 'right' : 'left';
  else {
    const above = Math.max(0, position.y - MARGIN - GAP);
    const below = Math.max(0, viewport.height - MARGIN - position.y - character.height - GAP);
    side = above >= below ? 'above' : 'below';
    const maxHeight = side === 'above' ? above : below;
    const actualHeight = Math.min(height, maxHeight);
    const x = clamp(mouth.x - width / 2, MARGIN, viewport.width - MARGIN - width);
    const y = clamp(side === 'above' ? position.y - GAP - actualHeight : position.y + character.height + GAP,
      MARGIN, viewport.height - MARGIN - actualHeight);
    return { character: position, bubble: { x, y, width, maxHeight }, side,
      tailOffset: tailOffset(mouth.x - x, width) };
  }

  const actualWidth = Math.min(width, side === 'right' ? right : left);
  const maxHeight = Math.max(0, viewport.height - MARGIN * 2);
  const actualHeight = Math.min(height, maxHeight);
  const x = side === 'right' ? position.x + character.width + GAP : position.x - GAP - actualWidth;
  const y = clamp(mouth.y - actualHeight / 2, MARGIN, viewport.height - MARGIN - actualHeight);
  return { character: position, bubble: { x, y, width: actualWidth, maxHeight }, side,
    tailOffset: tailOffset(mouth.y - y, actualHeight) };
}

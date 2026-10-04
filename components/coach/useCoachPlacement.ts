import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { getCoachPlacement } from './coachPlacement';

type Point = { x: number; y: number };
interface Measurement {
  viewport: { width: number; height: number };
  offset: Point;
  character: { width: number; height: number };
  bubble: { width: number; height: number };
  containerHeight: number;
}
interface Floating { anchor: Point; measurement: Measurement }
interface Drag { id: number; start: Point; anchor: Point; measurement: Measurement; previous: Floating | null; moved: boolean }

// Shared by live/review coaching and lessons. Moving the helper never changes a position.
export function useCoachPlacement() {
  const containerRef = useRef<HTMLElement>(null);
  const characterRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [floating, setFloating] = useState<Floating | null>(null);
  const active = floating !== null;

  const measure = (): Measurement | null => {
    const container = containerRef.current, character = characterRef.current, bubble = bubbleRef.current;
    if (!container || !character || !bubble) return null;
    const frame = container.getBoundingClientRect(), pet = character.getBoundingClientRect();
    const speech = bubble.querySelector<HTMLElement>('[data-coach-message]');
    const style = getComputedStyle(container), viewport = window.visualViewport;
    return {
      viewport: { width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight },
      offset: { x: viewport?.offsetLeft ?? 0, y: viewport?.offsetTop ?? 0 },
      character: { width: pet.width, height: pet.height },
      bubble: {
        width: frame.width - pet.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - parseFloat(style.columnGap),
        height: bubble.getBoundingClientRect().height + (speech ? Math.max(0, speech.scrollHeight - speech.clientHeight) : 0),
      },
      containerHeight: frame.height,
    };
  };

  useEffect(() => {
    if (!active) return;
    const update = () => {
      const measurement = measure();
      if (measurement) setFloating(previous => previous && { ...previous, measurement });
    };
    const observer = new ResizeObserver(update);
    if (bubbleRef.current) observer.observe(bubbleRef.current);
    if (characterRef.current) observer.observe(characterRef.current);
    window.addEventListener('resize', update);
    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [active]);

  const finish = (element: HTMLButtonElement, cancelled = false) => {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (cancelled) setFloating(current.previous);
    if (element.hasPointerCapture(current.id)) element.releasePointerCapture(current.id);
  };
  const pointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.isPrimary === false || drag.current) return;
    const measurement = measure();
    if (!measurement) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    drag.current = { id: event.pointerId, start: { x: event.clientX, y: event.clientY },
      anchor: { x: rect.x, y: rect.y }, measurement, previous: floating, moved: false };
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || event.pointerId !== current.id) return;
    event.preventDefault(); event.stopPropagation();
    const dx = event.clientX - current.start.x, dy = event.clientY - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    current.moved = true;
    setFloating(previous => ({ anchor: { x: current.anchor.x + dx, y: current.anchor.y + dy },
      measurement: previous?.measurement ?? current.measurement }));
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape' || event.key === 'Home') {
      event.preventDefault(); event.stopPropagation();
      if (drag.current) finish(event.currentTarget, true);
      else setFloating(null);
      return;
    }
    const direction: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const delta = direction[event.key], measurement = delta && measure();
    if (!delta || !measurement) return;
    event.preventDefault(); event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect(), step = event.shiftKey ? 24 : 8;
    setFloating({ anchor: { x: rect.x + delta.x * step, y: rect.y + delta.y * step }, measurement });
  };

  const offset = floating?.measurement.offset ?? { x: 0, y: 0 };
  const placement = floating && getCoachPlacement({ ...floating.measurement,
    anchor: { x: floating.anchor.x - offset.x, y: floating.anchor.y - offset.y } });
  const characterStyle: CSSProperties | undefined = placement ? {
    position: 'fixed', left: placement.character.x + offset.x, top: placement.character.y + offset.y,
    bottom: 'auto', margin: 0,
  } : undefined;
  const bubbleStyle: (CSSProperties & { '--coach-tail-position': string }) | undefined = placement ? {
    position: 'fixed', left: placement.bubble.x + offset.x, top: placement.bubble.y + offset.y,
    width: placement.bubble.width, maxHeight: placement.bubble.maxHeight, margin: 0,
    '--coach-tail-position': `${placement.tailOffset}px`,
  } : undefined;
  return {
    container: { ref: containerRef, 'data-coach-floating': active || undefined,
      style: floating ? { height: floating.measurement.containerHeight, minHeight: floating.measurement.containerHeight } : undefined },
    character: { ref: characterRef, style: characterStyle, onPointerDown: pointerDown, onPointerMove: pointerMove,
      onPointerUp: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerId === drag.current?.id) finish(event.currentTarget); },
      onPointerCancel: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerId === drag.current?.id) finish(event.currentTarget, true); },
      onLostPointerCapture: (event: PointerEvent<HTMLButtonElement>) => { if (event.pointerId === drag.current?.id) drag.current = null; }, onKeyDown: keyDown },
    bubble: { ref: bubbleRef, style: bubbleStyle, 'data-coach-side': placement?.side },
  };
}

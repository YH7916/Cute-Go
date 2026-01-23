import { useRef, useCallback, useEffect } from 'react';

/**
 * Swipe direction types
 */
export type SwipeDirection = 'left' | 'right' | 'up' | 'down';

/**
 * Swipe gesture configuration
 */
export interface SwipeConfig {
  /** Minimum distance in pixels to trigger a swipe (default: 50) */
  threshold?: number;
  /** Maximum time in ms for a swipe gesture (default: 300) */
  maxTime?: number;
  /** Prevent default touch behavior during swipe (default: true) */
  preventDefault?: boolean;
  /** Only detect horizontal swipes (default: false) */
  horizontalOnly?: boolean;
  /** Only detect vertical swipes (default: false) */
  verticalOnly?: boolean;
}

/**
 * Swipe event data passed to callbacks
 */
export interface SwipeEvent {
  direction: SwipeDirection;
  deltaX: number;
  deltaY: number;
  velocity: number; // pixels per ms
  duration: number;
}

/**
 * Callbacks for swipe gestures
 */
export interface SwipeHandlers {
  onSwipeLeft?: (event: SwipeEvent) => void;
  onSwipeRight?: (event: SwipeEvent) => void;
  onSwipeUp?: (event: SwipeEvent) => void;
  onSwipeDown?: (event: SwipeEvent) => void;
  onSwipe?: (event: SwipeEvent) => void;
}

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  tracking: boolean;
}

/**
 * Hook for detecting swipe gestures on an element
 *
 * @example
 * const swipeHandlers = useSwipeGesture({
 *   onSwipeLeft: () => goToNextMove(),
 *   onSwipeRight: () => goToPreviousMove(),
 * });
 *
 * return <div {...swipeHandlers}>...</div>;
 */
export function useSwipeGesture(handlers: SwipeHandlers, config: SwipeConfig = {}) {
  const {
    threshold = 50,
    maxTime = 300,
    preventDefault = true,
    horizontalOnly = false,
    verticalOnly = false,
  } = config;

  const touchState = useRef<TouchState | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;

    const touch = e.touches[0];
    touchState.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      tracking: true,
    };
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchState.current?.tracking) return;
      if (e.touches.length !== 1) {
        // Multi-touch, cancel tracking
        touchState.current = null;
        return;
      }

      // Optionally prevent scrolling during swipe detection
      if (preventDefault) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - touchState.current.startX);
        const deltaY = Math.abs(touch.clientY - touchState.current.startY);

        // Only prevent if it looks like a deliberate horizontal swipe
        if (horizontalOnly && deltaX > deltaY && deltaX > 10) {
          e.preventDefault();
        } else if (verticalOnly && deltaY > deltaX && deltaY > 10) {
          e.preventDefault();
        }
      }
    },
    [preventDefault, horizontalOnly, verticalOnly]
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchState.current?.tracking) return;

      const { startX, startY, startTime } = touchState.current;
      touchState.current = null;

      // Use changedTouches for touchend
      const touch = e.changedTouches[0];
      if (!touch) return;

      const endX = touch.clientX;
      const endY = touch.clientY;
      const endTime = Date.now();

      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const duration = endTime - startTime;

      // Check if gesture is within time limit
      if (duration > maxTime) return;

      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      // Determine direction
      let direction: SwipeDirection | null = null;

      if (horizontalOnly || (!verticalOnly && absX > absY)) {
        // Horizontal swipe
        if (absX >= threshold) {
          direction = deltaX > 0 ? 'right' : 'left';
        }
      } else if (verticalOnly || absY > absX) {
        // Vertical swipe
        if (absY >= threshold) {
          direction = deltaY > 0 ? 'down' : 'up';
        }
      }

      if (!direction) return;

      const velocity = Math.max(absX, absY) / duration;
      const swipeEvent: SwipeEvent = {
        direction,
        deltaX,
        deltaY,
        velocity,
        duration,
      };

      // Call specific handler
      switch (direction) {
        case 'left':
          handlers.onSwipeLeft?.(swipeEvent);
          break;
        case 'right':
          handlers.onSwipeRight?.(swipeEvent);
          break;
        case 'up':
          handlers.onSwipeUp?.(swipeEvent);
          break;
        case 'down':
          handlers.onSwipeDown?.(swipeEvent);
          break;
      }

      // Call generic handler
      handlers.onSwipe?.(swipeEvent);
    },
    [handlers, threshold, maxTime, horizontalOnly, verticalOnly]
  );

  const handleTouchCancel = useCallback(() => {
    touchState.current = null;
  }, []);

  // Return props to spread on the target element
  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    onTouchCancel: handleTouchCancel,
  };
}

/**
 * Hook specifically for board navigation swipe gestures
 *
 * @param onPreviousMove - Called when user swipes right (go back)
 * @param onNextMove - Called when user swipes left (go forward)
 */
export function useBoardSwipeNavigation(
  onPreviousMove: () => void,
  onNextMove: () => void,
  enabled: boolean = true
) {
  return useSwipeGesture(
    enabled
      ? {
          onSwipeLeft: onNextMove,
          onSwipeRight: onPreviousMove,
        }
      : {},
    {
      threshold: 60,
      maxTime: 400,
      horizontalOnly: true,
      preventDefault: true,
    }
  );
}

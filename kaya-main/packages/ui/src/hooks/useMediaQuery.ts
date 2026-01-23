import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for responsive media queries
 *
 * @param query - CSS media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    // SSR-safe: check if window exists
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQueryList = window.matchMedia(query);
    const listener = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Set initial value
    setMatches(mediaQueryList.matches);

    // Modern browsers
    mediaQueryList.addEventListener('change', listener);

    return () => {
      mediaQueryList.removeEventListener('change', listener);
    };
  }, [query]);

  return matches;
}

/**
 * Breakpoint values matching CSS variables
 */
export const BREAKPOINTS = {
  mobile: 768,
  tablet: 1025,
} as const;

/**
 * Layout mode based on screen width
 */
export type LayoutMode = 'mobile' | 'tablet' | 'desktop';

/**
 * Hook that returns the current layout mode based on screen width and height
 *
 * - mobile: < 768px width OR < 500px height (landscape phones)
 * - tablet: 768px - 1024px width (and height >= 500px)
 * - desktop: > 1024px width
 */
export function useLayoutMode(): LayoutMode {
  const isMobileWidth = useMediaQuery(`(max-width: ${BREAKPOINTS.mobile - 1}px)`);
  const isMobileHeight = useMediaQuery('(max-height: 500px)');
  const isTablet = useMediaQuery(
    `(min-width: ${BREAKPOINTS.mobile}px) and (max-width: ${BREAKPOINTS.tablet - 1}px)`
  );

  // Consider landscape phones as mobile too
  if (isMobileWidth || isMobileHeight) return 'mobile';
  if (isTablet) return 'tablet';
  return 'desktop';
}

/**
 * Hook that returns whether the device supports touch
 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  });

  useEffect(() => {
    // Re-check on mount (hybrid devices may change)
    const checkTouch = () => {
      setIsTouch('ontouchstart' in window || navigator.maxTouchPoints > 0);
    };

    // Some devices report touch capability only after first touch
    window.addEventListener('touchstart', checkTouch, { once: true });

    return () => {
      window.removeEventListener('touchstart', checkTouch);
    };
  }, []);

  return isTouch;
}

/**
 * Convenience hook combining layout mode and touch detection
 */
export function useResponsive() {
  const layoutMode = useLayoutMode();
  const isTouch = useIsTouchDevice();
  const isMobile = layoutMode === 'mobile';
  const isTablet = layoutMode === 'tablet';
  const isDesktop = layoutMode === 'desktop';

  return {
    layoutMode,
    isTouch,
    isMobile,
    isTablet,
    isDesktop,
    // True if we should use mobile-optimized UI (touch + small screen)
    useMobileUI: isMobile || isTablet,
  };
}

/**
 * Orientation type for responsive design
 */
export type Orientation = 'portrait' | 'landscape';

/**
 * Hook that returns the current screen orientation
 */
export function useOrientation(): Orientation {
  const isLandscape = useMediaQuery('(orientation: landscape)');
  return isLandscape ? 'landscape' : 'portrait';
}

/**
 * Hook that returns both layout mode and orientation for responsive layouts
 */
export function useMobileLayout() {
  const layoutMode = useLayoutMode();
  const orientation = useOrientation();
  const isTouch = useIsTouchDevice();
  const isMobile = layoutMode === 'mobile';

  return {
    layoutMode,
    orientation,
    isTouch,
    isMobile,
    isLandscape: orientation === 'landscape',
    isPortrait: orientation === 'portrait',
    // On mobile in landscape, we need special handling
    isMobileLandscape: isMobile && orientation === 'landscape',
    isMobilePortrait: isMobile && orientation === 'portrait',
  };
}

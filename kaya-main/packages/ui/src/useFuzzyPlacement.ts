/**
 * useFuzzyPlacement - Independent hook for fuzzy stone placement
 *
 * Architecture: Completely decoupled from board state changes
 * - Maps are created once per game
 * - Never regenerated during normal gameplay
 * - Only reset when explicitly requested (new game, dimension change)
 */

import { useRef, useCallback, useEffect } from 'react';
import { generateShiftMap, generateRandomMap, type SignMap } from '@kaya/shudan';

interface FuzzyPlacementMaps {
  shiftMap: number[][] | null;
  randomMap: number[][] | null;
}

interface UseFuzzyPlacementOptions {
  enabled: boolean;
  width: number;
  height: number;
  gameId?: string | number;
}

function createEmptySignMap(width: number, height: number): SignMap {
  return Array.from({ length: height }, () => Array.from({ length: width }, () => 0)) as SignMap;
}

/**
 * Hook for managing fuzzy stone placement maps
 *
 * CRITICAL: Maps are stable and only regenerate when:
 * 1. enabled changes from false to true
 * 2. gameId changes (new game)
 * 3. dimensions change (different board size)
 *
 * Board state changes (moves played) do NOT trigger regeneration
 */
export function useFuzzyPlacement({
  enabled,
  width,
  height,
  gameId,
}: UseFuzzyPlacementOptions): FuzzyPlacementMaps {
  // Stable references - NEVER reset during renders
  const mapsRef = useRef<FuzzyPlacementMaps>({
    shiftMap: null,
    randomMap: null,
  });

  // Track what we've initialized to prevent unnecessary regeneration
  const initializedRef = useRef<{
    gameId: string | number | null;
    width: number;
    height: number;
  } | null>(null);

  // Generate maps (called only when necessary)
  const generateMaps = useCallback(() => {
    if (width <= 0 || height <= 0) {
      mapsRef.current = { shiftMap: null, randomMap: null };
      initializedRef.current = null;
      return;
    }

    const emptySignMap = createEmptySignMap(width, height);

    mapsRef.current = {
      shiftMap: generateShiftMap(emptySignMap),
      randomMap: generateRandomMap(emptySignMap),
    };

    initializedRef.current = {
      gameId: gameId ?? null,
      width,
      height,
    };
  }, [width, height, gameId]);

  // Effect: Only regenerate when absolutely necessary
  useEffect(() => {
    if (!enabled) {
      // Clean up when disabled
      mapsRef.current = { shiftMap: null, randomMap: null };
      initializedRef.current = null;
      return;
    }

    // Check if regeneration is needed
    const needsInitialization = !initializedRef.current;
    const gameChanged =
      initializedRef.current && initializedRef.current.gameId !== (gameId ?? null);
    const dimensionsChanged =
      initializedRef.current &&
      (initializedRef.current.width !== width || initializedRef.current.height !== height);

    if (needsInitialization || gameChanged || dimensionsChanged) {
      generateMaps();
    }
  }, [enabled, gameId, width, height, generateMaps]);

  return mapsRef.current;
}

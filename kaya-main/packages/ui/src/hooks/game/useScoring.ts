import { useState, useCallback, useEffect } from 'react';
import { type Vertex, type GoBoard } from '@kaya/goboard';
import { guess } from '@kaya/deadstones';
import { calculateTerritory } from '../../services/scoring';
import { type GameInfo } from '../../types/game';

interface UseScoringProps {
  currentBoard: GoBoard | null;
  gameInfo: GameInfo;
}

export function useScoring({ currentBoard, gameInfo }: UseScoringProps) {
  const [scoreMode, setScoreMode] = useState(false);
  const [deadStones, setDeadStones] = useState<Set<string>>(new Set());
  const [isEstimating, setIsEstimating] = useState(false);
  const [territoryMap, setTerritoryMap] = useState<number[][] | null>(null);
  const [scoreResult, setScoreResult] = useState<any>(null);

  const vertexToKey = useCallback((vertex: Vertex): string => {
    return `${vertex[0]},${vertex[1]}`;
  }, []);

  const autoScore = useCallback(async () => {
    if (!currentBoard) return;

    try {
      setIsEstimating(true);
      // Use deadstones to guess dead stones
      const deadVertices = await guess(currentBoard.signMap, {
        finished: true,
        iterations: 100,
      });

      // Update dead stones
      const newDeadStones = new Set<string>();
      deadVertices.forEach(v => newDeadStones.add(v.toString()));
      setDeadStones(newDeadStones);

      // Calculate territory based on dead stones
      const territoryResult = calculateTerritory(currentBoard.signMap, newDeadStones);

      // Calculate dead stones count for score
      let blackDead = 0;
      let whiteDead = 0;
      newDeadStones.forEach(key => {
        const [x, y] = key.split(',').map(Number);
        const sign = currentBoard.get([x, y]);
        if (sign === 1) blackDead++;
        else if (sign === -1) whiteDead++;
      });

      // Update score result
      const komi = parseFloat(String(gameInfo.komi || 0));
      const blackCaptures = currentBoard.getCaptures(1) + whiteDead; // White stones dead = Black captures
      const whiteCaptures = currentBoard.getCaptures(-1) + blackDead; // Black stones dead = White captures

      const score = {
        black: {
          territory: territoryResult.blackTerritory,
          captures: blackCaptures,
          total: territoryResult.blackTerritory + blackCaptures,
        },
        white: {
          territory: territoryResult.whiteTerritory,
          captures: whiteCaptures,
          komi: komi,
          total: territoryResult.whiteTerritory + whiteCaptures + komi,
        },
        winner:
          territoryResult.blackTerritory + blackCaptures >
          territoryResult.whiteTerritory + whiteCaptures + komi
            ? 'Black'
            : 'White',
        diff: Math.abs(
          territoryResult.blackTerritory +
            blackCaptures -
            (territoryResult.whiteTerritory + whiteCaptures + komi)
        ),
      };

      setTerritoryMap(territoryResult.territories);
      setScoreResult(score);
    } catch (error) {
      console.error('Auto-score failed:', error);
    } finally {
      setIsEstimating(false);
    }
  }, [currentBoard, gameInfo.komi]);

  // Auto-score when entering score mode
  useEffect(() => {
    if (scoreMode) {
      autoScore();
    } else {
      setDeadStones(new Set());
      setTerritoryMap(null);
      setScoreResult(null);
    }
  }, [scoreMode, autoScore]);

  const toggleDeadStone = useCallback(
    (vertexOrVertices: Vertex | Vertex[]) => {
      if (!currentBoard) return;

      const vertices = (
        Array.isArray(vertexOrVertices[0]) ? vertexOrVertices : [vertexOrVertices]
      ) as Vertex[];

      const newDeadStones = new Set(deadStones);

      vertices.forEach(vertex => {
        const key = vertex.toString();
        if (newDeadStones.has(key)) {
          newDeadStones.delete(key);
        } else {
          newDeadStones.add(key);
        }
      });

      setDeadStones(newDeadStones);

      // Recalculate territory immediately
      const territoryResult = calculateTerritory(currentBoard.signMap, newDeadStones);

      // Calculate dead stones count for score
      let blackDead = 0;
      let whiteDead = 0;
      newDeadStones.forEach(k => {
        const [x, y] = k.split(',').map(Number);
        const s = currentBoard.get([x, y]);
        if (s === 1) blackDead++;
        else if (s === -1) whiteDead++;
      });

      const komi = parseFloat(String(gameInfo.komi || 0));
      const blackCaptures = currentBoard.getCaptures(1) + whiteDead;
      const whiteCaptures = currentBoard.getCaptures(-1) + blackDead;

      const score = {
        black: {
          territory: territoryResult.blackTerritory,
          captures: blackCaptures,
          total: territoryResult.blackTerritory + blackCaptures,
        },
        white: {
          territory: territoryResult.whiteTerritory,
          captures: whiteCaptures,
          komi: komi,
          total: territoryResult.whiteTerritory + whiteCaptures + komi,
        },
        winner:
          territoryResult.blackTerritory + blackCaptures >
          territoryResult.whiteTerritory + whiteCaptures + komi
            ? 'Black'
            : 'White',
        diff: Math.abs(
          territoryResult.blackTerritory +
            blackCaptures -
            (territoryResult.whiteTerritory + whiteCaptures + komi)
        ),
      };

      setTerritoryMap(territoryResult.territories);
      setScoreResult(score);
    },
    [currentBoard, deadStones, gameInfo.komi]
  );

  const resetScore = useCallback(() => {
    setDeadStones(new Set());
    setTerritoryMap(null);
    setScoreResult(null);
  }, []);

  return {
    scoreMode,
    setScoreMode,
    scoreResult,
    deadStones,
    toggleDeadStone,
    autoScore,
    resetScore,
    territoryMap,
    isEstimating,
  };
}

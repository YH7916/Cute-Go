import { attemptMove } from '../go/rules';
import { getBeginnerAIMove } from '../go/ai';
import type { BoardState, Player } from '../../types';
import type { AnalysisResult } from './engine';
type RankedMove = AnalysisResult['moves'][number] & { weight?: number; logit?: number };
const sampleIndexByWeight = (weights: number[]) => {
    const total = weights.reduce((sum, weight) => sum + weight, 0);
    if (total <= 0) return 0;

    let roll = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        roll -= weights[i];
        if (roll <= 0) return i;
    }
    return weights.length - 1;
};

const getDifficultyPoolSize = (difficulty?: 'Fun' | 'Easy' | 'Medium' | 'Hard') => {
    if (difficulty === 'Medium') return 8;
    return Infinity;
};

const getDifficultyRankBias = (difficulty: 'Fun' | 'Easy' | 'Medium' | 'Hard' | undefined, rank: number) => {
    if (difficulty === 'Medium') {
        // 峰值在 rank 2-3，偶尔选次优棋
        const table = [0.5, 0.85, 1.0, 0.9, 0.6, 0.35, 0.15, 0.05];
        return table[rank] ?? 0.03;
    }

    return 1;
};

export const selectMoveByDifficulty = (
    candidates: RankedMove[],
    validationBoard: BoardState,
    color: Player,
    previousBoardHash: string | null,
    difficulty?: 'Fun' | 'Easy' | 'Medium' | 'Hard'
) => {
    if (difficulty === 'Easy') {
        return getBeginnerAIMove(validationBoard, color, previousBoardHash, candidates);
    }
    const poolSize = Math.min(candidates.length, getDifficultyPoolSize(difficulty));
    const weightedPool = candidates
        .slice(0, poolSize)
        .map((candidate, rank) => ({ candidate, rank }));

    while (weightedPool.length > 0) {
        const weights = weightedPool.map(({ candidate, rank }) => {
            const baseWeight = Math.max(candidate.weight || candidate.prior || 0.0001, 0.0001);
            return baseWeight * getDifficultyRankBias(difficulty, rank);
        });

        const selectedIndex = sampleIndexByWeight(weights);
        const [{ candidate }] = weightedPool.splice(selectedIndex, 1);

        if (candidate.x === -1) {
            if (difficulty === 'Medium') {
                continue;
            }
            return null;
        }

        if (attemptMove(validationBoard, candidate.x, candidate.y, color, 'Go', previousBoardHash)) {
            return { x: candidate.x, y: candidate.y };
        }
    }

    for (const candidate of candidates) {
        if (candidate.x === -1) return null;
        if (attemptMove(validationBoard, candidate.x, candidate.y, color, 'Go', previousBoardHash)) {
            return { x: candidate.x, y: candidate.y };
        }
    }

    return undefined;
};

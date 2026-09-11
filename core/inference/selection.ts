import { attemptMove } from '../go/rules';
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
    if (difficulty === 'Easy') {
        // 峰值在 rank 8-12，让 AI 倾向于选较差的棋而不是最好的
        // rank 0-3（最好的棋）权重很低，rank 8-12 权重最高
        const table = [0.05, 0.08, 0.12, 0.18, 0.35, 0.55, 0.75, 0.90, 1.0, 1.0, 0.95, 0.85, 0.70, 0.50, 0.30, 0.15, 0.08, 0.05, 0.03, 0.02];
        return table[rank] ?? 0.01;
    }

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
            if (difficulty === 'Easy' || difficulty === 'Medium') {
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

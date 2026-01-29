import { MicroBoard, type Sign } from './micro-board';
import { JosekiEngine } from './joseki';

/**
 * Local AI for Go using Alpha-Beta Pruning.
 * Designed for "Easy" difficulty to provide fast, locally computed moves.
 */
export class LocalGoAI {
    private maxDepth: number = 2; 
    private size: number;
    private joseki: JosekiEngine;

    constructor(size: number) {
        this.size = size;
        this.joseki = new JosekiEngine(size);
    }

    /**
     * Entry point to get the best move for the current board state.
     */
    getBestMove(board: MicroBoard, color: Sign): { x: number; y: number } | null {
        // Priority 1: Joseki (Opening Patterns)
        // This makes the AI look much "smarter" in corners
        const josekiMove = this.joseki.getJosekiMove(board, color);
        if (josekiMove) {
            console.log(`[LocalAI] Joseki move found: (${josekiMove.x}, ${josekiMove.y})`);
            return josekiMove;
        }

        // Pruning: Only consider moves near existing stones
        const candidates = this.getCandidateMoves(board, color);
        if (candidates.length === 0) {
            // Empty board? Play a corner or star point
            const star = Math.floor(this.size > 13 ? 3 : 2);
            if (board.isLegal(star, star, color)) return { x: star, y: star };
            // Fallback for smaller boards
            const center = Math.floor(this.size / 2);
            if (board.isLegal(center, center, color)) return { x: center, y: center };
            return null;
        }

        let bestScore = -Infinity;
        let bestMove: { x: number; y: number } | null = null;

        // Shuffle candidates slightly
        candidates.sort(() => Math.random() - 0.5);

        // Pre-evaluate at depth 1 to pick top N for depth 2 search
        let scoredCandidates = candidates.map(move => {
            const nextBoard = board.clone();
            nextBoard.play(move.x, move.y, color);
            return { move, score: this.evaluate(nextBoard, color) };
        });

        // Take top 20 for full search (speeds up thinking time immensely)
        scoredCandidates.sort((a,b) => b.score - a.score);
        const topCandidates = scoredCandidates.slice(0, 15);

        for (const item of topCandidates) {
            const move = item.move;
            const nextBoard = board.clone();
            nextBoard.play(move.x, move.y, color);
            
            // Search at depth 1 or 2
            const score = this.alphaBeta(nextBoard, this.maxDepth - 1, -Infinity, Infinity, false, color);
            
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        return bestMove;
    }

    /**
     * Alpha-Beta Pruning Search
     */
    private alphaBeta(board: MicroBoard, depth: number, alpha: number, beta: number, isMaximizing: boolean, aiColor: Sign): number {
        if (depth === 0) {
            return this.evaluate(board, aiColor);
        }

        const color = isMaximizing ? aiColor : (aiColor === 1 ? -1 : 1) as Sign;
        // Pruned candidates in search as well
        const candidates = this.getCandidateMoves(board, color).slice(0, 10);

        if (candidates.length === 0) {
            return this.evaluate(board, aiColor);
        }

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of candidates) {
                const nextBoard = board.clone();
                if (!nextBoard.play(move.x, move.y, color)) continue;
                const evaluation = this.alphaBeta(nextBoard, depth - 1, alpha, beta, false, aiColor);
                maxEval = Math.max(maxEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of candidates) {
                const nextBoard = board.clone();
                if (!nextBoard.play(move.x, move.y, color)) continue;
                const evaluation = this.alphaBeta(nextBoard, depth - 1, alpha, beta, true, aiColor);
                minEval = Math.min(minEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    /**
     * Improved Evaluation Function
     */
    public evaluate(board: MicroBoard, aiColor: Sign): number {
        let score = 0;
        const visited = new Set<number>();

        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const idx = y * this.size + x;
                if (visited.has(idx)) continue;
                
                const stone = board.get(x, y);
                if (stone === 0) continue;

                const multiplier = stone === aiColor ? 1 : -1;
                
                // Group Evaluation
                const group = board.getGroup(x, y);
                if (group) {
                    group.stones.forEach(sIdx => visited.add(sIdx));
                    const stoneCount = group.stones.length;
                    const liberties = group.liberties.length;

                    // 1. Material
                    score += stoneCount * 100 * multiplier;

                    // 2. Liberties (Atari Detection)
                    if (liberties === 1) {
                        score -= 500 * multiplier; // HUGE penalty if group is in atari
                    } else if (liberties === 2) {
                        score -= 100 * multiplier; // High penalty if low liberties
                    } else {
                        score += liberties * 10 * multiplier;
                    }

                    // 3. Group Strength
                    // More stones with fewer liberties is more dangerous
                    if (stoneCount > 1 && liberties < 3) {
                         score -= 50 * multiplier;
                    }
                }

                // 4. Position Weights (Individual stones)
                if (this.isCorner(x, y)) score += 20 * multiplier;
                else if (this.isEdge(x, y)) score += 5 * multiplier;
            }
        }

        return score;
    }

    private getCandidateMoves(board: MicroBoard, color: Sign): { x: number; y: number }[] {
        const candidates = new Set<number>();
        let boardEmpty = true;

        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (board.get(x, y) !== 0) {
                    boardEmpty = false;
                    // Add neighbors within distance 2
                    for (let dy = -2; dy <= 2; dy++) {
                        for (let dx = -2; dx <= 2; dx++) {
                            const nx = x + dx;
                            const ny = y + dy;
                            if (board.isValid(nx, ny) && board.get(nx, ny) === 0) {
                                candidates.add(ny * this.size + nx);
                            }
                        }
                    }
                }
            }
        }

        // Add Star Points (Sanrensei, etc) to give some global variety
        const stars = this.size > 13 ? [3, this.size - 4, Math.floor(this.size / 2)] : [2, this.size - 3, Math.floor(this.size / 2)];
        for (const sy of stars) {
            for (const sx of stars) {
                if (board.get(sx, sy) === 0) {
                    candidates.add(sy * this.size + sx);
                }
            }
        }

        if (boardEmpty && candidates.size === 0) return [];

        const results: { x: number; y: number }[] = [];
        candidates.forEach(idx => {
            const x = idx % this.size;
            const y = Math.floor(idx / this.size);
            if (board.isLegal(x, y, color)) {
                results.push({ x, y });
            }
        });
        return results;
    }

    private isCorner(x: number, y: number): boolean {
        return (x === 0 || x === this.size - 1) && (y === 0 || y === this.size - 1);
    }

    private isEdge(x: number, y: number): boolean {
        return x === 0 || x === this.size - 1 || y === 0 || y === this.size - 1;
    }
}

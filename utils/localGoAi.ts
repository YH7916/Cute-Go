import { MicroBoard, type Sign } from './micro-board';

/**
 * Local AI for Go using Alpha-Beta Pruning.
 * Designed for "Easy" difficulty to provide fast, locally computed moves.
 */
export class LocalGoAI {
    private maxDepth: number = 2; // Shallow search for "Easy" mode
    private size: number;

    constructor(size: number) {
        this.size = size;
    }

    /**
     * Entry point to get the best move for the current board state.
     */
    getBestMove(board: MicroBoard, color: Sign): { x: number; y: number } | null {
        let bestScore = -Infinity;
        let bestMove: { x: number; y: number } | null = null;

        const legalMoves = this.getLegalMoves(board, color);
        if (legalMoves.length === 0) return null; // Pass

        // Shuffle moves to add some variety
        legalMoves.sort(() => Math.random() - 0.5);

        for (const move of legalMoves) {
            const nextBoard = board.clone();
            nextBoard.play(move.x, move.y, color);
            
            const score = this.alphaBeta(nextBoard, this.maxDepth - 1, -Infinity, Infinity, false, color);
            
            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        }

        // Heuristic: If best move score is extremely low, AI might prefer passing, 
        // but for "Easy" mode we usually want it to keep playing.
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
        const legalMoves = this.getLegalMoves(board, color);

        if (legalMoves.length === 0) {
            // Simulated Pass
            return this.evaluate(board, aiColor);
        }

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of legalMoves) {
                const nextBoard = board.clone();
                nextBoard.play(move.x, move.y, color);
                const evaluation = this.alphaBeta(nextBoard, depth - 1, alpha, beta, false, aiColor);
                maxEval = Math.max(maxEval, evaluation);
                alpha = Math.max(alpha, evaluation);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of legalMoves) {
                const nextBoard = board.clone();
                nextBoard.play(move.x, move.y, color);
                const evaluation = this.alphaBeta(nextBoard, depth - 1, alpha, beta, true, aiColor);
                minEval = Math.min(minEval, evaluation);
                beta = Math.min(beta, evaluation);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    /**
     * Simplified Evaluation Function
     */
    private evaluate(board: MicroBoard, aiColor: Sign): number {
        let score = 0;
        const opponent = (aiColor === 1 ? -1 : 1) as Sign;

        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                const stone = board.get(x, y);
                if (stone === 0) continue;

                const multiplier = stone === aiColor ? 1 : -1;
                
                // 1. Material (Stone Count)
                score += 20 * multiplier;

                // 2. Liberties (Crucial for Go)
                const liberties = board.getLiberties(x, y);
                score += liberties * 4 * multiplier;

                // 3. Position Weights
                if (this.isCorner(x, y)) score += 10 * multiplier;
                else if (this.isEdge(x, y)) score += 5 * multiplier;
            }
        }

        return score;
    }

    private getLegalMoves(board: MicroBoard, color: Sign): { x: number; y: number }[] {
        const moves: { x: number; y: number }[] = [];
        for (let y = 0; y < this.size; y++) {
            for (let x = 0; x < this.size; x++) {
                if (board.isLegal(x, y, color)) {
                    moves.push({ x, y });
                }
            }
        }
        return moves;
    }

    private isCorner(x: number, y: number): boolean {
        return (x === 0 || x === this.size - 1) && (y === 0 || y === this.size - 1);
    }

    private isEdge(x: number, y: number): boolean {
        return x === 0 || x === this.size - 1 || y === 0 || y === this.size - 1;
    }
}

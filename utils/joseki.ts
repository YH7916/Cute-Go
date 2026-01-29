import { MicroBoard, type Sign } from './micro-board';

/**
 * Basic Joseki Library for Easy AI.
 * Focuses on common 4-4 and 3-4 corner patterns.
 */

export interface Point {
    x: number;
    y: number;
}

export class JosekiEngine {
    private size: number;

    constructor(size: number) {
        this.size = size;
    }

    /**
     * Tries to find a standard joseki move based on the local corner situation.
     */
    getJosekiMove(board: MicroBoard, color: Sign): Point | null {
        // Corners: Top-Left, Top-Right, Bottom-Left, Bottom-Right
        const corners = [
            { xRange: [0, 8], yRange: [0, 8], cornerId: 0 },
            { xRange: [this.size - 9, this.size - 1], yRange: [0, 8], cornerId: 1 },
            { xRange: [0, 8], yRange: [this.size - 9, this.size - 1], cornerId: 2 },
            { xRange: [this.size - 9, this.size - 1], yRange: [this.size - 9, this.size - 1], cornerId: 3 }
        ];

        for (const corner of corners) {
            const move = this.matchCorner(board, corner, color);
            if (move) return move;
        }

        return null;
    }

    private matchCorner(board: MicroBoard, corner: { xRange: number[], yRange: number[], cornerId: number }, color: Sign): Point | null {
        // 1. Extract pieces in the corner and normalize to Canonical (Top-Left)
        const pieces: { x: number, y: number, color: Sign }[] = [];
        for (let y = corner.yRange[0]; y <= corner.yRange[1]; y++) {
            for (let x = corner.xRange[0]; x <= corner.xRange[1]; x++) {
                const val = board.get(x, y);
                if (val !== 0) {
                    const canon = this.getCanonicalCoords(x, y, corner.cornerId);
                    pieces.push({ x: canon.x, y: canon.y, color: val });
                }
            }
        }

        if (pieces.length === 0) return null;

        // 2. Lookup canonical pattern
        const josekiMove = this.lookupJoseki(pieces, color);
        if (josekiMove) {
            // Check if move is legal on the REAL board
            const realMove = this.fromCanonical(josekiMove.x, josekiMove.y, corner.cornerId);
            if (board.isLegal(realMove.x, realMove.y, color)) {
                return realMove;
            }
        }

        return null;
    }

    private getCanonicalCoords(x: number, y: number, cornerId: number): Point {
        let lx, ly;
        switch (cornerId) {
            case 0: lx = x; ly = y; break; // TL
            case 1: lx = (this.size - 1) - x; ly = y; break; // TR
            case 2: lx = x; ly = (this.size - 1) - y; break; // BL
            case 3: lx = (this.size - 1) - x; ly = (this.size - 1) - y; break; // BR
            default: lx = x; ly = y;
        }
        return { x: lx, y: ly };
    }

    private fromCanonical(lx: number, ly: number, cornerId: number): Point {
        let x, y;
        switch (cornerId) {
            case 0: x = lx; y = ly; break;
            case 1: x = (this.size - 1) - lx; y = ly; break;
            case 2: x = lx; y = (this.size - 1) - ly; break;
            case 3: x = (this.size - 1) - lx; y = (this.size - 1) - ly; break;
            default: x = lx; y = ly;
        }
        return { x, y };
    }

    private lookupJoseki(pieces: { x: number, y: number, color: Sign }[], aiColor: Sign): Point | null {
        // Normalize colors relative to the first stone in the corner
        const firstStone = pieces[0].color;
        const normalizedPieces = pieces.map(p => ({
             x: p.x, y: p.y, relColor: p.color === firstStone ? 1 : -1
        }));

        // Table Coords are Canonical Top-Left
        const table: Record<string, Point> = {
            // --- 4-4 (Hoshi) Patterns ---
            // 3,3,1 = Star point exists
            "3,3,1": { x: 5, y: 2 }, // Enclose corner (Shimari)
            "3,3,1|3,6,-1": { x: 5, y: 2 }, // Response to knight approach
            "3,3,1|6,3,-1": { x: 2, y: 5 }, // Response to knight approach (symmetry)
            "3,3,1|2,5,-1": { x: 2, y: 2 }, // Response to high approach
            "3,3,1|5,2,-1": { x: 2, y: 2 }, // Response to high approach (symmetry)

            // --- 3-4 (Komoku) Patterns ---
            // 2,3,1 = Komoku exists
            "2,3,1": { x: 5, y: 3 }, // Knight approach
            "3,2,1": { x: 3, y: 5 }, // Knight approach (symmetry)
            "2,3,1|5,3,-1": { x: 3, y: 5 }, // knight response to knight approach
            
            // --- 3,3 (Sansan) Patterns ---
            "3,3,1|2,2,-1": { x: 2, y: 3 }, // blocked sansan
            "3,3,1|2,2,-1|2,3,1": { x: 3, y: 2 }, // hane
        };

        const getSig = (pts: {x: number, y: number, relColor: number}[]) => 
            pts.map(p => `${p.x},${p.y},${p.relColor}`).sort().join('|');

        // Try direct
        let res = table[getSig(normalizedPieces)];
        if (res) return res;

        // Try X/Y Swap
        const swapped = normalizedPieces.map(p => ({ x: p.y, y: p.x, relColor: p.relColor }));
        res = table[getSig(swapped)];
        if (res) return { x: res.y, y: res.x };

        return null;
    }
}

/**
 * Static helper for legacy code compatibility (goLogic.ts)
 */
export function getJosekiMove(boardState: any[][], size: number, player: 'black' | 'white'): Point | null {
    const board = new MicroBoard(size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const stone = boardState[y][x];
            if (stone) {
                board.set(x, y, stone.color === 'black' ? 1 : -1);
            }
        }
    }
    const color: Sign = player === 'black' ? 1 : -1;
    const engine = new JosekiEngine(size);
    return engine.getJosekiMove(board, color);
}

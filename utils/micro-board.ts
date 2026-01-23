export type Sign = -1 | 0 | 1; // -1: White, 1: Black, 0: Empty

export interface Point {
    x: number;
    y: number;
}

export class MicroBoard {
    size: number;
    board: Int8Array;
    ko: number; // Index of the Ko point, -1 if none

    constructor(size: number) {
        this.size = size;
        this.board = new Int8Array(size * size).fill(0);
        this.ko = -1;
    }

    clone(): MicroBoard {
        const newB = new MicroBoard(this.size);
        newB.board.set(this.board);
        newB.ko = this.ko;
        return newB;
    }

    // Helper to get index
    idx(x: number, y: number): number {
        return y * this.size + x;
    }

    // Helper to get coordinates
    xy(idx: number): Point {
        return { x: idx % this.size, y: Math.floor(idx / this.size) };
    }

    get(x: number, y: number): Sign {
        if (x < 0 || x >= this.size || y < 0 || y >= this.size) return 0;
        return this.board[y * this.size + x] as Sign;
    }

    set(x: number, y: number, c: Sign) {
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
            this.board[y * this.size + x] = c;
        }
    }

    // Check if on board
    isValid(x: number, y: number): boolean {
        return x >= 0 && x < this.size && y >= 0 && y < this.size;
    }

    // Get group info (stones and liberties)
    getGroup(x: number, y: number): { stones: number[], liberties: number[] } | null {
        const idx = this.idx(x, y);
        const color = this.board[idx];
        if (color === 0) return null;

        const stack = [idx];
        const stones = new Set<number>([idx]);
        const liberties = new Set<number>();
        const visited = new Set<number>([idx]);

        while (stack.length > 0) {
            const curr = stack.pop()!;
            const cXY = this.xy(curr);
            const neighbors = [
                { x: cXY.x - 1, y: cXY.y },
                { x: cXY.x + 1, y: cXY.y },
                { x: cXY.x, y: cXY.y - 1 },
                { x: cXY.x, y: cXY.y + 1 }
            ];

            for (const n of neighbors) {
                if (!this.isValid(n.x, n.y)) continue;
                const nIdx = this.idx(n.x, n.y);
                const val = this.board[nIdx];

                if (val === 0) {
                    liberties.add(nIdx);
                } else if (val === color && !visited.has(nIdx)) {
                    visited.add(nIdx);
                    stones.add(nIdx);
                    stack.push(nIdx);
                }
            }
        }

        return {
            stones: Array.from(stones),
            liberties: Array.from(liberties)
        };
    }

    getLiberties(x: number, y: number): number {
        const group = this.getGroup(x, y);
        return group ? group.liberties.length : 0;
    }

    // Play a move. Returns true if successful, false if illegal.
    // Handles capture and ko.
    play(x: number, y: number, color: Sign): boolean {
        if (!this.isValid(x, y) || this.board[this.idx(x, y)] !== 0) return false;
        
        const idx = this.idx(x, y);
        if (idx === this.ko) return false; // Ko rule

        // Optimistic placement
        this.board[idx] = color;
        
        let capturedCount = 0;
        let capturedStoneIdx = -1;
        const opponent = color === 1 ? -1 : 1;
        const cXY = {x, y};
        const neighbors = [
            { x: cXY.x - 1, y: cXY.y },
            { x: cXY.x + 1, y: cXY.y },
            { x: cXY.x, y: cXY.y - 1 },
            { x: cXY.x, y: cXY.y + 1 }
        ];

        // Check captures
        const deadGroups: number[][] = [];
        for (const n of neighbors) {
            if (!this.isValid(n.x, n.y)) continue;
            const nIdx = this.idx(n.x, n.y);
            if (this.board[nIdx] === opponent) {
                const group = this.getGroup(n.x, n.y);
                if (group && group.liberties.length === 0) {
                    deadGroups.push(group.stones);
                }
            }
        }

        // Remove dead stones
        for (const stones of deadGroups) {
            for (const sIdx of stones) {
                this.board[sIdx] = 0;
                capturedCount++;
                capturedStoneIdx = sIdx;
            }
        }

        // Check suicide
        if (capturedCount === 0 && this.getLiberties(x, y) === 0) {
            this.board[idx] = 0; // Revert
            return false;
        }

        // Update Ko
        if (capturedCount === 1 && deadGroups.length === 1 && this.getGroup(x, y)!.liberties.length === 1 && this.getGroup(x, y)!.stones.length === 1) {
             this.ko = capturedStoneIdx;
        } else {
             this.ko = -1;
        }

        return true;
    }

    isLegal(x: number, y: number, color: Sign): boolean {
        if (!this.isValid(x, y) || this.board[this.idx(x, y)] !== 0) return false;
        const idx = this.idx(x, y);
        if (idx === this.ko) return false;

        const opponent = color === 1 ? -1 : 1;
        const cXY = {x, y};
        const neighbors = [
            { x: cXY.x - 1, y: cXY.y },
            { x: cXY.x + 1, y: cXY.y },
            { x: cXY.x, y: cXY.y - 1 },
            { x: cXY.x, y: cXY.y + 1 }
        ];

        let specificCapture = false;
        for (const n of neighbors) {
            if (!this.isValid(n.x, n.y)) continue;
            const nIdx = this.idx(n.x, n.y);
            if (this.board[nIdx] === opponent) {
                // If opponent group has only 1 liberty (which must be 'idx'), it is captured.
                const group = this.getGroup(n.x, n.y);
                if (group && group.liberties.length === 1 && group.liberties[0] === idx) {
                    specificCapture = true;
                    // Optimisation: If we capture something, we are definitely safe (unless ko, but ko is checked above).
                    // Actually, if we capture, we have liberties at the captured stones' spots.
                }
            }
        }

        if (specificCapture) return true;

        // If no capture, check self-liberties (suicide check)
        // We simulate placement virtually
        this.board[idx] = color;
        const libs = this.getLiberties(x, y);
        this.board[idx] = 0; // Revert
        
        return libs > 0;
    }
}

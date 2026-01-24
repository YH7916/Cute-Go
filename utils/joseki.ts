import { BoardState, Player, Point } from '../types';

// Helper: Rotate/Flip a point to match canonical orientation
// Canonical: Top-Left corner (0,0)
type Transformation = {
    rotate: 0 | 90 | 180 | 270;
    flip: boolean;
};

// All 8 symmetries for a corner check
const SYMMETRIES: Transformation[] = [
    { rotate: 0, flip: false },
    { rotate: 90, flip: false },
    { rotate: 180, flip: false },
    { rotate: 270, flip: false },
    { rotate: 0, flip: true },
    { rotate: 90, flip: true },
    { rotate: 180, flip: true },
    { rotate: 270, flip: true },
];

// Transform a point (x,y) from Canonical (Top-Left) to Actual Board
const transform = (pt: Point, size: number, trans: Transformation): Point => {
    let x = pt.x;
    let y = pt.y;

    // 1. Flip (Horizontal flip around center vertical axis? No, simplify to standard D4 symmetry group)
    // Let's assume Canonical is Top-Left (0..size/2, 0..size/2)
    // Actually, simple matrix approach is safer.
    
    // Rotate first
    // Center is (size-1)/2
    // But working with integer indices, better to just map corners.
    
    // Easier approach: Use relative coordinates from the Corner being checked.
    // If checking Top-Left (0,0):
    // x, y are as is.
    // If checking Top-Right (size-1, 0):
    // x' = size-1 - x, y' = y
    // But we also need to handle xy-swap (transpose) for symmetry.
    
    // Let's refine:
    // We check 4 corners.
    // For each corner, we check 2 orientations (Normal and Transposed/xy-swapped).
    // Start with normalized coordinates (dx, dy) from the corner.
    
    return {x, y}; // Placeholder, logic handled in getJosekiMove
};

export const getJosekiMove = (board: BoardState, size: number, player: Player): Point | null => {
    // Only support 9x9, 13x13, 19x19 where corners are standard
    // Actually 9x9 is special "Tengen" game usually, but 3-3/4-4 still apply.
    // Let's focus on corner patterns.
    
    // 1. Identify Corners
    // Top-Left, Top-Right, Bottom-Left, Bottom-Right
    const corners = [
        { bx: 0, by: 0, dx: 1, dy: 1 },        // TL
        { bx: size-1, by: 0, dx: -1, dy: 1 },  // TR
        { bx: 0, by: size-1, dx: 1, dy: -1 },  // BL
        { bx: size-1, by: size-1, dx: -1, dy: -1 } // BR
    ];

    const opponent = player === 'black' ? 'white' : 'black';

    for (const c of corners) {
        // We define a local 6x6 grid wrapper to query stones easily relative to corner
        // "Local (u, v)" where u,v in [0..5]
        // u is horizontal distance from corner, v is vertical distance
        const get = (u: number, v: number) => {
             const tx = c.bx + u * c.dx;
             const ty = c.by + v * c.dy;
             if (tx < 0 || tx >= size || ty < 0 || ty >= size) return 'WALL';
             const s = board[ty][tx];
             if (!s) return 'EMPTY';
             return s.color === player ? 'ME' : 'OPP';
        };

        // We check two main orientations for the corner:
        // 1. Normal (u=x-dist, v=y-dist)
        // 2. Transposed (u=y-dist, v=x-dist) - because patterns are symmetric across diagonal usually,
        //    but specific responses (like knight approach) have direction.
        
        // We iterate twice: swap=false, swap=true
        for (let swap = 0; swap < 2; swap++) {
            const query = (u: number, v: number) => swap ? get(v, u) : get(u, v);
            const makeMove = (u: number, v: number) => {
                 const finalU = swap ? v : u;
                 const finalV = swap ? u : v;
                 return { x: c.bx + finalU * c.dx, y: c.by + finalV * c.dy };
            };

            // === 19x19 / 13x13 Patterns ===
            if (size >= 13) {
                 // --- 4-4 Point (Star) Patterns ---
                 // Star is at (3,3) (0-indexed)
                 if (query(3,3) === 'OPP' && query(2,5) === 'EMPTY' && query(5,2) === 'EMPTY') {
                     // Enemy Star Point, I have no approach yet.
                     // Approach! Small Knight (5,3) or Large Knight (6,3)?
                     // Check if simple approach is valid
                     if (query(5,3) === 'EMPTY') return makeMove(5,3); // Small Knight Approach (Standard)
                 }

                 // If I have a Star Point (3,3) and Enemy Approaches (5,3)
                 if (query(3,3) === 'ME' && query(5,3) === 'OPP' && query(2,5) === 'EMPTY') {
                     // Respond!
                     // 1. Small Knight Extension (Shimari? No, response) -> (2,5)? No that's shimari direction.
                     // Standard response to (5,3) approach is usually:
                     // a) (1,5) Small Knight Enclosure/Response (Kosumi-ish relative to corner?)
                     // Standard: Back off to (3,1)? No.
                     // Diagonal attachment? (5,4)? 
                     // Simple response: (1,5) Knight's move?
                     // A generic good move is (1,5) or (2,6).
                     if (query(1,5) === 'EMPTY') return makeMove(1,5); 
                     // Or pincer?
                 }

                 // --- 3-4 Point (Komoku) Patterns ---
                 // Komoku at (2,3) (or 3,2 via swap)
                 if (query(2,3) === 'OPP') {
                      // Approach to 3-4? 
                      // (4,5) Small Knight high. (4,4) High approach? No 4-4 is Star.
                      // Standard low approach is (4,5).
                      if (query(4,5) === 'EMPTY') return makeMove(4,5);
                 }
                 
                 // Enclosure (Shimari)
                 // I have 3-4 (2,3), empty around.
                 if (query(2,3) === 'ME' && query(4,5) === 'EMPTY' && query(0,2) === 'EMPTY') {
                      // Small Knight Enclosure: (4,2)
                      // Large Knight Enclosure: (5,2)
                      if (query(4,2) === 'EMPTY') return makeMove(4,2);
                 }

                 // --- 3-3 Invasion (Sansan) ---
                 // If enemy has 4-4 (3,3) and I want territory or it's late opening.
                 // This is aggressive. Maybe check if corner is open.
                 if (query(3,3) === 'OPP' && query(2,2) === 'EMPTY' && query(2,3) === 'EMPTY' && query(3,2) === 'EMPTY') {
                      // 3-3 is available.
                      // Only invade if supported? Or just heuristic?
                      // Let's create a move with specific type for weighting?
                      // Just return it.
                      // return makeMove(2,2); // Maybe too aggressive for early game without support?
                 }
            } 
            else if (size === 9) {
                // === 9x9 Patterns ===
                // Center is (4,4)
                
                // 1. Opening: If center taken by Opp, take 3-3 or 3-4?
                // Or if center taken by Me, take 3-3?
                
                // Response to 4-4 (Tengen/Center if viewed locally? No 4,4 is center).
                // If Opp is at (4,4) [Center], standard response is (2,4) or (2,3) or (2,2) (3-3 point).
                // On 9x9, (2,2) is the 3-3 point (SanSan).
                if (query(2,2) === 'EMPTY' && query(3,3) === 'EMPTY' && query(4,4) === 'OPP') {
                    // Invade/Approach corner
                    return makeMove(2,2); 
                }
                
                // Shouldering: I at (2,2), Opp attempts (2,3).
                // Hane! (2,4) or (3,3)
                if (query(2,2) === 'ME' && query(2,3) === 'OPP' && query(2,4) === 'EMPTY') {
                    return makeMove(2,4);
                }
            }
        }
    }

    return null;
};

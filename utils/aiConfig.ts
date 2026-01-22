export const RANKS = [
    '18k', '17k', '16k', '15k', '14k', '13k', '12k', '11k', '10k',
    '9k', '8k', '7k', '6k', '5k', '4k', '3k', '2k', '1k',
    '1d', '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d'
];

export interface AIConfig {
    useModel: boolean;
    simulations: number;
    randomness: number; // 0-1
    heuristicFactor: number; // 1.0 = normal
}

export function getAIConfig(rank: string): AIConfig {
    const kyuMatch = rank.match(/(\d+)k/);
    const danMatch = rank.match(/(\d+)d/);

    if (kyuMatch) {
        const k = parseInt(kyuMatch[1]);
        
        // 18k -> 6k: Use Local Heuristic AI
        // Reason: Neural Network (even with 1 sim) is often 1d+ level.
        // We use Local AI for Kyu levels to give beginners a chance.
        if (k >= 6) { 
            return {
                useModel: false,
                simulations: 0,
                // 18k: 0.8 random, 6k: 0.05 random
                randomness: Math.max(0, (k - 6) * 0.08), 
                heuristicFactor: 1.0 + (18 - k) * 0.05 // Stronger heuristic for stronger kyu
            };
        }
        
        // 5k -> 1k: Start using WebAI (Neural Network)
        // 5k: 5 sims (Quick intuition)
        // 1k: 25 sims
        return {
            useModel: true,
            simulations: Math.round(5 + (5 - k) * 5), // 5, 10, 15, 20, 25
            randomness: 0,
            heuristicFactor: 1.0
        };
    }

    if (danMatch) {
        const d = parseInt(danMatch[1]);
        // 1d -> 9d
        // 1d: 30 sims
        // 9d: 150 sims (High depth)
        return {
            useModel: true,
            simulations: Math.round(30 + (d - 1) * 15),
            randomness: 0,
            heuristicFactor: 1.0 
        };
    }

    // Default to 1d
    return { useModel: true, simulations: 35, randomness: 0, heuristicFactor: 1.0 };
}

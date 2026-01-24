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
    // Environment Check
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    const simCap = isMobile ? 10 : 1000; // Cap at 10 for mobile, high for desktop

    const kyuMatch = rank.match(/(\d+)k/);
    const danMatch = rank.match(/(\d+)d/);

    if (kyuMatch) {
        const k = parseInt(kyuMatch[1]);
        
        // 18k -> 6k: Use Local Heuristic AI
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
        // Extreme Speed Optimization:
        return {
            useModel: true,
            simulations: Math.min(simCap, Math.round(1 + (5 - k) * 0.5)), // 5k=1...1k=3
            randomness: 0,
            heuristicFactor: 1.0
        };
    }

    if (danMatch) {
        const d = parseInt(danMatch[1]);
        // 1d -> 9d
        // Extreme Speed: 
        return {
            useModel: true,
            simulations: Math.min(simCap, Math.round(5 + (d - 1) * 1)), // 1d=5 ... 9d=13(capped at 10 on mobile)
            randomness: 0,
            heuristicFactor: 1.0 
        };
    }

    // Default to 5k
    return { useModel: true, simulations: 1, randomness: 0, heuristicFactor: 1.0 };
}

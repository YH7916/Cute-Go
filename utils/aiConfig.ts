export const RANKS = [
    '18k', '17k', '16k', '15k', '14k', '13k', '12k', '11k', '10k',
    '9k', '8k', '7k', '6k', '5k', '4k', '3k', '2k', '1k',
    '1d', '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d'
];

export interface AIConfig {
    useModel: boolean;
    simulations: number;
    randomness: number; // 0-1 (Deprecated, use temperature)
    temperature: number; // New: Controls Softmax sampling
    heuristicFactor: number; // 1.0 = normal
}

export function getAIConfig(rank: string): AIConfig {
    // Environment Check
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    
    // Simulations Cap:
    // Low Ranks (18k-6k): Always 1 simulation (Instant, Low Heat)
    // High Ranks: Cap at 10 for mobile to prevent overheating
    const simCap = isMobile ? 10 : 800; 

    const kyuMatch = rank.match(/(\d+)k/);
    const danMatch = rank.match(/(\d+)d/);

    if (kyuMatch) {
        const k = parseInt(kyuMatch[1]);
        
        // 18k -> 6k: Now using Neural Network (WebAI) with Temperature
        // Previously used local heuristic.
        if (k >= 6) { 
            return {
                useModel: true,
                simulations: 1, // Single Inference (Fastest, Coolest)
                randomness: 0,
                // Temperature Scaling:
                // 18k = 2.0 (High variety/mistakes)
                // 6k = 0.8 (Solid but natural)
                temperature: 0.8 + (k - 6) * 0.1, 
                heuristicFactor: 1.0
            };
        }
        
        // 5k -> 1k: Stronger
        return {
            useModel: true,
            simulations: Math.min(simCap, Math.round(1 + (5 - k) * 0.5)), // 5k=1...1k=3
            randomness: 0,
            temperature: 0.5, // Slight variety
            heuristicFactor: 1.0
        };
    }

    if (danMatch) {
        const d = parseInt(danMatch[1]);
        // 1d -> 9d
        return {
            useModel: true,
            simulations: Math.min(simCap, Math.round(5 + (d - 1) * 1)), // 1d=5 ... 9d=13
            randomness: 0,
            temperature: 0, // Best moves only (Argmax)
            heuristicFactor: 1.0 
        };
    }

    // Default
    return { useModel: true, simulations: 1, randomness: 0, temperature: 1.0, heuristicFactor: 1.0 };
}

// export const RANKS = ... (Removed)

export interface AIConfig {
    useModel: boolean;
    simulations: number;
    randomness: number; // 0-1 (Deprecated, use temperature)
    temperature: number; // New: Controls Softmax sampling
    heuristicFactor: number; // 1.0 = normal
}

export function getAIConfig(difficulty: string): AIConfig {
    // Environment Check
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    
    // Easy
    if (difficulty === 'Easy') {
        return {
            useModel: true, // Now using b6 model
            simulations: 1, 
            randomness: 0,
            temperature: 2.0, // High variety
            heuristicFactor: 1.0
        };
    }

    // Medium
    if (difficulty === 'Medium') {
         return {
            useModel: true,
            simulations: isMobile ? 2 : 4, 
            randomness: 0,
            temperature: 0.5,
            heuristicFactor: 1.0
        };
    }

    // Hard
    // Map to Strongest available within reason
    return {
        useModel: true,
        simulations: isMobile ? 10 : 25, // Stronger search
        randomness: 0,
        temperature: 0, // Best moves only
        heuristicFactor: 1.0
    };
}

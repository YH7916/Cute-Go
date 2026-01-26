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
    
    // Easy (18k equivalent)
    if (difficulty === 'Easy') {
        return {
            useModel: true,
            simulations: 1, 
            randomness: 0,
            temperature: 2.0, // High variety (Mistakes likely)
            heuristicFactor: 1.0
        };
    }

    // Medium (5k equivalent)
    if (difficulty === 'Medium') {
         return {
            useModel: true,
            simulations: isMobile ? 3 : 5, // A bit more search
            randomness: 0,
            temperature: 0.5, // Balanced
            heuristicFactor: 1.0
        };
    }

    // Legacy Fallback (Migration)
    if (difficulty.includes('k')) {
        const k = parseInt(difficulty);
        if (k >= 6) return getAIConfig('Easy'); // 18k-6k -> Easy
        return getAIConfig('Medium'); // 5k-1k -> Medium
    }
    if (difficulty.includes('d')) {
        return getAIConfig('Hard'); // 1d-9d -> Hard
    }

    // Hard (1d equivalent or higher)
    // Map to Strongest available within reason
    return {
        useModel: true,
        simulations: isMobile ? 10 : 25, // Stronger search
        randomness: 0,
        temperature: 0, // Best moves only
        heuristicFactor: 1.0
    };
}

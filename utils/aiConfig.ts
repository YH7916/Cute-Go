export interface AIConfig {
    useModel: boolean;
    simulations: number;
    randomness: number;
    temperature: number;
    heuristicFactor: number;
}

export function getAIConfig(difficulty: string): AIConfig {
    const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

    // Fun — 手写初学者AI，不加载模型
    if (difficulty === 'Fun') {
        return {
            useModel: false,
            simulations: 1,
            randomness: 0,
            temperature: 0,
            heuristicFactor: 1.0
        };
    }

    // Easy — 复用启蒙的局部候选，模型仅提供有上限的选点偏好
    if (difficulty === 'Easy') {
        return {
            useModel: true,
            simulations: 1,
            randomness: 0,
            temperature: 0,
            heuristicFactor: 1.0
        };
    }

    // Medium
    if (difficulty === 'Medium') {
        return {
            useModel: true,
            simulations: isMobile ? 2 : 4,
            randomness: 0,
            temperature: 0.22,
            heuristicFactor: 1.0
        };
    }

    // Hard
    return {
        useModel: true,
        simulations: isMobile ? 10 : 25,
        randomness: 0,
        temperature: 0,
        heuristicFactor: 1.0
    };
}

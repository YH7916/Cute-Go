import { ExtendedDifficulty } from '../hooks/useKataGo';
import { Crown, Trophy, Feather, Egg } from 'lucide-react';

export const compareVersions = (v1: string, v2: string) => {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  const len = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < len; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
};

export const calculateElo = (myRating: number, opponentRating: number, result: 'win' | 'loss'): number => {
    const kFactor = 32; // 权重系数
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
    const actualScore = result === 'win' ? 1 : 0;
    return Math.round(myRating + kFactor * (actualScore - expectedScore));
};

export const calculateNewRating = (
    playerRating: number,
    opponentRating: number,
    result: 0 | 0.5 | 1,
    kFactor: number = 16
): number => {
    const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - playerRating) / 400));
    const newRating = Math.round(playerRating + kFactor * (result - expectedScore));
    return Math.max(0, newRating);
};

export const getAiRating = (diff: ExtendedDifficulty): number => {
    // Legacy support
    if (diff === 'Easy') return 800;
    if (diff === 'Medium') return 1200;
    if (diff === 'Hard') return 1800;
    if (diff === 'Custom') return 1800;

    // Rank support
    const kyuMatch = diff.match(/(\d+)k/);
    if (kyuMatch) {
        const k = parseInt(kyuMatch[1]);
        // 18k -> 800, 1k -> 1250
        // Linear: 450 range / 17 steps = 26 per step
        return Math.round(1250 - (k - 1) * 26);
    }
    
    const danMatch = diff.match(/(\d+)d/);
    if (danMatch) {
        const d = parseInt(danMatch[1]);
        // 1d -> 1300, 9d -> 2100
        // Linear: 800 range / 8 steps = 100 per step
        return Math.round(1300 + (d - 1) * 100);
    }
    
    return 1300; // Default
};

export const getRankBadge = (elo: number) => {
  if (elo >= 1800) return { Icon: Crown, color: 'text-yellow-500', label: '皇冠' };
  if (elo >= 1500) return { Icon: Trophy, color: 'text-gray-500', label: '奖杯' };
  if (elo >= 1200) return { Icon: Feather, color: 'text-[#8c6b38]', label: '羽毛' };
  return { Icon: Egg, color: 'text-[#c4ae88]', label: '蛋' };
};

export const getSliderBackground = (val: number, min: number, max: number) => { 
    const percentage = ((val - min) / (max - min)) * 100; 
    return `linear-gradient(to right, #5d4037 ${percentage}%, #d4b483 ${percentage}%)`; 
};

export const getCalculatedVisits = (diff: ExtendedDifficulty, customVal: number) => {
    switch (diff) {
        case 'Easy': return 1;    
        case 'Medium': return 10; 
        case 'Hard': return 100;  
        case 'Custom': return customVal; 
        default: return 10;
    }
};

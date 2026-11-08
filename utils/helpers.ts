import { Difficulty } from '../types';
import { Crown, Trophy, Feather, Egg } from 'lucide-react';

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

export const getAiRating = (diff: Difficulty): number => {
    if (diff === 'Easy') return 800;
    if (diff === 'Medium') return 1200;
    if (diff === 'Hard') return 1800;
    return 1300;
};

export const getRankBadge = (elo: number) => {
  if (elo >= 1800) return { Icon: Crown, color: 'text-yellow-500', label: '皇冠' };
  if (elo >= 1500) return { Icon: Trophy, color: 'text-gray-500', label: '奖杯' };
  if (elo >= 1200) return { Icon: Feather, color: 'text-[#8c6b38]', label: '羽毛' };
  return { Icon: Egg, color: 'text-[#b88742]', label: '蛋' };
};

export const getSliderBackground = (val: number, min: number, max: number) => {
    const percentage = ((val - min) / (max - min)) * 100;
    return `linear-gradient(to right, var(--cg-slider-fill, #5d4037) ${percentage}%, var(--cg-slider-track, #d4b483) ${percentage}%)`;
};

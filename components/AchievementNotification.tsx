import React from 'react';
import { Heart, Crown, Medal, Trophy } from 'lucide-react';
import { AchievementDef } from '../types';

interface AchievementNotificationProps {
    newUnlocked: AchievementDef | null;
    clearNewUnlocked: () => void;
}

export const AchievementNotification: React.FC<AchievementNotificationProps> = ({
    newUnlocked,
    clearNewUnlocked
}) => {
    return (
      <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 ease-spring ${newUnlocked ? 'translate-y-0 opacity-100' : '-translate-y-20 opacity-0 pointer-events-none'}`}>
        {newUnlocked && (
            <div className="relative group cursor-pointer" onClick={clearNewUnlocked}>
                {/* 外部光晕动画 */}
                <div className="absolute -inset-1 bg-gradient-to-r from-[#ffd700] via-[#ffecb3] to-[#ffd700] rounded-2xl blur opacity-75 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt"></div>
                
                {/* 主体卡片 */}
                <div className="relative bg-[#fff] bg-opacity-95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-[#ffd700]/50 flex items-center gap-4 min-w-[320px] overflow-hidden">
                    
                    {/* 左侧图标区 */}
                    <div className="relative shrink-0">
                        <div className="absolute inset-0 bg-[#ffd700] rounded-full blur opacity-40 animate-pulse"></div>
                        <div className="relative bg-gradient-to-br from-[#fff9c4] to-[#ffecb3] p-3 rounded-full border-2 border-[#ffc107] text-[#5c4033] shadow-md">
                            {newUnlocked.icon === 'Heart' && <Heart size={24} fill="#f44336" className="text-[#f44336] animate-heartbeat" />}
                            {newUnlocked.icon === 'Crown' && <Crown size={24} className="text-[#ff9800] animate-bounce-slow" />}
                            {newUnlocked.icon === 'Medal' && <Medal size={24} className="text-[#ff9800] animate-pulse" />}
                            {!['Heart', 'Crown', 'Medal'].includes(newUnlocked.icon) && <Trophy size={24} className="animate-bounce-slow" />}
                        </div>
                    </div>

                    {/* 中间文字区 */}
                    <div className="flex flex-col flex-grow">
                        <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[10px] font-black text-[#ff6f00] uppercase tracking-widest bg-[#ffecb3]/50 px-1.5 rounded border border-[#ffe082]">
                                Achievement Unlocked
                            </span>
                        </div>
                        <span className="text-lg font-black text-[#5c4033] leading-tight group-hover:text-[#ff6f00] transition-colors">{newUnlocked.name}</span>
                        <span className="text-xs font-medium text-[#8c6b38] line-clamp-1">{newUnlocked.description}</span>
                    </div>

                    {/* 右侧流光装饰 */}
                    <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-white/40 to-transparent skew-x-[-20deg] translate-x-full animate-shimmer-fast"></div>
                </div>
            </div>
        )}
      </div>
    );
};

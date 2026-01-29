import React from 'react';
import { X, Heart, Shield, Star, Lock, ChevronLeft, Check } from 'lucide-react';
import { TSUMEGO_DATA, TsumegoChapter, TsumegoLevel } from '../utils/tsumegoData';

interface TsumegoLevelSelectorProps {
    onClose: () => void;
    onSelectLevel: (level: TsumegoLevel) => void;
    unlockedLevelIds: string[];
    completedLevelIds: string[];
}

export const TsumegoLevelSelector: React.FC<TsumegoLevelSelectorProps> = ({
    onClose,
    onSelectLevel,
    unlockedLevelIds,
    completedLevelIds
}) => {
    // For now we only show Chapter 1
    const chapter = TSUMEGO_DATA[0];

    const getLevelStatus = (levelId: string) => {
        if (completedLevelIds.includes(levelId)) return 'completed';
        if (unlockedLevelIds.includes(levelId)) return 'unlocked';
        return 'locked';
    };

    return (
        <div className="fixed inset-0 bg-[#fcf6ea]/95 backdrop-blur-md z-[60] flex flex-col animate-in fade-in duration-300 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b-4 border-[#e3c086] bg-white/50 relative z-10">
                <div className="flex flex-col">
                    <h1 className="text-2xl font-black text-[#5c4033] flex items-center gap-2">
                         {chapter.title}
                    </h1>
                    <span className="text-sm font-bold text-[#8c6b38] opacity-70 tracking-wider">
                        {chapter.subtitle}
                    </span>
                </div>
                <button 
                    onClick={onClose}
                    className="w-12 h-12 rounded-2xl bg-white border-4 border-[#e3c086] flex items-center justify-center text-[#5c4033] hover:bg-[#e3c086] transition-colors active:scale-95 shadow-sm"
                >
                    <X size={24} />
                </button>
            </div>

            {/* Path View Container */}
            <div className="flex-1 overflow-y-auto px-6 py-12 relative flex flex-col items-center custom-scrollbar">
                
                {/* Visual Path Line (Solid Tree-like structure) */}
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-2 rounded-full overflow-hidden">
                    <div className="w-full h-full bg-gradient-to-b from-[#8c6b38]/10 via-[#8c6b38]/40 to-[#8c6b38]/10" />
                </div>
                
                {/* Secondary thick path for more "refined" look */}
                <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-1 bg-[#8c6b38]/20" />

                <div className="relative w-full max-w-sm flex flex-col items-center gap-16">
                    {chapter.levels.map((level, index) => {
                        const status = getLevelStatus(level.id);
                        const isLocked = status === 'locked' && (index === 0 ? !unlockedLevelIds.includes(level.id) : !completedLevelIds.includes(chapter.levels[index-1].id));
                        
                        // Alternate left/right offset for the "tree branch" look
                        const isEven = index % 2 === 0;
                        const offsetClass = isEven ? 'translate-x-[70px]' : '-translate-x-[70px]';
                        const lineClass = isEven ? 'right-full mr-2' : 'left-full ml-2';

                        return (
                            <div key={level.id} className={`flex items-center group transition-all duration-500 ${offsetClass}`}>
                                
                                {/* Connection Line to Center Path */}
                                <div className={`absolute top-1/2 -translate-y-1/2 w-16 h-1 bg-gradient-to-r ${isEven ? 'from-[#8c6b38]/10 to-[#8c6b38]/40' : 'from-[#8c6b38]/40 to-[#8c6b38]/10'} rounded-full`} 
                                     style={{ [isEven ? 'right' : 'left']: 'calc(100% - 12px)' }} 
                                />

                                <div className="flex flex-col items-center">
                                    <div className="relative">
                                        {/* Level Button */}
                                        <button
                                            onClick={() => !isLocked && onSelectLevel(level)}
                                            disabled={isLocked}
                                            className={`
                                                w-20 h-20 rounded-[28px] border-[5px] shadow-lg flex items-center justify-center relative z-10
                                                transition-all duration-300 active:scale-90
                                                ${status === 'completed' 
                                                    ? 'bg-gradient-to-br from-[#81c784] to-[#4caf50] border-[#2e7d32] text-white' 
                                                    : status === 'unlocked'
                                                        ? 'bg-gradient-to-br from-[#ffd54f] to-[#ffb300] border-[#f57c00] text-white shadow-[#ffb300]/30'
                                                        : 'bg-[#e0e0e0] border-[#bdbdbd] text-[#9e9e9e]'
                                                }
                                                ${isLocked ? 'cursor-not-allowed grayscale' : 'cursor-pointer hover:shadow-2xl hover:-translate-y-2'}
                                            `}
                                        >
                                            {status === 'completed' ? (
                                                <Check size={32} className="animate-in zoom-in duration-500" />
                                            ) : isLocked ? (
                                                <Lock size={28} />
                                            ) : (
                                                <span className="text-2xl font-black">{index + 1}</span>
                                            )}
                                            
                                            {/* Badge for Type */}
                                            <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-xl bg-white border-2 border-[#e3c086] flex items-center justify-center p-1 shadow-md">
                                                {index < 2 ? <Shield className="w-5 h-5 text-blue-500" /> : index < 6 ? <Star className="w-5 h-5 text-amber-500" /> : <Heart className="w-5 h-5 text-rose-500" />}
                                            </div>
                                        </button>

                                        {/* Pulse effect for current level */}
                                        {status === 'unlocked' && (
                                            <div className="absolute inset-x-0 inset-y-0 rounded-[28px] border-4 border-[#ffb300] animate-ping opacity-20" />
                                        )}
                                    </div>

                                    {/* Level Text */}
                                    <div className="mt-3 flex flex-col items-center bg-white/40 backdrop-blur-sm px-3 py-1.5 rounded-xl border border-white/50 shadow-sm min-w-[100px]">
                                        <span className="font-black text-[#5c4033] text-sm text-center leading-tight">
                                            {level.title}
                                        </span>
                                        <div className="flex gap-0.5 mt-1 scale-75">
                                            {[...Array(5)].map((_, i) => (
                                                <div 
                                                    key={i} 
                                                    className={`w-1.5 h-1.5 rounded-full ${i < level.difficulty ? 'bg-amber-400' : 'bg-[#5c4033]/10'}`}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Spacer */}
                <div className="h-32 w-full" />
            </div>

            {/* Bottom Decoration */}
            <div className="h-16 bg-gradient-to-t from-[#e3c086]/20 to-transparent pointer-events-none" />
        </div>
    );
};

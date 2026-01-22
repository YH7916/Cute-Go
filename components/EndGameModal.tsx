import React from 'react';
import { Trophy, RotateCcw, Eye } from 'lucide-react';
import { Player } from '../types';

interface EndGameModalProps {
    isOpen: boolean;
    winner: Player | null; 
    winReason: string;
    eloDiffText: string | null;
    eloDiffStyle: 'gold' | 'normal' | 'negative' | null;
    finalScore: {black: number, white: number} | null;
    onRestart: () => void;
    onReview: () => void;
}

export const EndGameModal: React.FC<EndGameModalProps> = ({
    isOpen,
    winner,
    winReason,
    eloDiffText,
    eloDiffStyle,
    finalScore,
    onRestart,
    onReview
}) => {
    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => {}} />
            <div className="bg-[#fcf6ea] rounded-3xl p-8 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] flex flex-col items-center text-center animate-in zoom-in duration-300 relative z-50">
                <div className="mb-4">
                    {winner === 'black' ? (
                        <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center shadow-lg border-4 border-gray-700">
                             <Trophy size={40} className="text-yellow-400" />
                        </div>
                    ) : (
                        <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg border-4 border-gray-200">
                             <Trophy size={40} className="text-yellow-500" />
                        </div>
                    )}
                </div>
                <h2 className="text-3xl font-black text-[#5c4033] mb-2">{winner === 'black' ? '黑方获胜!' : '白方获胜!'}</h2>
                <p className="text-[#8c6b38] font-bold mb-6 bg-[#e3c086]/30 px-3 py-1 rounded-full text-sm">{winReason}</p>
                {eloDiffText && (
                    <div className={`mb-4 text-lg font-black ${
                        eloDiffStyle === 'gold' ? 'text-yellow-500 animate-bounce' :
                        eloDiffStyle === 'negative' ? 'text-red-500' :
                        'text-[#2e7d32]'
                    } transition-all duration-300`}>积分 {eloDiffText}</div>
                )}
                {finalScore && (
                     <div className="flex gap-8 mb-6 text-sm font-bold text-[#5c4033]">
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-[#8c6b38] uppercase">黑方得分</span>
                            <span className="text-xl text-black">{finalScore.black}</span>
                        </div>
                        <div className="w-px bg-[#e3c086]"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-xs text-[#8c6b38] uppercase">白方得分</span>
                            <span className="text-xl text-gray-500">{finalScore.white}</span>
                        </div>
                     </div>
                )}
                <div className="flex flex-col gap-3 w-full">
                    <button onClick={onRestart} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <RotateCcw size={18} /> 再来一局
                    </button>
                    <button onClick={onReview} className="btn-retro btn-beige w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <Eye size={18} /> 复盘
                    </button>
                </div>
            </div>
        </div>
    );
};

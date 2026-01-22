import React from 'react';
import { AlertCircle, Play, SkipForward } from 'lucide-react';

interface PassConfirmationModalProps {
    consecutivePasses: number;
    gameOver: boolean;
    passNotificationDismissed: boolean;
    onDismiss: () => void;
    onPass: () => void;
}

export const PassConfirmationModal: React.FC<PassConfirmationModalProps> = ({
    consecutivePasses,
    gameOver,
    passNotificationDismissed,
    onDismiss,
    onPass
}) => {
    if (consecutivePasses !== 1 || gameOver || passNotificationDismissed) return null;

    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
            <div className="bg-[#fff8e1] border-4 border-[#cba367] text-[#5c4033] px-6 py-6 rounded-3xl shadow-2xl flex flex-col items-center animate-in zoom-in duration-300 w-64 pointer-events-auto">
                <div className="flex items-center gap-2 mb-4">
                    <AlertCircle size={28} className="text-[#cba367]" />
                    <span className="text-xl font-black">对手停着</span>
                </div>
                <p className="text-xs font-bold text-gray-500 text-center mb-6 leading-relaxed">对手认为无需再落子。<br/>点击空白处可继续。</p>
                <div className="flex flex-col gap-3 w-full">
                    <button onClick={onDismiss} className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <Play size={16} fill="currentColor" /> 继续
                    </button>
                    <button onClick={onPass} className="btn-retro btn-coffee w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2">
                        <SkipForward size={16} fill="currentColor" /> 结算
                    </button>
                </div>
            </div>
        </div>
    );
};

import React from 'react';
import { Trophy, Frown, ArrowRight, RotateCcw } from 'lucide-react';

interface TsumegoResultModalProps {
    isOpen: boolean;
    isCorrect: boolean;
    message: string;
    onNext: () => void;
    onRetry: () => void;
    onClose: () => void;
    hasNext: boolean;
}

const TsumegoResultModal: React.FC<TsumegoResultModalProps> = ({ 
    isOpen, isCorrect, message, onNext, onRetry, onClose, hasNext 
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
            <div className="bg-[#fcf6ea] rounded-3xl p-8 w-full max-w-sm shadow-2xl border-[6px] border-[#5c4033] flex flex-col items-center text-center animate-in zoom-in duration-300 relative z-50">
                
                {/* Close Button Removed as per request */}

                {/* Icon */}
                <div className="mb-4">
                    {isCorrect ? (
                        <div className="w-20 h-20 bg-[#f7e7ce] rounded-full flex items-center justify-center shadow-inner border-4 border-[#e3c086]">
                            <Trophy size={40} className="text-yellow-500 fill-current" />
                        </div>
                    ) : (
                        <div className="w-20 h-20 bg-[#f7e7ce] rounded-full flex items-center justify-center shadow-inner border-4 border-[#e3c086]">
                            <Frown size={40} className="text-[#8c6b38]" />
                        </div>
                    )}
                </div>

                {/* Title */}
                {/* Title */}
                <h2 className="text-2xl font-black text-[#5c4033] mb-2">
                    {isCorrect ? '正 解' : '结 束'}
                </h2>
                
                {/* Message */}
                <div className="bg-[#e3c086]/20 px-4 py-3 rounded-xl w-full mb-6">
                    <p className="text-[#8c6b38] font-bold text-base whitespace-pre-wrap leading-tight">
                        {message || (isCorrect ? "恭喜你，解开了这道题！" : "很遗憾，未能解开...")}
                    </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-3 w-full">
                    {isCorrect ? (
                        <div className="flex flex-col gap-3">
                            {hasNext && (
                                <button 
                                    onClick={onNext}
                                    className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-base shadow-lg hover:-translate-y-1 transition-all"
                                >
                                    <span>下一关</span>
                                    <ArrowRight size={18} strokeWidth={2.5} />
                                </button>
                            )}
                            <button 
                                onClick={onRetry}
                                className="btn-retro btn-beige w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-base opacity-90 hover:opacity-100"
                            >
                                <RotateCcw size={18} />
                                <span>再练一遍</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={onRetry}
                                className="btn-retro btn-brown w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 text-base shadow-lg hover:-translate-y-1 transition-all"
                            >
                                <RotateCcw size={18} strokeWidth={2.5} />
                                <span>立即重试</span>
                            </button>
                            
                            {hasNext && (
                                <button 
                                    onClick={onNext}
                                    className="text-[#8c6b38] font-bold text-sm mt-2 hover:underline flex items-center justify-center gap-1 opacity-70 hover:opacity-100 transition-opacity"
                                >
                                    <span>跳过，看下一题</span>
                                    <ArrowRight size={14} />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default TsumegoResultModal;

import React from 'react';
import { Cpu, AlertCircle, Zap } from 'lucide-react';

interface OfflineLoadingModalProps {
    isInitializing: boolean;
    isElectronAvailable: boolean;
    isFirstRun: boolean;
    onClose: () => void;
}

export const OfflineLoadingModal: React.FC<OfflineLoadingModalProps> = ({
    isInitializing,
    isElectronAvailable,
    isFirstRun,
    onClose
}) => {
    if (!isInitializing || !isElectronAvailable) return null;

    return (
        <div className="absolute inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
            <div className="bg-[#fcf6ea] rounded-3xl p-8 w-full max-w-sm shadow-2xl border-[6px] border-[#8c6b38] flex flex-col items-center text-center relative">
                
                {/* 加载图标 */}
                <div className="mb-6 relative">
                    <div className="w-16 h-16 border-4 border-[#e3c086] border-t-[#5c4033] rounded-full animate-spin"></div>
                    <Cpu size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[#5c4033]" />
                </div>

                <h2 className="text-2xl font-black text-[#5c4033] mb-3">
                    {isFirstRun ? "正在进行首次初始化" : "AI 引擎启动中..."}
                </h2>

                <div className="bg-[#e3c086]/20 p-4 rounded-xl border border-[#e3c086] mb-6">
                    {isFirstRun ? (
                        <>
                            <p className="text-sm font-bold text-[#8c6b38] leading-relaxed text-left">
                                <AlertCircle size={16} className="inline mr-1 mb-1"/>
                                系统正在配置神经网络模型。
                            </p>
                            <p className="text-xs font-bold text-[#5c4033]/80 mt-2 text-left">
                                首次运行可能需要 <span className="text-red-600 font-black">1-3 分钟</span> 进行硬件调优，请务必耐心等待，不要关闭程序。
                            </p>
                        </>
                    ) : (
                        <p className="text-sm font-bold text-[#8c6b38] leading-relaxed">
                             <Zap size={16} className="inline mr-1 mb-1"/>
                             正在加载模型权重，通常需要 5-10 秒。
                        </p>
                    )}
                </div>

                <button
                    onClick={onClose}
                    className="btn-retro btn-brown w-full py-3 rounded-xl font-bold text-sm opacity-80 hover:opacity-100"
                >
                    {isFirstRun ? "我知道了 (后台继续加载)" : "进入游戏"}
                </button>
            </div>
        </div>
    );
};

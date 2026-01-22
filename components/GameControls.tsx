import React from 'react';
import { RotateCcw, SkipForward, Play, Eraser, Undo2 } from 'lucide-react';
import { AppMode, HistoryItem, Player } from '../types';
import { getSliderBackground } from '../utils/helpers';

interface GameControlsProps {
    appMode: AppMode;
    setupTool: 'black' | 'white' | 'erase';
    setSetupTool: (tool: 'black' | 'white' | 'erase') => void;
    finishSetup: () => void;
    reviewIndex: number;
    history: HistoryItem[];
    setReviewIndex: (index: number) => void;
    setAppMode: (mode: AppMode) => void;
    setGameOver: (over: boolean) => void;
    handleUndo: () => void;
    handlePass: (isRemote: boolean) => void;
    resetGame: (keepOnline: boolean) => void;
    isThinking: boolean;
    gameOver: boolean;
    onlineStatus: 'disconnected' | 'connecting' | 'connected';
    currentPlayer: Player;
    myColor: Player | null;
    consecutivePasses: number;
}

export const GameControls: React.FC<GameControlsProps> = ({
    appMode,
    setupTool,
    setSetupTool,
    finishSetup,
    reviewIndex,
    history,
    setReviewIndex,
    setAppMode,
    setGameOver,
    handleUndo,
    handlePass,
    resetGame,
    isThinking,
    gameOver,
    onlineStatus,
    currentPlayer,
    myColor,
    consecutivePasses
}) => {
    return (
        <div className="mt-auto">
            {/* SETUP MODE CONTROLS */}
            {appMode === 'setup' && (
                <div className="grid grid-cols-4 gap-2 mb-2">
                    <button onClick={() => setSetupTool('black')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'black' ? 'bg-[#2a2a2a] text-[#f7e7ce] border-[#000]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <div className="w-4 h-4 rounded-full bg-black border border-gray-600 mb-1"></div>
                        <span className="text-[10px] font-bold">黑子</span>
                    </button>
                    <button onClick={() => setSetupTool('white')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'white' ? 'bg-[#fcf6ea] text-[#5c4033] border-[#e3c086]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <div className="w-4 h-4 rounded-full bg-white border border-gray-300 mb-1"></div>
                        <span className="text-[10px] font-bold">白子</span>
                    </button>
                    <button onClick={() => setSetupTool('erase')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'erase' ? 'bg-[#e57373] text-white border-[#d32f2f]' : 'bg-[#e3c086] text-[#5c4033] border-[#c4ae88]'}`}>
                        <Eraser size={16} className="mb-1" />
                        <span className="text-[10px] font-bold">擦除</span>
                    </button>
                     <button onClick={finishSetup} className="btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 bg-[#81c784] text-white border-[#388e3c]">
                        <Play size={16} className="mb-1" fill="currentColor"/>
                        <span className="text-[10px] font-bold">开始</span>
                    </button>
                </div>
            )}

            {/* REVIEW MODE CONTROLS */}
            {appMode === 'review' && (
                <div className="flex flex-col gap-3 mb-2 bg-[#fcf6ea] p-4 rounded-2xl border-2 border-[#e3c086] shadow-sm">
                     <div className="flex justify-between items-center text-xs font-bold text-[#8c6b38]">
                        <span>第 {reviewIndex} 手</span>
                        <span>共 {history.length} 手</span>
                     </div>
                     <input 
                        type="range" min="0" max={history.length > 0 ? history.length - 1 : 0} 
                        value={reviewIndex} onChange={(e) => setReviewIndex(parseInt(e.target.value))}
                        className="cute-range"
                        style={{ background: getSliderBackground(reviewIndex, 0, history.length > 0 ? history.length - 1 : 1) }}
                     />
                     <div className="flex gap-2">
                        <button onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))} className="btn-retro btn-beige flex-1 py-2 rounded-xl font-bold">上一步</button>
                        <button onClick={() => setReviewIndex(Math.min(history.length - 1, reviewIndex + 1))} className="btn-retro btn-beige flex-1 py-2 rounded-xl font-bold">下一步</button>
                        <button onClick={() => { setAppMode('playing'); setGameOver(true); }} className="btn-retro px-4 bg-[#e3c086] text-[#5c4033] border-[#c4ae88] rounded-xl py-2 font-bold">退出</button>
                     </div>
                </div>
            )}

            {/* PLAYING MODE CONTROLS */}
            {appMode === 'playing' && (
                <div className="grid grid-cols-3 gap-3">
                    <button onClick={handleUndo} disabled={history.length === 0 || isThinking || gameOver || onlineStatus === 'connected'} className="btn-retro btn-sand flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50">
                        <Undo2 size={20} /> <span className="text-xs">悔棋</span>
                    </button>
                    <button onClick={() => handlePass(false)} disabled={gameOver || (onlineStatus === 'connected' && currentPlayer !== myColor)} className={`btn-retro btn-coffee flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50 ${consecutivePasses === 1 ? 'animate-pulse' : ''}`}>
                        <SkipForward size={20} /> <span className="text-xs">{consecutivePasses === 1 ? '结算' : '停着'}</span>
                    </button>
                    <button onClick={() => resetGame(onlineStatus === 'connected')} className="btn-retro btn-beige flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold">
                        <RotateCcw size={20} /> <span className="text-xs">重开</span>
                    </button>
                </div>
            )}
        </div>
    );
};

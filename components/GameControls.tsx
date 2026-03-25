import React from 'react';
import { RotateCcw, SkipForward, Play, Eraser, Undo2, Lightbulb, Map, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight, LogOut } from 'lucide-react';
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
    showTerritory?: boolean;
    onToggleTerritory?: () => void;
    playClick?: () => void;
    gameMode?: string;
    gameType?: string;
    // Tsumego
    isTsumego?: boolean;
    hasPrevProblem?: boolean;
    hasNextProblem?: boolean;
    handlePrevProblem?: () => void;
    handleNextProblem?: () => void;
    handleHint?: () => void;
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
    consecutivePasses,
    showTerritory,
    onToggleTerritory,
    playClick,
    gameMode,
    gameType,
    // Tsumego Props
    isTsumego,
    hasPrevProblem,
    hasNextProblem,
    handlePrevProblem,
    handleNextProblem,
    handleHint
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
                <div className="flex flex-col gap-3 mb-2 bg-[#fcf6ea] p-4 rounded-3xl border-4 border-[#e3c086] shadow-xl relative overflow-hidden">
                     {/* Header / Slider */}
                     <div className="flex flex-col gap-1">
                         <div className="flex justify-between items-end text-[#8c6b38] px-1">
                            <span className="text-xs font-bold opacity-80">当前手数</span>
                            <span className="font-black text-xl font-mono text-[#5c4033] tracking-wider">
                                {reviewIndex} <span className="text-sm opacity-50 text-[#8c6b38] font-bold">/ {Math.max(0, history.length - 1)}</span>
                            </span>
                         </div>
                         <input 
                            type="range" min="0" max={history.length > 0 ? history.length - 1 : 0} 
                            value={reviewIndex} onChange={(e) => setReviewIndex(parseInt(e.target.value))}
                            className="cute-range w-full h-3 bg-[#e3c086]/30 rounded-full appearance-none cursor-pointer"
                            style={{ background: getSliderBackground(reviewIndex, 0, history.length > 0 ? history.length - 1 : 1) }}
                         />
                     </div>

                     {/* Main Control Row */}
                     <div className="flex items-center gap-2 mt-2">
                        <button 
                            onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))} 
                            disabled={reviewIndex === 0}
                            className="btn-retro btn-sand w-12 h-12 rounded-xl flex items-center justify-center disabled:opacity-50 transition-all active:scale-95 border-b-4 active:border-b-0 active:translate-y-1 shrink-0"
                        >
                            <ChevronLeft size={24} />
                        </button>
                        
                        <button 
                            onClick={() => setReviewIndex(Math.min(history.length - 1, reviewIndex + 1))} 
                            disabled={reviewIndex >= history.length - 1}
                            className="btn-retro btn-sand w-12 h-12 rounded-xl flex items-center justify-center disabled:opacity-50 transition-all active:scale-95 border-b-4 active:border-b-0 active:translate-y-1 shrink-0"
                        >
                            <ChevronRight size={24} />
                        </button>

                         <button 
                            onClick={() => {
                                const isAtEnd = reviewIndex === history.length - 1;
                                if (!isAtEnd) {
                                    setReviewIndex(history.length - 1);
                                    if (!showTerritory) onToggleTerritory?.();
                                } else {
                                    onToggleTerritory?.();
                                }
                            }}
                            className={`btn-retro h-12 px-4 rounded-xl font-bold flex flex-1 items-center justify-center gap-2 border-b-4 active:border-b-0 active:translate-y-1 transition-all ${
                                (showTerritory && reviewIndex === history.length - 1)
                                ? 'bg-[#5c4033] text-[#f7e7ce] border-[#3e2b22]' 
                                : 'bg-[#fff] text-[#8c6b38] border-[#e3c086] hover:bg-[#fff9e6]'
                            }`}
                        >
                            <Map size={18} />
                            <span>{(showTerritory && reviewIndex === history.length - 1) ? '隐藏' : '结果'}</span>
                        </button>

                         <button 
                            onClick={() => { setAppMode('playing'); setGameOver(true); }} 
                            className="btn-retro h-12 w-12 rounded-xl font-bold flex items-center justify-center border-[#c4ae88] bg-[#e3c086] text-[#5c4033] border-b-4 active:border-b-0 active:translate-y-1 hover:bg-[#d4b075] shrink-0"
                            title="退出"
                        >
                            <LogOut size={20} />
                        </button>
                     </div>
                </div>
            )}

            {/* PLAYING MODE CONTROLS */}
            {appMode === 'playing' && (
                <div className={`grid gap-3 ${isTsumego ? 'grid-cols-4' : 'grid-cols-3'}`}>
                    {/* Tsumego Specific Controls */}
                    {isTsumego ? (
                         <>
                            <button 
                                onClick={handlePrevProblem} 
                                disabled={!hasPrevProblem}
                                className="btn-retro btn-sand flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50 disabled:grayscale"
                            >
                                <SkipForward size={20} className="rotate-180" /> <span className="text-xs">上一题</span>
                            </button>
                            
                            <button 
                                onClick={handleHint} 
                                className="btn-retro btn-sand flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50"
                            >
                                <Lightbulb size={20} /> <span className="text-xs">提示</span>
                            </button>

                            <button 
                                onClick={handleUndo} 
                                disabled={history.length === 0 || isThinking || gameOver}
                                className="btn-retro btn-coffee flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50"
                            >
                                <Undo2 size={20} /> <span className="text-xs">撤销</span>
                            </button>

                            <button 
                                onClick={handleNextProblem} 
                                disabled={!hasNextProblem}
                                className="btn-retro btn-beige flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50 disabled:grayscale"
                            >
                                <SkipForward size={20} /> <span className="text-xs">下一题</span>
                            </button>
                         </>
                    ) : (
                        // Standard Go Controls
                        <>
                            <button onClick={handleUndo} disabled={history.length === 0 || isThinking || gameOver || onlineStatus === 'connected'} className="btn-retro btn-sand flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50">
                                <Undo2 size={20} /> <span className="text-xs">悔棋</span>
                            </button>
                            <button onClick={() => handlePass(false)} disabled={gameOver || isThinking || (onlineStatus === 'connected' && currentPlayer !== myColor)} className={`btn-retro btn-coffee flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold disabled:opacity-50 ${consecutivePasses === 1 ? 'animate-pulse' : ''}`}>
                                <SkipForward size={20} /> <span className="text-xs">{gameMode === 'PvAI' && gameType === 'Go' ? '结算' : (consecutivePasses === 1 ? '结算' : '停着')}</span>
                            </button>
                            <button onClick={() => resetGame(onlineStatus === 'connected')} className="btn-retro btn-beige flex flex-col items-center justify-center gap-1 p-3 rounded-2xl font-bold">
                                <RotateCcw size={20} /> <span className="text-xs">重开</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

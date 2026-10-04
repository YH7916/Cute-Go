import React from 'react';
import { Play, Eraser, Map, ChevronLeft, ChevronRight } from 'lucide-react';
import { GamePlayControls } from './GamePlayControls';
import { AppMode, HistoryItem, Player } from '../types';
import { getSliderBackground } from '../utils/helpers';
import { Button, Panel } from '../ui/common';

interface GameControlsProps {
    appMode: AppMode;
    setupTool: 'black' | 'white' | 'erase';
    setSetupTool: (tool: 'black' | 'white' | 'erase') => void;
    finishSetup: () => void;
    reviewIndex: number;
    history: HistoryItem[];
    setReviewIndex: (index: number) => void;
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
}

export const GameControls: React.FC<GameControlsProps> = ({
    appMode,
    setupTool,
    setSetupTool,
    finishSetup,
    reviewIndex,
    history,
    setReviewIndex,
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
    gameMode,
    gameType,
}) => {
    const undoDisabled = history.length === 0 || isThinking || gameOver || onlineStatus === 'connected';
    const passDisabled = gameOver || isThinking || (onlineStatus === 'connected' && currentPlayer !== myColor);
    const passLabel = gameMode === 'PvAI' && gameType === 'Go' ? '结算' : (consecutivePasses === 1 ? '结算' : '停着');
    const pass = () => handlePass(false);

    return (
        <div className="mt-auto">
            {/* SETUP MODE CONTROLS */}
            {appMode === 'setup' && (
                <div className="grid grid-cols-4 gap-2 mb-2">
                    <button onClick={() => setSetupTool('black')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'black' ? 'bg-[#2a2a2a] text-[#f7e7ce] border-[#000]' : 'bg-[#e3c086] text-[#5c4033] border-[#b88742]'}`}>
                        <div className="w-4 h-4 rounded-full bg-black border border-gray-600 mb-1"></div>
                        <span className="text-[10px] font-bold">黑子</span>
                    </button>
                    <button onClick={() => setSetupTool('white')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'white' ? 'bg-[#fcf6ea] text-[#5c4033] border-[#e3c086]' : 'bg-[#e3c086] text-[#5c4033] border-[#b88742]'}`}>
                        <div className="w-4 h-4 rounded-full bg-white border border-gray-300 mb-1"></div>
                        <span className="text-[10px] font-bold">白子</span>
                    </button>
                    <button onClick={() => setSetupTool('erase')} className={`btn-retro flex flex-col items-center justify-center p-2 rounded-2xl border-2 ${setupTool === 'erase' ? 'bg-[#e57373] text-white border-[#d32f2f]' : 'bg-[#e3c086] text-[#5c4033] border-[#b88742]'}`}>
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
                <div role="group" aria-label="复盘控制" className="flex items-center gap-2">
                    <Panel className="flex flex-1 min-w-0 h-11 items-center gap-1.5 px-1">
                        <Button
                            appearance="retro" variant="ghost" size="sm"
                            onClick={() => setReviewIndex(Math.max(0, reviewIndex - 1))}
                            disabled={reviewIndex === 0}
                            aria-label="上一手" title="上一手"
                            className="w-10 h-10 !p-0 flex items-center justify-center shrink-0"
                        >
                            <ChevronLeft size={20} />
                        </Button>
                        <input
                            type="range" min="0" max={history.length} aria-label="棋谱进度"
                            aria-valuetext={`第 ${reviewIndex} 手，共 ${history.length} 手`}
                            value={reviewIndex} onChange={(e) => setReviewIndex(parseInt(e.target.value))}
                            className="cute-range min-w-0 flex-1"
                            style={{
                                background: getSliderBackground(reviewIndex, 0, history.length > 0 ? history.length : 1),
                                touchAction: 'none',
                            }}
                        />
                        <span aria-hidden="true" className="shrink-0 whitespace-nowrap text-xs font-bold tabular-nums text-[#8c6b38]">
                            {reviewIndex}<span className="opacity-60"> / {history.length}</span>
                        </span>
                        <Button
                            appearance="retro" variant="ghost" size="sm"
                            onClick={() => setReviewIndex(Math.min(history.length, reviewIndex + 1))}
                            disabled={reviewIndex >= history.length}
                            aria-label="下一手" title="下一手"
                            className="w-10 h-10 !p-0 flex items-center justify-center shrink-0"
                        >
                            <ChevronRight size={20} />
                        </Button>
                    </Panel>

                         <button 
                            onClick={() => {
                                const isAtEnd = reviewIndex === history.length;
                                if (!isAtEnd) {
                                    setReviewIndex(history.length);
                                    if (!showTerritory) onToggleTerritory?.();
                                } else {
                                    onToggleTerritory?.();
                                }
                            }}
                            aria-label={showTerritory && reviewIndex === history.length ? '隐藏结果' : '查看结果'}
                            title={showTerritory && reviewIndex === history.length ? '隐藏结果' : '查看结果'}
                            className={`btn-retro h-11 w-11 shrink-0 rounded-xl font-bold flex items-center justify-center border-b-4 active:border-b-0 active:translate-y-1 transition-all ${
                                (showTerritory && reviewIndex === history.length)
                                ? 'bg-[#5c4033] text-[#f7e7ce] border-[#3e2b22]' 
                                : 'bg-[#fff] text-[#8c6b38] border-[#e3c086] hover:bg-[#fff9e6]'
                            }`}
                        >
                            <Map size={18} />
                        </button>

                </div>
            )}

            {/* PLAYING MODE CONTROLS */}
            {appMode === 'playing' && (
                <GamePlayControls undo={{ label: '悔棋', onClick: handleUndo, disabled: undoDisabled }}
                    primary={{ label: passLabel, onClick: pass, disabled: passDisabled, pulse: consecutivePasses === 1 }}
                    reset={{ label: '重开', onClick: () => resetGame(onlineStatus === 'connected') }} />
            )}
        </div>
    );
};

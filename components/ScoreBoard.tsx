import React from 'react';
import { Player, GameType, AppMode } from '../types';
import { RenderStoneIcon } from './common/RenderStoneIcon';
import { Map as MapIcon } from 'lucide-react';

interface ScoreBoardProps {
    currentPlayer: Player;
    blackCaptures: number;
    whiteCaptures: number;
    gameType: GameType;
    isThinking: boolean;
    showWinRate: boolean;
    appMode: AppMode;
    gameOver: boolean;
    userColor: Player;
    displayWinRate: number;
}

export const ScoreBoard: React.FC<ScoreBoardProps> = ({
    currentPlayer,
    blackCaptures,
    whiteCaptures,
    gameType,
    isThinking,
    showWinRate,
    appMode,
    gameOver,
    userColor,
    displayWinRate
}) => {
    return (
        <div className="flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-3">
                <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-300 ${currentPlayer === 'black' ? 'bg-[#5c4033] border-[#3e2b22] text-[#f7e7ce] shadow-md scale-105' : 'border-[#e3c086] bg-transparent opacity-60'}`}>
                    <div className="relative">
                        <RenderStoneIcon color="black" />
                        {currentPlayer === 'black' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                    <div className="flex flex-col">
                        <span className="font-bold text-sm">黑子</span>
                        {gameType === 'Go' && <span className="text-[10px] font-bold opacity-80">提子: {blackCaptures}</span>}
                    </div>
                </div>

                <div className={`flex items-center justify-end gap-3 px-4 py-3 rounded-2xl border-2 transition-all duration-300 ${currentPlayer === 'white' ? 'bg-[#fcf6ea] border-[#e3c086] text-[#5c4033] shadow-md scale-105' : 'border-[#e3c086] bg-transparent opacity-60'}`}>
                    <div className="flex flex-col items-end">
                        <span className="font-bold text-sm">白子</span>
                        {gameType === 'Go' && <span className="text-[10px] font-bold opacity-80">提子: {whiteCaptures}</span>}
                    </div>
                    <div className="relative">
                        <RenderStoneIcon color="white" />
                        {currentPlayer === 'white' && isThinking && <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-ping"></div>}
                    </div>
                </div>
            </div>

            {showWinRate && appMode === 'playing' && !gameOver && (
                <div className="relative w-full h-5 rounded-full overflow-hidden flex shadow-inner mt-2 border border-[#5c4033]/30">
                     {/* Win Rate Bar Visuals adapted for User Color */}
                    <div className="h-full bg-gradient-to-r from-[#2a2a2a] to-[#5c4033] transition-all duration-1000 ease-in-out relative flex items-center" style={{ width: `${userColor === 'white' ? (100 - displayWinRate) : displayWinRate}%` }}>
                         {userColor === 'black' && <span className="absolute right-2 text-[10px] font-bold text-white/90 whitespace-nowrap">{Math.round(displayWinRate)}%</span>}
                    </div>
                    <div className="h-full bg-gradient-to-r from-[#f0f0f0] to-[#ffffff] transition-all duration-1000 ease-in-out relative flex items-center justify-end" style={{ width: `${userColor === 'white' ? displayWinRate : (100 - displayWinRate)}%` }}>
                        {userColor === 'white' && <span className="absolute left-2 text-[10px] font-bold text-gray-600 whitespace-nowrap">{Math.round(displayWinRate)}%</span>}
                    </div>
                </div>
            )}

        </div>
    );
};

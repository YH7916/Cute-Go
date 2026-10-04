import React from 'react';
import { Player, GameType, AppMode } from '../types';
import { RenderStoneIcon } from './common/RenderStoneIcon';

interface ScoreBoardProps {
    currentPlayer: Player;
    blackCaptures: number;
    whiteCaptures: number;
    gameType: GameType;
    stoneSkin: string;
    isThinking: boolean;
    showWinRate: boolean;
    showCaptures?: boolean;
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
    stoneSkin,
    isThinking,
    showWinRate,
    showCaptures = true,
    appMode,
    gameOver,
    userColor,
    displayWinRate
}) => {
    const blackActive = currentPlayer === 'black';
    const whiteActive = currentPlayer === 'white';
    const blackCardClass = blackActive
        ? 'btn-retro btn-coffee shadow-md'
        : 'btn-retro btn-sand opacity-90';
    const whiteCardClass = whiteActive
        ? 'btn-retro btn-beige shadow-md'
        : 'btn-retro btn-beige opacity-90';

    return (
        <div className="flex flex-col gap-2.5">
            <div className="score-cards grid grid-cols-2 gap-3">
                <div className={`${blackCardClass} flex ${showCaptures ? 'h-16' : 'h-12'} items-center rounded-2xl px-2 sm:px-4 py-3 transition-all duration-300`}>
                    <div className="flex w-full items-center gap-1.5 sm:gap-2.5">
                        <div className="relative shrink-0">
                            <RenderStoneIcon color="black" stoneSkin={stoneSkin} />
                            {blackActive && isThinking && <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-yellow-400 animate-ping" />}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center">
                            <span className={`text-base font-black tracking-tight whitespace-nowrap ${blackActive ? 'text-[#f7e7ce]' : 'text-[#5d4037]'}`}>黑子</span>
                            {gameType === 'Go' && showCaptures && (
                                <span className={`text-xs font-bold whitespace-nowrap ${blackActive ? 'text-[#f7e7ce]/85' : 'text-[#7a5b49]'}`}>
                                    提子: {blackCaptures}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className={`${whiteCardClass} flex ${showCaptures ? 'h-16' : 'h-12'} items-center rounded-2xl px-2 sm:px-4 py-3 transition-all duration-300`}>
                    <div className="flex w-full items-center justify-end gap-1.5 sm:gap-2.5 text-right">
                        <div className="flex min-w-0 flex-1 flex-col justify-center items-end">
                            <span className="text-base font-black tracking-tight whitespace-nowrap text-[#5c4033]">白子</span>
                            {gameType === 'Go' && showCaptures && (
                                <span className="text-xs font-bold text-[#7a5b49] whitespace-nowrap">
                                    提子: {whiteCaptures}
                                </span>
                            )}
                        </div>
                        <div className="relative shrink-0">
                            <RenderStoneIcon color="white" stoneSkin={stoneSkin} />
                            {whiteActive && isThinking && <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-yellow-400 animate-ping" />}
                        </div>
                    </div>
                </div>
            </div>

            {showWinRate && appMode === 'playing' && !gameOver && (
                <div className="relative w-full h-5 rounded-full overflow-hidden flex shadow-inner mt-2 border border-[#5c4033]/30">
                     {/* Win Rate Bar Visuals adapted for User Color */}
                    <div className="winrate-fill-dark h-full transition-all duration-1000 ease-in-out relative flex items-center" style={{ width: `${userColor === 'white' ? (100 - displayWinRate) : displayWinRate}%` }}>
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

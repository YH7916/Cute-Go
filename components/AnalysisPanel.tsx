import React, { useDeferredValue } from 'react';
import { Map } from 'lucide-react';
import { Player } from '../types';

interface AnalysisPanelProps {
    winRate: number; // 0-100 (Black%)
    lead: number | null; // Positive = Black Lead
    isThinking: boolean;
    showTerritory: boolean;
    onToggleTerritory: () => void;
    userColor: Player;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
    winRate,
    lead,
    isThinking: _isThinking,
    showTerritory,
    onToggleTerritory,
    userColor
}) => {
    const deferredWinRate = useDeferredValue(Math.max(0, Math.min(100, winRate)));
    const deferredLead = useDeferredValue(lead);

    const blackWinRate = deferredWinRate;
    const leader: Player | null = deferredLead === null || Math.abs(deferredLead) < 0.05
        ? null
        : deferredLead > 0
            ? 'black'
            : 'white';
    const leadValue = deferredLead === null ? '--' : `${Math.abs(deferredLead).toFixed(1)}目`;
    const leadMatchesUser = leader !== null && leader === userColor;
    const leadText = deferredLead === null
        ? '--'
        : leader === null
            ? '局势接近'
            : `${leader === 'black' ? '黑' : '白'}领先 ${leadValue}`;

    const blackWidth = `${blackWinRate}%`;
    const leadTone = leadMatchesUser ? 'btn-beige' : 'btn-sand';

    return (
        <div className="rounded-2xl border-2 border-[#e3c086] bg-[#fcf6ea] p-2 shadow-md text-[#5c4033]">
            <div className="flex items-stretch gap-2">
                <div className={`btn-retro ${leadTone} flex h-10 shrink-0 items-center rounded-xl px-3`}>
                    <span className="whitespace-nowrap text-[12px] font-black tracking-tight text-[#5c4033]">
                        {leadText}
                    </span>
                </div>

                <div className="btn-retro btn-sand flex h-10 min-w-0 flex-1 items-center rounded-xl px-3">
                    <div className="flex h-full w-full min-w-0 -translate-y-[5px] flex-col justify-between py-[6px]">
                        <div className="flex items-center justify-between gap-2 px-0.5 text-[#5c4033]">
                            <span className="truncate text-[11px] font-black tracking-tight">
                                黑方胜率
                            </span>
                            <span className="shrink-0 font-mono text-[13px] font-black">
                                {Math.round(blackWinRate)}%
                            </span>
                        </div>
                        <div className="relative min-w-0 px-0.5">
                            <div className="winrate-track relative h-2.5 overflow-hidden rounded-full border">
                                <div
                                    className="winrate-fill-dark absolute inset-y-[1px] left-[1px] rounded-full transition-all duration-500 ease-out"
                                    style={{ width: blackWidth }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <button
                    onClick={onToggleTerritory}
                    title={showTerritory ? '隐藏领地' : '显示领地'}
                    aria-label={showTerritory ? '隐藏领地' : '显示领地'}
                    className={`btn-retro ${showTerritory ? 'btn-coffee' : 'btn-beige'} relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl`}
                >
                    <Map size={16} />
                    {showTerritory && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#9be26f]" />}
                </button>
            </div>
        </div>
    );
};


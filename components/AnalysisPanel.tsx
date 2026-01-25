import React from 'react';
import { Map, Zap, TrendingUp, AlertCircle } from 'lucide-react';
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
    isThinking,
    showTerritory,
    onToggleTerritory,
    userColor
}) => {
    // Determine display values based on user perspective?
    // User wants to see "My WinRate" or always Black?  
    // Traditional Go apps show Black WinRate.
    // But "Lead" is usually relative.
    // Let's stick to standard: WinRate = Black%, Lead = Black+ / White+
    
    // Visual Helper: Convert Lead to Text
    const getLeadText = () => {
        if (lead === null) return '--';
        if (lead === 0) return '平局';
        return lead > 0 ? `黑 +${lead.toFixed(1)}` : `白 +${Math.abs(lead).toFixed(1)}`;
    };

    const leadColor = lead && lead > 0 ? 'text-black' : 'text-gray-600';
    
    // Win Rate Bar Widths
    // If winRate is Black%, and we want a single bar:
    // [Black Part ---- White Part]
    
    return (
        <div className="bg-[#fcf6ea]/90 rounded-xl shadow-sm border border-[#e3c086] px-3 py-2 flex items-center justify-between gap-2 text-[#5c4033] select-none min-h-[48px] transition-all">
            
            {/* 1. Status / Lead */}
            <div className="flex items-center gap-2 shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isThinking ? 'bg-yellow-100' : 'bg-[#e3c086]/20'}`}>
                    {isThinking ? (
                        <Zap size={14} className="text-yellow-600 animate-pulse" />
                    ) : (
                        <TrendingUp size={16} className="text-[#8c6b38]" />
                    )}
                </div>
                
                <div className="flex flex-col leading-none gap-0.5">
                    <span className="text-[10px] font-bold opacity-60">AI 局势</span>
                    <span className={`text-sm font-black font-mono tracking-tight ${leadColor}`}>
                         {getLeadText()}
                    </span>
                </div>
            </div>

            {/* 2. WinRate Bar (Compact & Styled) */}
            <div className="flex-grow flex flex-col justify-center px-3 border-l border-r border-[#e3c086]/30 mx-1">
                <div className="flex justify-between items-end text-[10px] font-bold mb-1 opacity-90">
                    <span className="text-[#8c6b38]">黑胜率</span>
                    <span className="font-mono">{winRate.toFixed(1)}%</span>
                </div>
                <div className="w-full h-1.5 bg-[#e3c086]/30 rounded-full overflow-hidden ring-1 ring-[#e3c086]/20">
                    <div 
                        className="h-full bg-gradient-to-r from-[#5c4033] to-[#8c6b38] transition-all duration-700 ease-out" 
                        style={{ width: `${winRate}%` }} 
                    />
                </div>
            </div>

            {/* 3. Toggle Button (Icon Only - Square) */}
            <button 
                onClick={onToggleTerritory}
                title={showTerritory ? "隐藏领地" : "显示领地"}
                className={`w-9 h-9 shrink-0 rounded-lg flex items-center justify-center transition-all active:scale-95 ${
                    showTerritory 
                    ? 'bg-[#5c4033] text-[#f7e7ce] shadow-md border border-[#5c4033]' 
                    : 'bg-[#fffdf9] text-[#5c4033]/80 hover:bg-[#fff8e6] border border-[#e3c086] hover:border-[#8c6b38]'
                }`}
            >
                <div className="relative">
                     <Map size={18} />
                     {/* Dot indicating logic but minimal */}
                     {showTerritory && !isThinking && <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full border border-white" />}
                </div>
            </button>
        </div>
    );
};

// Helper for tiny active dot

